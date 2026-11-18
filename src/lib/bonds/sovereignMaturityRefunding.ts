/** Fund a frozen sovereign maturity from a journaled primary placement. */
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
  poolCashPerFace,
  primaryDocumentId,
  primarySettlementExists,
} from "./sovereignPrimarySettlement";
import { FORCED_ROLLOVER_MATURITY } from "./forcedSovereignRollover";
import {
  planSovereignMaturityRefunding,
  sovereignRefundingKey,
  type SovereignRefundingRefusal,
} from "./rules/sovereignMaturityRefunding";
import {
  sovereignRolloverBondId,
  sovereignRolloverBondShell,
  type SovereignRolloverBondIdentity,
} from "./sovereignRolloverBond";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { treasuryPaymentWitness } from "@/lib/budget/treasuryPaymentWitness";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { resumeSettlement, unfinishedSettlementFilter } from "@/lib/banking/settlementJournal";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";

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
  /** Frozen non-bank claim escrow and valuation for a direct market fill. */
  holderEscrow?: { escrowLocal: number; localPerAnchor: number };
  turn: number;
  now: Date;
  /** Add the issue to the issuer's shared rollover bond for the turn. */
  consolidateReplacement?: boolean;
}

const SCOPE_COUNTER = {
  bank: "sovereignMaturityClaim.refundedBankFaceLocal",
  holders: "sovereignMaturityClaim.refundedHolderFaceLocal",
} as const;

export type SovereignMaturityRefundingResult =
  | { status: "issued" | "replayed"; key: string; bondId: ObjectId; faceLocal: number }
  | { status: "refused"; key: string; refusal: SovereignRefundingRefusal | "not_settled" };

export async function recoverBankSovereignRefundingReceipts(
  db: Db,
  claimId: string
): Promise<boolean> {
  const pending = await bankMoneyMovesCollection<{ _id: string }>(db)
    .find(
      {
        _id: { $regex: `^sovereign-refunding:${claimId}:bank:` },
        ...unfinishedSettlementFilter(),
      },
      { projection: { _id: 1 } }
    )
    .sort({ createdAt: 1 })
    .toArray();
  for (const { _id } of pending) {
    const result = await resumeSettlement(db, _id);
    if (result.status !== "applied" && (result.status !== "replayed" || result.error)) return false;
  }
  return true;
}

