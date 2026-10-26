import type { Db } from "mongodb";
import type { Bond } from "@/lib/db/types";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";

/** What a wave of maturing sovereign bonds needs to know about its Treasuries, read once. */
export interface SovereignMaturityWave {
  /** Treasury cash in local currency when the bond phase reached the maturities. */
  phaseStartTreasuryCash: Map<string, number>;
  /** Budgets that already hold bank sovereign claims. */
  budgetsWithBankClaims: Set<string>;
  /** Maturity claims with a half-applied funding or payout receipt. */
  inFlightMaturityClaimIds: Set<string>;
}

/**
 * One projected budget read answers both questions the settlement used to ask
 * once per bond: does this Treasury already hold bank claims, and how much
 * spendable cash did it have when the phase reached this point. One read on the
 * status/kind index finds the maturities a crash left half-applied; partial
 * receipts are rare.
 */
export async function loadSovereignMaturityWave(
  db: Db,
  dueSovereignBonds: readonly Bond[]
): Promise<SovereignMaturityWave> {
  const wave: SovereignMaturityWave = {
    phaseStartTreasuryCash: new Map(),
    budgetsWithBankClaims: new Set(),
    inFlightMaturityClaimIds: new Set(),
  };
  if (dueSovereignBonds.length === 0) return wave;
  const dueBudgetIds = [
    ...new Set(
      dueSovereignBonds.flatMap((bond) =>
        bond.countryId ? [getNationalBudgetId(bond.countryId)] : []
      )
    ),
  ];
  const [budgetRows, partialReceipts] = await Promise.all([
    db
      .collection<{
        _id: string;
        treasuryCashLocal?: number | null;
        bankSovereignClaims?: Array<{ id?: string }>;
      }>("federalBudget")
      .find(
        { _id: { $in: dueBudgetIds } },
        { projection: { _id: 1, treasuryCashLocal: 1, "bankSovereignClaims.id": 1 } }
      )
      .toArray(),
    db
      .collection<{ _id: string }>("bankMoneyMoves")
      .find(
        {
          status: "partial",
          kind: { $in: ["sovereign_maturity_funding", "sovereign_maturity_payout"] },
        },
        { projection: { _id: 1 } }
      )
      .toArray(),
  ]);
  for (const row of budgetRows) {
    if (typeof row.treasuryCashLocal === "number")
      wave.phaseStartTreasuryCash.set(String(row._id), row.treasuryCashLocal);
    if ((row.bankSovereignClaims?.length ?? 0) > 0) wave.budgetsWithBankClaims.add(String(row._id));
  }
  for (const row of partialReceipts)
    wave.inFlightMaturityClaimIds.add(String(row._id).replace(/:(fund:.*|payout)$/, ""));
  return wave;
}

/**
 * A frozen claim that already asked for more spendable cash than its Treasury
 * held when the phase started cannot settle this turn: nothing in the bond
 * phase credits a Treasury after this point. Skipping it is the same outcome as
 * the guarded funding debit refusing it, without re-reading the budget, the
 * quote and the receipts on every turn the bond stays overdue.
 *
 * Never skipped: a claim that could still roll its pool float over (the
 * rollover can pay a zero cash residual), a paid claim whose payout is still
 * being published, an unfinished novation, and a claim with a half-applied
 * funding or payout receipt. Those must reach the code that resumes them.
 */
export function isUnfundableOverdueMaturity(
  bond: Bond,
  bondCurrency: string,
  wave: SovereignMaturityWave
): boolean {
  const claim = bond.sovereignMaturityClaim;
  if (!claim || !bond.countryId) return false;
  const disposition = claim.publicFloatDisposition;
  const requiredCashLocal =
    disposition?.mode === "novation" ? (disposition.residualAmountLocal ?? 0) : claim.amountLocal;
  const couldRollOver =
    !claim.forcedRollover &&
    claim.escrowLocal === 0 &&
    claim.fundingAttemptTurn === undefined &&
    (bond.restructureHaircutPercent ?? 0) === 0 &&
    bond.publicFloat > 0 &&
    (disposition?.mode !== "novation" || disposition.status === "applied") &&
    claim.holderLegs.some(
      (leg) => leg.collection === "bondMarketPools" && String(leg.filter._id) === bondCurrency
    );
  const inFlight =
    claim.paid === true ||
    wave.inFlightMaturityClaimIds.has(claim.id) ||
    (disposition?.mode === "novation" && disposition.status !== "applied");
  const phaseStartCash = wave.phaseStartTreasuryCash.get(getNationalBudgetId(bond.countryId));
  return (
    !couldRollOver &&
    !inFlight &&
    Number.isFinite(requiredCashLocal) &&
    (claim.escrowLocal ?? 0) < requiredCashLocal &&
    phaseStartCash !== undefined &&
    phaseStartCash < requiredCashLocal
  );
}

/**
 * Plan every due maturity first, so the payees of the whole wave can be read
 * once per holder kind. A retry pays the frozen quote, not today's snapshot, so
 * its payees are part of the same wave-wide read.
 */
export function planSovereignMaturityWave<Plan extends { holderLegs: Leg[] }, Leg>(
  dueSovereignBonds: readonly Bond[],
  build: (bond: Bond) => Plan | null
): { maturityPlans: Map<string, Plan>; waveLegs: Leg[][] } {
  const maturityPlans = new Map<string, Plan>();
  const waveLegs: Leg[][] = [];
  for (const bond of dueSovereignBonds) {
    const plan = build(bond);
    if (!plan) continue;
    maturityPlans.set(bond._id.toHexString(), plan);
    waveLegs.push(plan.holderLegs);
    const frozenLegs = bond.sovereignMaturityClaim?.holderLegs as Leg[] | undefined;
    if (frozenLegs?.length) waveLegs.push(frozenLegs);
  }
  return { maturityPlans, waveLegs };
}
