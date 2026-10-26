import { ObjectId, type Db } from "mongodb";
import type { Bond } from "@/lib/db/types";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import type { treasuryAnchorValuation } from "@/lib/budget/rules/treasuryAccrual";
import type { PartialTxEntry } from "@/lib/turn/bondTurnLedger";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type {
  BankingTransition,
  TransitionLeg,
  TransitionProjection,
} from "@/lib/banking/rules/boundary";
import { refusedPublicFloatDisposition } from "@/lib/bonds/publicFloatSovereignNovation";
import { planPublicFloatNovation } from "@/lib/bonds/rules/publicFloatNovation";
import {
  sovereignMaturityBondRetireProjection,
  sovereignMaturityBudgetRetirementInc,
  type SovereignMaturityRetirementFigures,
} from "@/lib/bonds/sovereignMaturityRetirement";
import type { SovereignMaturityCashLeg } from "@/lib/bonds/sovereignMaturityPayoutTargets";

/** Everything one sovereign maturity settles, built before any money moves. */
export interface SovereignMaturityPlan {
  treasuryValuation: NonNullable<ReturnType<typeof treasuryAnchorValuation>>;
  /** The bond's treasury currency; every leg and the funding debit are in it. */
  currencyCode: CurrencyCode;
  bankUnits: number;
  nonBankRepaymentLocal: number;
  holderLegs: SovereignMaturityCashLeg[];
  maturityEntries: PartialTxEntry[];
}

/** What a wave of maturing sovereign bonds needs to know about its Treasuries, read once. */
export interface SovereignMaturityWave {
  /** Treasury cash in local currency when the bond phase reached the maturities. */
  phaseStartTreasuryCash: Map<string, number>;
  /** Budgets that already hold bank sovereign claims. */
  budgetsWithBankClaims: Set<string>;
  /** Maturity claims with a half-applied funding or payout receipt. */
  inFlightMaturityClaimIds: Set<string>;
  /** Country waves a crash left half-applied, oldest receipt first per country. */
  partialWaveReceipts: Map<string, SovereignMaturityWaveReceipt[]>;
  /** Bonds a half-applied wave receipt still owns; the per-bond path must not touch them. */
  waveOwnedBondIds: Set<string>;
}

/** One country wave receipt a crash left unfinished. */
export interface SovereignMaturityWaveReceipt {
  key: string;
  /** Bond ids named by the receipt's own legs. */
  bondIds: string[];
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
    partialWaveReceipts: new Map(),
    waveOwnedBondIds: new Set(),
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
  await loadPartialWaveReceipts(db, wave);
  return wave;
}

/** Receipt key of a country's funding or payout move for one settlement turn. */
export function sovereignMaturityWaveKey(
  countryId: string,
  turn: number,
  leg: "fund" | "payout"
): string {
  return `sovereign-maturity-wave:${countryId}:${turn}:${leg}`;
}

/**
 * Waves a crash interrupted. A country wave is one receipt for a whole
 * Treasury, so a half-applied one owns every bond it names until it finishes:
 * re-running it finishes exactly the legs and retirements it froze, and paying
 * those bonds again on the per-bond keys would move the money twice. One
 * anchored-prefix read on the `_id` index, and only when partial receipts exist
 * at all.
 */
