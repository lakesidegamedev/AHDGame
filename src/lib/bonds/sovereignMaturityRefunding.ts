/**
 * Refund a matured sovereign claim the Treasury cannot pay from cash: sell a
 * new par bond to the currency's bond pool and credit the proceeds to the
 * Treasury's spendable cash, so the ordinary funded maturity path can pay
 * every holder on time.
 *
 * The sale is one primary placement through the same settlement journal as
 * scheduled issuance (pool cash debit, Treasury cash credit, principal and
 * coupon projections, ledger witnesses), plus a projection that records the
 * refunded face on the maturing claim in the same receipt. A bank claim's
 * refunding also carries the escrow funding legs in that receipt, so the
 * proceeds can never sit in Treasury cash where other outflows spend them. The key is per
 * claim, scope and turn: a replay in the same turn returns the receipt that
 * already landed, and a later turn may only refund what the claim's cap still
 * allows. See rules/sovereignMaturityRefunding.ts for the debt-ceiling rule.
 */
import type { Db, ObjectId } from "mongodb";
import type { TransitionLeg, TransitionProjection } from "@/lib/banking/rules/boundary";
import type { Bond } from "@/lib/db/types";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import { planSovereignUnderwriting, readPoolForPrimary } from "./primaryMarket";
import {
  commitSovereignPrimary,
  loadPrimaryAccounting,
  primaryDocumentId,
  primarySettlementExists,
} from "./sovereignPrimarySettlement";
import { FORCED_ROLLOVER_MATURITY } from "./forcedSovereignRollover";
import {
  planSovereignMaturityRefunding,
  sovereignRefundingKey,
  type SovereignRefundingRefusal,
} from "./rules/sovereignMaturityRefunding";

export interface SovereignMaturityRefundingInput {
  /** The maturing bond; its issuer identity is copied onto the refunding issue. */
  sourceBond: Pick<Bond, "_id" | "countryId" | "corporationId" | "issuerName">;
  claimId: string;
  shortfallLocal: number;
  countryId: string;
  budgetId: string;
  currencyCode: CurrencyCode;
  couponRate: number;
  scope: "bank" | "holders";
  /**
   * Cash this scope of the claim owes in total, and what earlier refundings
   * already raised for it. Bounds every refunding ever made for the scope, so
   * proceeds that went astray can never be re-borrowed without limit.
   */
  scopeOwedLocal: number;
  scopeRefundedLocal: number;
  /**
   * Legs and projections that carry the proceeds straight on to the claim in
   * the same receipt (the bank claim escrow funding). When present the issue
   * must cover the whole shortfall or nothing is sold, because the follow-on
   * debit needs the full amount in Treasury cash.
   */
  followOn?: { legs: TransitionLeg[]; projections: TransitionProjection[] };
  turn: number;
  now: Date;
}

const SCOPE_COUNTER = {
  bank: "sovereignMaturityClaim.refundedBankFaceLocal",
  holders: "sovereignMaturityClaim.refundedHolderFaceLocal",
} as const;

export type SovereignMaturityRefundingResult =
  | { status: "issued" | "replayed"; key: string; bondId: ObjectId; faceLocal: number }
  | { status: "refused"; key: string; refusal: SovereignRefundingRefusal | "not_settled" };

