/**
 * One sovereign bond's funded maturity, end to end: freeze its due-turn quote,
 * settle any bank sovereign claim standing on the same Treasury, then fund and
 * pay the bond's non-bank holders from that Treasury.
 *
 * This is the per-bond shell. It is the path for every maturity a country wave
 * cannot express as one move, and the reference the wave must reproduce: same
 * Treasury debit, same amount per payee, same bond fields, same ledger rows.
 */
import { ObjectId, type Db } from "mongodb";
import type { Bond, FederalBudget } from "@/lib/db/types";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { PartialTxEntry } from "@/lib/turn/bondTurnLedger";
import {
  addBankMaturityClaims,
  settleBankSovereignClaims,
} from "@/lib/banking/bankSovereignClaims";
import { resumeSettlement } from "@/lib/banking/settlementJournal";
import { readForcedRolloverFaceLocal } from "@/lib/bonds/forcedSovereignRollover";
import {
  freezeFundedSovereignBondMaturityQuote,
  marketSovereignRolloverCoupon,
  settleFundedSovereignBondMaturity,
} from "@/lib/bonds/sovereign";
import { refundSovereignMaturityShortfall } from "@/lib/bonds/sovereignMaturityRefunding";
import type { CountryId } from "@/lib/constants/countries";
import type { BankSovereignClaim } from "@/lib/db/types/budget";
import type { SovereignMaturityLiveTargets } from "@/lib/bonds/sovereignMaturityPayoutTargets";
import type { SovereignMaturityPlan } from "@/lib/bonds/sovereignMaturityWave";

export interface SovereignBondMaturitySettlementInput {
  db: Db;
  bond: Bond;
  plan: SovereignMaturityPlan;
  turn: number;
  now: Date;
  countryId: string;
  budgetId: string;
  bondCcy: CurrencyCode;
  /** Treasuries that already hold bank sovereign claims, cleared as they pay out. */
  budgetsWithBankClaims: Set<string>;
  /** Payee existence for the whole maturity wave, so this bond need not read it. */
  liveTargets?: SovereignMaturityLiveTargets;
}

/**
 * Settle one funded sovereign maturity. The caller has already locked the
 * bond, its Treasury and its holder targets. Returns the bond's ledger rows, or
 * null when the maturity did not settle this turn.
 */
export async function settleSovereignBondMaturityBond(
  input: SovereignBondMaturitySettlementInput
): Promise<PartialTxEntry[] | null> {
  const { db, bond, plan, turn, now, countryId, budgetId, bondCcy, budgetsWithBankClaims } = input;
  const { treasuryValuation, bankUnits, nonBankRepaymentLocal, holderLegs, maturityEntries } = plan;
  // Lock the bond-owned due quote before creating or paying bank claims.
  // A short Treasury can leave those claims pending across turns, so the
  // holder snapshot must already be immutable during that interval.
  await freezeFundedSovereignBondMaturityQuote(db, {
    bond,
    dueTurn: bond.maturityTurn,
    currencyCode: bondCcy,
    treasuryLocalPerAnchor: treasuryValuation.anchorRate,
    nonBankRepaymentLocal,
    holderLegs,
    now,
  });

  const newClaims = await addBankMaturityClaims(db, {
    budgetId,
    countryId: countryId,
    currencyCode: bondCcy,
    turn,
    bond,
    anchorRate: treasuryValuation.anchorRate,
    treasuryCashLedgerEnabled: true,
  });
  const bondIdHex = bond._id.toHexString();
  if (newClaims.length > 0 || bankUnits > 0 || budgetsWithBankClaims.has(budgetId)) {
    const budgetWithClaims = await db.collection<FederalBudget>("federalBudget").findOne(
      { _id: budgetId },
      {
        projection: {
          _id: 1,
          countryId: 1,
          bankSovereignClaims: 1,
          treasuryCashLocal: 1,
          treasuryBalance: 1,
        },
      }
    );
    const book = budgetWithClaims?.bankSovereignClaims ?? [];
    const dueClaims = book.filter(
      (claim) => claim.kind === "maturity" && claim.bondId === bondIdHex
    );
    if (dueClaims.length > 0) {
      const refinanced = await refundBankMaturityShortfall(db, {
        bond,
        dueClaims,
        budget: budgetWithClaims!,
        countryId,
        budgetId,
        bondCcy,
        turn,
        now,
      });
      const paid = await settleBankSovereignClaims(db, refinanced ?? budgetWithClaims!, turn);
      const paidIds = new Set(paid?.paidClaimIds ?? []);
      // A claim is only pulled once its payout landed, so the paid ids are
      // the same answer the old per-bond re-read of the whole book gave.
      if (!dueClaims.every((claim) => paidIds.has(claim.id))) return null;
      if (book.every((claim) => paidIds.has(claim.id))) budgetsWithBankClaims.delete(budgetId);
    }
  }
  // Claims returned by this attempt or removed by an earlier completed
  // receipt both represent bank lots already paid from funded Treasury cash.
  void newClaims;

  let fundedSettlement = await settleFundedSovereignBondMaturity(db, {
    bond,
    turn,
    dueTurn: bond.maturityTurn,
    currencyCode: bondCcy,
    treasuryLocalPerAnchor: treasuryValuation.anchorRate,
    nonBankRepaymentLocal,
    holderLegs,
    liveTargets: input.liveTargets,
    now,
  });
  if (
    fundedSettlement?.status === "partial" ||
    (fundedSettlement?.status === "replayed" && fundedSettlement.error)
  )
    fundedSettlement = await resumeSettlement(db, fundedSettlement.key);
  if (
    !fundedSettlement ||
    (fundedSettlement.status !== "applied" &&
      !(fundedSettlement.status === "replayed" && !fundedSettlement.error))
  )
    return null;

  // A forced rollover moved the pool's face to a replacement bond, so that
  // face was never paid out of Treasury cash. The settlement already knows
  // that face; only a resumed receipt has to read it back.
  const forcedRolloverFaceLocal =
    fundedSettlement.forcedRolloverFaceLocal ?? (await readForcedRolloverFaceLocal(db, bond));
  const paidLocal = nonBankRepaymentLocal - forcedRolloverFaceLocal;

  return [
    ...maturityEntries,
    {
      type: "gov_bond_maturity_payment",
      turn,
      createdAt: now,
      subjectType: "government",
      countryId: countryId,
      amount: -paidLocal,
      currencyCode: bondCcy,
      anchorAmount: -paidLocal / treasuryValuation.anchorRate,
      meta: {
        bondId: bond._id.toHexString(),
        units: paidLocal / BOND_UNIT_FACE_VALUE,
        couponRate: bond.couponRate,
        treasuryCashMovement: true,
        ...treasuryValuation,
      },
    },
  ];
}