async function loadPartialWaveReceipts(db: Db, wave: SovereignMaturityWave): Promise<void> {
  const rows = await db
    .collection<{
      _id: string;
      legs?: Array<{
        kind?: string;
        collection?: string;
        path?: string;
        filter?: { _id?: unknown };
      }>;
    }>("bankMoneyMoves")
    .find(
      { _id: { $regex: "^sovereign-maturity-wave:" }, status: "partial" },
      {
        projection: {
          _id: 1,
          "legs.kind": 1,
          "legs.collection": 1,
          "legs.path": 1,
          "legs.filter._id": 1,
        },
      }
    )
    .toArray();
  if (rows.length === 0) return;
  for (const row of rows) {
    const key = String(row._id);
    const countryId = key.split(":")[1] ?? "";
    const bondIds = (row.legs ?? []).flatMap((leg) =>
      leg.collection === "bonds" &&
      leg.path === "sovereignMaturityClaim.escrowLocal" &&
      leg.filter?._id !== undefined
        ? [String(leg.filter._id)]
        : []
    );
    const receipts = wave.partialWaveReceipts.get(countryId);
    const receipt = { key, bondIds };
    if (receipts) receipts.push(receipt);
    else wave.partialWaveReceipts.set(countryId, [receipt]);
    for (const id of bondIds) wave.waveOwnedBondIds.add(id);
  }
  for (const receipts of wave.partialWaveReceipts.values())
    receipts.sort((a, b) => a.key.localeCompare(b.key));
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
export function planSovereignMaturityWave<Plan extends { holderLegs: readonly unknown[] }>(
  dueSovereignBonds: readonly Bond[],
  build: (bond: Bond) => Plan | null
): { maturityPlans: Map<string, Plan>; waveLegs: Array<Plan["holderLegs"]> } {
  const maturityPlans = new Map<string, Plan>();
  const waveLegs: Array<Plan["holderLegs"]> = [];
  for (const bond of dueSovereignBonds) {
    const plan = build(bond);
    if (!plan) continue;
    maturityPlans.set(bond._id.toHexString(), plan);
    waveLegs.push(plan.holderLegs);
    const frozenLegs = bond.sovereignMaturityClaim?.holderLegs;
    if (frozenLegs?.length) waveLegs.push(frozenLegs as unknown as Plan["holderLegs"]);
  }
  return { maturityPlans, waveLegs };
}

/** One Treasury's maturing sovereign bonds, settled as one journaled move. */
export interface SovereignMaturityWaveCountry {
  countryId: string;
  budgetId: string;
  currencyCode: CurrencyCode;
  localPerAnchor: number;
  /** Due bonds in bond-phase order, with the plan built for each. */
  bonds: Array<{ bond: Bond; plan: SovereignMaturityPlan }>;
}

/**
 * A disposition a wave can carry: the claim pays cash and no pool float was
 * accepted. A bond with no public float always freezes exactly this, and an
 * earlier turn's refusal is the same field, so the batch writes it directly.
 */
export function isCashSovereignMaturityDisposition(
  disposition: NonNullable<Bond["sovereignMaturityClaim"]>["publicFloatDisposition"]
): boolean {
  return (
    disposition !== undefined &&
    disposition.mode === "cash" &&
    disposition.status === "refused" &&
    disposition.acceptedUnits === 0
  );
}

/**
 * The disposition a bond with no pool float freezes: cash, nothing accepted.
 * `planPublicFloatNovation` refuses `no_source_units` before it ever looks at
 * pool appetite, so this needs no reads and matches the per-bond freeze.
 */
export function noPublicFloatMaturityDisposition(currencyCode: CurrencyCode): {
  mode: "cash";
  status: "refused";
  acceptedUnits: 0;
  refusal: string;
} {
  return refusedPublicFloatDisposition(
    planPublicFloatNovation({
      sourceUnits: 0,
      sourceCurrency: currencyCode,
      replacementCurrency: currencyCode,
      sourceFacePerUnitLocal: BOND_UNIT_FACE_VALUE,
      replacementPricePerUnitLocal: BOND_UNIT_FACE_VALUE,
      appetite: undefined,
      maturityTurns: 0,
    }),
    true
  );
}

/**
 * A bond a country wave can carry: the plain funded maturity. Everything else
 * keeps the per-bond path, because the batch cannot express it without changing
 * what the player sees:
 *
 * - a pool float that can be novated into a replacement bond (the novation
 *   writes a new bond and rebases the source, so it is not a cash move),
 * - a forced rollover or an unfinished novation already on the claim,
 * - a funding or payout receipt a crash left half applied (it must be resumed),
 * - bank lots, which settle through the claim book and its escrow, and
 * - a Treasury whose phase-start cash cannot cover the whole wave, where the
 *   per-bond path may roll individual bonds over.
 */
export function sovereignMaturityWaveIneligibility(
  bond: Bond,
  plan: SovereignMaturityPlan,
  wave: SovereignMaturityWave,
  budgetId: string
): string | undefined {
  if (!bond.countryId) return "no-country";
  if (!Number.isSafeInteger(bond.maturityTurn)) return "due-turn";
  if (plan.bankUnits > 0) return "bank-lots";
  if (wave.budgetsWithBankClaims.has(budgetId)) return "bank-claims";
  if (wave.waveOwnedBondIds.has(bond._id.toHexString())) return "wave-receipt-in-flight";
  if (bond.publicFloat > 0) return "public-float";
  const claim = bond.sovereignMaturityClaim;
  if (claim) {
    const claimId = `sovereign-maturity:${bond._id.toHexString()}:${bond.maturityTurn}`;
    if (claim.id !== claimId) return "claim-id";
    if (claim.dueTurn !== bond.maturityTurn) return "claim-due-turn";
    if (claim.currencyCode !== plan.currencyCode) return "claim-currency";
    if (claim.amountLocal !== plan.nonBankRepaymentLocal) return "claim-amount";
    if (claim.escrowLocal !== 0) return "claim-funded";
    if (claim.fundingAttemptTurn !== undefined) return "claim-funding-attempt";
    if (claim.paid === true) return "claim-paid";
    if (claim.forcedRollover) return "forced-rollover";
    if (!isCashSovereignMaturityDisposition(claim.publicFloatDisposition))
      return "public-float-disposition";
    if (wave.inFlightMaturityClaimIds.has(claim.id)) return "receipt-in-flight";
  }
  const cashAtStart = wave.phaseStartTreasuryCash.get(budgetId);
  if (cashAtStart === undefined) return "treasury-cash-unknown";
  if (!(plan.nonBankRepaymentLocal >= 0) || !Number.isFinite(plan.nonBankRepaymentLocal))
    return "amount-not-finite";
  if (cashAtStart < plan.nonBankRepaymentLocal) return "treasury-short";
  // The per-bond freezer throws on these; keep that failure on the per-bond path.
  if (
    !(plan.treasuryValuation.anchorRate > 0) ||
    !Number.isFinite(plan.treasuryValuation.anchorRate)
  )
    return "valuation-not-finite";
  if (plan.holderLegs.some((leg) => !Number.isFinite(leg.amount) || leg.amount < 0))
    return "holder-leg-amount";
  if (bond.currencyCode && bond.currencyCode !== plan.currencyCode) return "bond-currency";
  return undefined;
}

/**
 * Split the due maturities into country waves and per-bond leftovers. A wave
 * carries a whole country or nothing: one Treasury, one funding debit, one
 * payout move. Bonds on a receipt a crash left half applied are in neither
 * list, since only that receipt may finish them.
 */
export function planSovereignMaturityCountryWaves(
  dueSovereignBonds: readonly Bond[],
  maturityPlans: ReadonlyMap<string, SovereignMaturityPlan>,
  wave: SovereignMaturityWave
): { waves: SovereignMaturityWaveCountry[]; perBond: Bond[] } {
  const byCountry = new Map<string, Array<{ bond: Bond; plan: SovereignMaturityPlan }>>();
  for (const bond of dueSovereignBonds) {
    if (!bond.countryId) continue;
    const plan = maturityPlans.get(bond._id.toHexString());
    if (!plan) continue;
    if (wave.waveOwnedBondIds.has(bond._id.toHexString())) continue;
    const group = byCountry.get(bond.countryId);
    if (group) group.push({ bond, plan });
    else byCountry.set(bond.countryId, [{ bond, plan }]);
  }
  const waves: SovereignMaturityWaveCountry[] = [];
  const perBond: Bond[] = [];
  for (const [countryId, group] of byCountry) {
    const budgetId = getNationalBudgetId(countryId);
    const currencyCode = group[0]!.plan.currencyCode;
    const localPerAnchor = group[0]!.plan.treasuryValuation.anchorRate;
    // One debit funds the whole wave, so the whole wave must be affordable on
    // the cash the phase already read. A short Treasury keeps the per-bond path,
    // which is the one that may roll an individual bond over instead.
    const waveTotal = group.reduce(
      (sum, row) =>
        sum + (row.bond.sovereignMaturityClaim?.amountLocal ?? row.plan.nonBankRepaymentLocal),
      0
    );
    const cashAtStart = wave.phaseStartTreasuryCash.get(budgetId);
    const eligible =
      group.length >= 2 &&
      cashAtStart !== undefined &&
      waveTotal <= cashAtStart &&
      group.every(
        (row) =>
          row.plan.currencyCode === currencyCode &&
          row.plan.treasuryValuation.anchorRate === localPerAnchor &&
          sovereignMaturityWaveIneligibility(row.bond, row.plan, wave, budgetId) === undefined
      );
    if (!eligible) {
      for (const row of group) perBond.push(row.bond);
      continue;
    }
    waves.push({
      countryId,
      budgetId,
      currencyCode,
      localPerAnchor,
      bonds: group,
    });
  }
  return { waves, perBond };
}

/**
 * One Treasury debit funds every bond in the wave: the summed principal leaves
 * Treasury cash once and lands in each bond's own immutable claim escrow. One
 * projection keeps the signed fiscal position in step, as the per-bond funding
 * moved it once per bond.
 */
export function sovereignMaturityWaveFundingTransition(input: {
  wave: SovereignMaturityWaveCountry;
  turn: number;
  now: Date;
}): BankingTransition {
  const { wave, turn } = input;
  const valuation = { currencyCode: wave.currencyCode, localPerAnchor: wave.localPerAnchor };
  const claims = input.wave.bonds.map(({ bond }) => {
    const claim = bond.sovereignMaturityClaim;
    if (!claim) throw new Error("Sovereign maturity wave requires a frozen due quote");
    return { bond, claim };
  });
  const totalLocal = claims.reduce((sum, row) => sum + row.claim.amountLocal, 0);
  return {
    key: sovereignMaturityWaveKey(wave.countryId, turn, "fund"),
    kind: "sovereign_maturity_funding",
    turn,
    currency: wave.currencyCode,
    legs: [
      {
        kind: "debit",
        amount: totalLocal,
        valuation,
        collection: "federalBudget",
        filter: {
          _id: wave.budgetId,
          treasuryCashLocal: { $gte: totalLocal },
        },
        path: "treasuryCashLocal",
        note: "Fund the whole sovereign maturity wave from Treasury cash",
      },
      ...claims.map(({ bond, claim }) => ({
        kind: "credit" as const,
        amount: claim.amountLocal,
        valuation,
        collection: "bonds",
        filter: {
          _id: bond._id,
          "sovereignMaturityClaim.id": claim.id,
          "sovereignMaturityClaim.escrowLocal": claim.escrowLocal,
        },
        path: "sovereignMaturityClaim.escrowLocal",
        note: "Hold funded sovereign maturity cash in its immutable bond claim",
      })),
    ],
    projections: [
      {
        collection: "federalBudget",
        filter: { _id: wave.budgetId },
        update: { $inc: { treasuryBalance: -totalLocal } },
        note: "Record funded sovereign principal payment in signed fiscal position",
      },
    ],
    event: {
      kind: "monetary.executed",
      command: "turn.sovereign.maturity.waveFund",
      subjectType: "government",
      subjectId: wave.countryId,
      amount: totalLocal,
      meta: { bonds: claims.length },
    },
  };
}

/**
 * One credit per payee for the whole wave, the same amounts summed across that
 * payee's bonds, behind one escrow debit and one retirement per bond. The debit
 * legs stay per bond because each has its own frozen claim guard, and they are
 * independent targets, so the journal delivers them in one batch.
 */
export function sovereignMaturityWavePayoutTransition(input: {
  wave: SovereignMaturityWaveCountry;
  turn: number;
  now: Date;
  /** Index of this bond chunk's receipt within the country wave. */
  chunk: number;
  /** The payout legs `buildSovereignMaturityPayoutLegs` produced for each bond. */
  payoutLegsByBond: ReadonlyMap<string, readonly TransitionLeg[]>;
  /** The debt each bond retires, from `sovereignMaturityRetirementFigures`. */
  figuresByBond: ReadonlyMap<string, SovereignMaturityRetirementFigures>;
}): BankingTransition {
  const { wave, turn, now } = input;
  const debits: TransitionLeg[] = [];
  const credits = new Map<string, TransitionLeg>();
  let totalLocal = 0;
  for (const { bond } of wave.bonds) {
    const legs = input.payoutLegsByBond.get(bond._id.toHexString()) ?? [];
    for (const leg of legs) {
      if (leg.kind === "debit") {
        debits.push(leg);
        totalLocal += leg.amount;
        continue;
      }
      // The same payee can hold several of the country's bonds, and the per-bond
      // path credited it once per bond. One summed credit leaves the same cash
      // behind, so only the leg count changes. Different valuations stay apart:
      // their amounts are in different currencies and cannot be added.
      const id = leg.filter?._id;
      const key = [
        leg.collection,
        id instanceof ObjectId ? id.toHexString() : String(id),
        leg.path,
        leg.valuation?.currencyCode,
        leg.valuation?.localPerAnchor,
      ].join("\u0000");
      const existing = credits.get(key);
      if (existing) {
        existing.amount += leg.amount;
        continue;
      }
      credits.set(key, { ...leg, filter: { ...leg.filter } });
    }
  }
  const budgetInc: Record<string, number> = {};
  const retirements: TransitionProjection[] = [];
  for (const { bond } of wave.bonds) {
    const claim = bond.sovereignMaturityClaim;
    const figures = input.figuresByBond.get(bond._id.toHexString());
    if (!claim || !figures)
      throw new Error("Sovereign maturity wave payout requires a frozen due quote");
    for (const [path, value] of Object.entries(sovereignMaturityBudgetRetirementInc(figures)))
      budgetInc[path] = (budgetInc[path] ?? 0) + value;
    retirements.push(
      sovereignMaturityBondRetireProjection({
        bond,
        quote: claim,
        claimId: claim.id,
        dueTurn: bond.maturityTurn,
        sourceCountryId: wave.countryId,
        figures,
        turn,
        now,
      })
    );
  }
  return {
    key: `${sovereignMaturityWaveKey(wave.countryId, turn, "payout")}:${input.chunk}`,
    kind: "sovereign_maturity_payout",
    turn,
    currency: wave.currencyCode,
    batchIndependentDebits: true,
    legs: [...debits, ...credits.values()],
    projections: [
      {
        collection: "federalBudget",
        filter: { _id: wave.budgetId },
        update: { $inc: budgetInc, $set: { updatedAt: now } },
        note: "Retire matured sovereign debt after funded payouts",
      },
      ...retirements,
    ],
    event: {
      kind: "monetary.executed",
      command: "turn.sovereign.maturity.wavePayout",
      subjectType: "government",
      subjectId: wave.countryId,
      amount: totalLocal,
      meta: { bonds: wave.bonds.length },
    },
  };
}