export async function refundSovereignMaturityShortfall(
  db: Db,
  input: SovereignMaturityRefundingInput
): Promise<SovereignMaturityRefundingResult> {
  const key = sovereignRefundingKey(input.claimId, input.scope, input.turn);
  const shared: SovereignRolloverBondIdentity | null =
    input.consolidateReplacement === true &&
    input.sourceBond.issuerName &&
    input.sourceBond.corporationId &&
    Number.isFinite(input.couponRate)
      ? {
          countryId: input.countryId as CountryId,
          currencyCode: input.currencyCode,
          issuerName: input.sourceBond.issuerName,
          corporationId: input.sourceBond.corporationId,
          couponRate: input.couponRate,
          maturityTurns: FORCED_ROLLOVER_MATURITY,
          issuedAtTurn: input.turn,
        }
      : null;
  const bondId = shared ? sovereignRolloverBondId(shared) : primaryDocumentId(`${key}:0`);
  try {
    if (await primarySettlementExists(db, key)) {
      if (shared) {
        // The shared bond carries every refunding of the turn, so this sale's
        // own face is the one its cash receipt recorded.
        const receipt = await financialTxLogCollection<{ _id: ObjectId; meta?: { face?: number } }>(
          db
        ).findOne({ _id: primaryDocumentId(`${key}:receipt`) }, { projection: { meta: 1 } });
        return { status: "replayed", key, bondId, faceLocal: receipt?.meta?.face ?? 0 };
      }
      const issued = await bondsCollection(db).findOne(
        { _id: bondId },
        { projection: { totalIssued: 1 } }
      );
      return { status: "replayed", key, bondId, faceLocal: issued?.totalIssued ?? 0 };
    }
  } catch {
    // The receipt owns this turn's key. Recovery must finish any landed legs
    // before a later quote can use the claim's remaining cap.
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
  // Under the fiscal scale split the pool buys at book face times the scale,
  // the rate it was repaid at, so a refunding cycle neither drains nor inflates it.
  const cashPerUnitLocal = BOND_UNIT_FACE_VALUE * poolCashPerFace(accounting, input.countryId);
  const capacity = planSovereignUnderwriting({
    requestedUnits: Math.ceil(Math.max(0, input.shortfallLocal) / cashPerUnitLocal),
    poolCashLocal: Math.max(0, pool?.cashLocal ?? 0),
    appetite: pool?.appetiteByCountry?.[input.countryId as CountryId],
    pricePerUnitLocal: cashPerUnitLocal,
  });
  const plan = planSovereignMaturityRefunding({
    shortfallLocal: input.shortfallLocal,
    retiringFaceLocal: input.scopeOwedLocal,
    alreadyRefundedLocal: input.scopeRefundedLocal,
    marketCapacityUnits: capacity.placedUnits,
    cashPerUnitLocal,
  });
  if (plan.refusal) return { status: "refused", key, refusal: plan.refusal };
  if (input.followOn && plan.cashLocal < input.shortfallLocal)
    return { status: "refused", key, refusal: "no_market_capacity" };

  const { units, faceLocal, cashLocal } = plan;
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
  if (shared) {
    // The receipt's projection adds the units under the journal's replay
    // guard; it can only target a document that exists, so the first sale
    // of the turn creates the shared bond empty. Idempotent and safe under
    // concurrent writers: an upsert on a fixed id with no amounts.
    await bondsCollection(db).updateOne(
      { _id: bondId },
      {
        $setOnInsert: {
          ...sovereignRolloverBondShell(shared, input.now),
          totalIssued: 0,
          publicFloat: 0,
          requestedUnits: 0,
        },
      },
      { upsert: true }
    );
  }
  const issueProjection: TransitionProjection = shared
    ? {
        collection: "bonds",
        filter: { _id: bondId },
        update: {
          $inc: { totalIssued: faceLocal, publicFloat: units, requestedUnits: units },
          $set: { updatedAt: input.now },
        },
        note: "Refunding issue added to the issuer's shared rollover bond",
      }
    : {
        collection: "bonds",
        insert: refunding as unknown as Record<string, unknown>,
        note: "Refunding issue for an unfunded sovereign maturity",
      };
  const holderFunding = input.holderEscrow;
  const holderProjections: TransitionProjection[] = [];
  let route: Parameters<typeof commitSovereignPrimary>[4];
  if (holderFunding) {
    const remaining = input.scopeOwedLocal - holderFunding.escrowLocal;
    const routedLocal = Math.min(cashLocal, remaining);
    route = {
      kind: "holders",
      routedLocal,
      legs: [
        {
          kind: "credit",
          amount: routedLocal,
          collection: "bonds",
          filter: {
            _id: input.sourceBond._id,
            "sovereignMaturityClaim.id": input.claimId,
            "sovereignMaturityClaim.escrowLocal": holderFunding.escrowLocal,
          },
          path: "sovereignMaturityClaim.escrowLocal",
          note: "Route market proceeds to the frozen maturity claim",
        },
      ],
    };
    // Book the fiscal payment when the full escrow is ready for payout.
    // If Treasury cash is still needed, the separate funding receipt owns it.
    if (routedLocal === remaining) {
      holderProjections.push(
        {
          collection: "federalBudget",
          filter: { _id: input.budgetId },
          update: { $inc: { treasuryBalance: -input.scopeOwedLocal } },
          note: "Record fully market-funded principal payment in signed fiscal position",
        },
        ...treasuryPaymentWitness({
          key,
          country: input.countryId,
          currency: input.currencyCode,
          amount: 0,
          rate: holderFunding.localPerAnchor,
          turn: input.turn,
          signedPositionOwned: true,
          signedPositionAmount: input.scopeOwedLocal,
          txType: "gov_bond_maturity_payment",
          now: input.now,
        })
      );
    }
  } else if (input.followOn) {
    route = { kind: "bank", ...routeProceeds(input.followOn.legs, cashLocal, input.budgetId) };
  }
  try {
    await commitSovereignPrimary(
      db,
      {
        key,
        countryId: input.countryId,
        turn: input.turn,
        currency: input.currencyCode,
        budgetId: input.budgetId,
        poolCash: cashLocal,
        monetaryCash: 0,
        face: faceLocal,
        annualCoupon,
        now: input.now,
      },
      [
        issueProjection,
        {
          collection: "bonds",
          filter: { _id: input.sourceBond._id, "sovereignMaturityClaim.id": input.claimId },
          update: {
            $inc: {
              // The caps are the cash the claim owes, so the counters count cash.
              "sovereignMaturityClaim.refundedFaceLocal": cashLocal,
              [SCOPE_COUNTER[input.scope]]: cashLocal,
            },
            $set: { updatedAt: input.now },
          },
          note: "Record refunded face on the maturing claim",
        },
        ...(input.followOn?.projections ?? []),
        ...holderProjections,
      ],
      accounting,
      route
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