type ClaimBudget = Pick<
  FederalBudget,
  "_id" | "countryId" | "bankSovereignClaims" | "treasuryCashLocal" | "treasuryBalance"
>;

/**
 * Bank lots on a matured bond are paid through the claim book, which funds
 * each claim's escrow from Treasury cash. When that cash cannot cover this
 * bond's unfunded bank claims, the Treasury refinances the gap with a
 * refunding issue before the book is swept, so the bank (or its open failure
 * estate) is paid principal on time. Returns the re-read budget when cash
 * landed, so the sweep's own pre-check sees it; otherwise null.
 */
async function refundBankMaturityShortfall(
  db: Db,
  input: {
    bond: Bond;
    dueClaims: readonly BankSovereignClaim[];
    budget: ClaimBudget;
    countryId: string;
    budgetId: string;
    bondCcy: CurrencyCode;
    turn: number;
    now: Date;
  }
): Promise<ClaimBudget | null> {
  const { bond, dueClaims, budget, countryId, budgetId, bondCcy, turn, now } = input;
  const claimId = `sovereign-maturity:${bond._id.toHexString()}:${bond.maturityTurn}`;
  const stored = await db
    .collection<Bond>("bonds")
    .findOne(
      { _id: bond._id },
      { projection: { totalIssued: 1, sovereignMaturityClaim: 1, matured: 1 } }
    );
  const quote = stored?.sovereignMaturityClaim;
  if (!stored || stored.matured || quote?.id !== claimId) return null;
  const alreadyPaid = new Set(quote.paidBankClaimIds ?? []);
  const unpaid = dueClaims.filter((claim) => !alreadyPaid.has(claim.id));
  if (unpaid.length === 0) return null;
  const banks = await db
    .collection<{ _id: ObjectId; bankSovereignEscrows?: Record<string, { amountLocal?: number }> }>(
      "corporations"
    )
    .find(
      {
        _id: {
          $in: [...new Set(unpaid.map((claim) => claim.bankId))]
            .filter((hex) => ObjectId.isValid(hex))
            .map((hex) => new ObjectId(hex)),
        },
      },
      { projection: Object.fromEntries(unpaid.map((c) => [`bankSovereignEscrows.${c.id}`, 1])) }
    )
    .toArray();
  const escrowed = (claim: BankSovereignClaim) =>
    banks.find((row) => String(row._id) === claim.bankId)?.bankSovereignEscrows?.[claim.id]
      ?.amountLocal ?? 0;
  const needLocal = unpaid.reduce(
    (sum, claim) => sum + Math.max(0, claim.amountLocal - escrowed(claim)),
    0
  );
  const cash = budget.treasuryCashLocal ?? 0;
  if (needLocal <= cash) return null;
  const refunded = await refundSovereignMaturityShortfall(db, {
    sourceBond: bond,
    claimId,
    retiringFaceLocal: stored.totalIssued,
    alreadyRefundedLocal: quote.refundedFaceLocal ?? 0,
    shortfallLocal: needLocal - cash,
    countryId,
    budgetId,
    currencyCode: bondCcy,
    couponRate: await marketSovereignRolloverCoupon(db, countryId as CountryId),
    scope: "bank",
    turn,
    now,
  });
  if (refunded.status === "refused") return null;
  return db.collection<FederalBudget>("federalBudget").findOne(
    { _id: budgetId },
    {
      projection: {
        _id: 1,
        countryId: 1,
        bankSovereignClaims: 1,
        treasuryCashLocal: 1,
        treasuryBalance: 1,
      },
    }
  );
}