export async function refundSovereignMaturityShortfall(
  db: Db,
  input: SovereignMaturityRefundingInput
): Promise<SovereignMaturityRefundingResult> {
  const key = sovereignRefundingKey(input.claimId, input.scope, input.turn);
  const bondId = primaryDocumentId(`${key}:0`);
  try {
    if (await primarySettlementExists(db, key)) {
      const issued = await db
        .collection<Bond>("bonds")
        .findOne({ _id: bondId }, { projection: { totalIssued: 1 } });
      return { status: "replayed", key, bondId, faceLocal: issued?.totalIssued ?? 0 };
    }
  } catch {
    // A rejected or still-settling receipt owns this turn's key. Nothing new
    // may be sold under it; the next turn opens a fresh attempt.
    return { status: "refused", key, refusal: "not_settled" };
  }
  if (!Number.isFinite(input.couponRate) || input.couponRate < 0)
    return { status: "refused", key, refusal: "invalid_input" };

  const [pool, accounting] = await Promise.all([
    readPoolForPrimary(db, input.currencyCode),
    loadPrimaryAccounting(db),
  ]);
  // The funded cash ledger is the only world a maturity claim pays from, and
  // it forbids central-bank minting: the market is the only buyer.
  if (accounting.treasuryCashLedgerEnabled !== true)
    return { status: "refused", key, refusal: "invalid_input" };
  const capacity = planSovereignUnderwriting({
    requestedUnits: Math.ceil(Math.max(0, input.shortfallLocal) / BOND_UNIT_FACE_VALUE),
    poolCashLocal: Math.max(0, pool?.cashLocal ?? 0),
    appetite: pool?.appetiteByCountry?.[input.countryId as CountryId],
    pricePerUnitLocal: BOND_UNIT_FACE_VALUE,
  });
  const plan = planSovereignMaturityRefunding({
    shortfallLocal: input.shortfallLocal,
    retiringFaceLocal: input.scopeOwedLocal,
    alreadyRefundedLocal: input.scopeRefundedLocal,
    marketCapacityUnits: capacity.placedUnits,
  });
  if (plan.refusal) return { status: "refused", key, refusal: plan.refusal };
  if (input.followOn && plan.faceLocal < input.shortfallLocal)
    return { status: "refused", key, refusal: "no_market_capacity" };

  const { units, faceLocal } = plan;
  const annualCoupon = (faceLocal * input.couponRate) / 100;
  const refunding: Bond = {
    _id: bondId,
    issuerType: "sovereign",
    corporationId: input.sourceBond.corporationId,
    countryId: input.sourceBond.countryId,
    issuerName: input.sourceBond.issuerName,
    faceValue: BOND_UNIT_FACE_VALUE,
    couponRate: input.couponRate,
    maturityTurns: FORCED_ROLLOVER_MATURITY,
    issuedAtTurn: input.turn,
    maturityTurn: input.turn + FORCED_ROLLOVER_MATURITY,
    marketPrice: 1,
    totalIssued: faceLocal,
    publicFloat: units,
    holders: [],
    defaulted: false,
    defaultedAtTurn: null,
    matured: false,
    restructureHaircutPercent: null,
    restructureExtendedMaturityTurn: null,
    originalMaturityTurn: null,
    originalTotalIssued: null,
    currencyCode: input.currencyCode,
    requestedUnits: units,
    unsoldUnits: 0,
    primaryFillRatio: 1,
    refundsSovereignMaturityClaimId: input.claimId,
    createdAt: input.now,
    updatedAt: input.now,
  };
  try {
    await commitSovereignPrimary(
      db,
      {
        key,
        countryId: input.countryId,
        turn: input.turn,
        currency: input.currencyCode,
        budgetId: input.budgetId,
        poolCash: faceLocal,
        monetaryCash: 0,
        face: faceLocal,
        annualCoupon,
        now: input.now,
      },
      [
        {
          collection: "bonds",
          insert: refunding as unknown as Record<string, unknown>,
          note: "Refunding issue for an unfunded sovereign maturity",
        },
        {
          collection: "bonds",
          filter: { _id: input.sourceBond._id, "sovereignMaturityClaim.id": input.claimId },
          update: {
            $inc: {
              "sovereignMaturityClaim.refundedFaceLocal": faceLocal,
              [SCOPE_COUNTER[input.scope]]: faceLocal,
            },
            $set: { updatedAt: input.now },
          },
          note: "Record refunded face on the maturing claim",
        },
        ...(input.followOn?.projections ?? []),
      ],
      accounting,
      input.followOn ? routeProceeds(input.followOn.legs, faceLocal, input.budgetId) : undefined
    );
  } catch {
    // The pool cash guard refused or the receipt is still settling: no new
    // cash this turn. The settlement recovery worker owns a partial receipt.
    return { status: "refused", key, refusal: "not_settled" };
  }
  return { status: "issued", key, bondId, faceLocal };
}

/**
 * Net a follow-on escrow funding against the sale in one receipt. The escrows
 * are credited in full; the sale's proceeds cover as much as they can and the
 * Treasury's existing cash covers the rest. Proceeds above the escrows (unit
 * rounding) stay in Treasury cash. The journal runs debits before credits, so
 * the Treasury debit is sized to cash that already exists.
 */
function routeProceeds(
  followOnLegs: readonly TransitionLeg[],
  faceLocal: number,
  budgetId: string
): { routedLocal: number; legs: TransitionLeg[] } {
  const credits = followOnLegs.filter((leg) => leg.kind === "credit");
  const owed = credits.reduce((sum, leg) => sum + leg.amount, 0);
  const routedLocal = Math.min(faceLocal, owed);
  const fromTreasury = owed - routedLocal;
  return {
    routedLocal,
    legs: [
      ...(fromTreasury > 0
        ? [
            {
              kind: "debit" as const,
              amount: fromTreasury,
              collection: "federalBudget",
              filter: { _id: budgetId },
              path: "treasuryCashLocal",
              note: "Treasury cash share of a refinanced bank claim escrow",
            },
          ]
        : []),
      ...credits,
    ],
  };
}
