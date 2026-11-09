/**
 * Short-lane growth finance for AI companies.
 *
 * Live turn 677: player demand rose four to five times in twenty turns. Food,
 * retail, vehicles and advertising sold out at a profit, but 973 of 1,212 AI
 * companies sat below their cash floor. The existing-plant growth leg sizes off
 * cash above the floor, so it never sized at all, and an order that did size
 * could only borrow up to that same headroom. 3,221 sector build decisions died
 * as `insufficient_cash` while 279 were placed.
 *
 * With `nppShortageGrowthFinanceStage` on, a sector whose own output lane is
 * genuinely short (last turn's buyers got at most 75% of what they ordered) and
 * whose plant earns back a new unit inside the payback horizon may size one
 * growth step anyway and ask a bank to fund it. The bank's own underwriting,
 * collateral limit and reserves still decide; this only lets the request be
 * made and bounds it:
 *   - the company's own share of the order (about a quarter of its cost) is
 *     capped at its headroom over the floor or a quarter of the cash it holds,
 *     whichever is larger, and the order is sized to fit that;
 *   - total outstanding construction finance stays within a set number of
 *     turns of the company's average profit;
 *   - a separate per-turn cap ranks requests by pressure over payback.
 *
 * Plain data in, plain data out; the NPP shell loads the books and the loans.
 */
import { LOAN_ORIGINATION_FEE_FRACTION } from "@/lib/banking/rules/loanFees";
import { CAPACITY_BUILD_CANCEL_REFUND } from "@/lib/constants/capacityEconomy";
import { plantPressure } from "@/lib/market/producerMarket/shortageGrowthRules";

/** Buyers got at most 75% of what they ordered: asked / delivered >= 1 / 0.75. */
export const SHORTAGE_GROWTH_FINANCE_MIN_PRESSURE = 1.33;
/** Largest share of current cash a company may put into short-lane builds in one turn. */
export const SHORTAGE_GROWTH_FINANCE_CASH_SHARE = 0.25;
/**
 * Share of a financed order the company pays itself: the bank lends at most
 * the refundable construction basis, and its origination fee comes out of the
 * proceeds.
 */
export const SHORTAGE_GROWTH_FINANCE_CONTRIBUTION_SHARE =
  1 - CAPACITY_BUILD_CANCEL_REFUND * (1 - LOAN_ORIGINATION_FEE_FRACTION);
/** Sizing slack so dominance and whole-plant rounding on the real quote still fit the cash share. */
const SHORTAGE_GROWTH_FINANCE_SIZING_SLACK = 0.9;

export const SHORTAGE_GROWTH_FINANCE_DEFAULTS = Object.freeze({
  /**
   * Requests funded a turn on top of the ordinary construction-finance cap. A
   * financed sector is blocked until its build lands (13 turns for a short
   * food lane, 12 for retail), so about 500 short sectors drain at roughly 40
   * a turn after the first burst. 128 clears that burst in a few turns while
   * each request's bank transaction stays inside the corporation turn budget.
   */
  candidateLimit: 128,
  /** Turns of current sector profit a new unit must earn back within. */
  maxPaybackTurns: 100,
  /** Outstanding construction finance may not exceed this many turns of average profit. */
  maxExposureProfitTurns: 24,
});

export interface ShortageGrowthFinanceConfig {
  candidateLimit: number;
  maxPaybackTurns: number;
  maxExposureProfitTurns: number;
}

export interface ShortageGrowthFinanceConfigInput {
  nppShortageGrowthFinanceStage?: number | null;
  nppShortageGrowthFinanceCandidateLimit?: number | null;
  nppShortageGrowthFinanceMaxPaybackTurns?: number | null;
  nppShortageGrowthFinanceMaxExposureProfitTurns?: number | null;
}

function positiveOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Resolved settings when the stage is on; null keeps today's behaviour exactly. */
export function resolveShortageGrowthFinanceConfig(
  raw: ShortageGrowthFinanceConfigInput | null | undefined
): ShortageGrowthFinanceConfig | null {
  if (!((raw?.nppShortageGrowthFinanceStage ?? 0) >= 1)) return null;
  const d = SHORTAGE_GROWTH_FINANCE_DEFAULTS;
  return {
    candidateLimit: Math.floor(
      positiveOr(raw?.nppShortageGrowthFinanceCandidateLimit, d.candidateLimit)
    ),
    maxPaybackTurns: positiveOr(raw?.nppShortageGrowthFinanceMaxPaybackTurns, d.maxPaybackTurns),
    maxExposureProfitTurns: positiveOr(
      raw?.nppShortageGrowthFinanceMaxExposureProfitTurns,
      d.maxExposureProfitTurns
    ),
  };
}

type PressureProducts = Parameters<typeof plantPressure>[0];

/**
 * Last turn's book pressure on the lane a plant delivered most of. A receipt
 * from another world epoch, or a plant with no products, reads undefined.
 */
export function sectorBookPressure(
  receipt: { worldEpoch?: string | null; products?: PressureProducts } | null | undefined,
  worldEpoch: string | undefined,
  pressureByBook: ReadonlyMap<string, number> | undefined,
  shortestProduct = false
): number | undefined {
  if (!receipt || !worldEpoch || receipt.worldEpoch !== worldEpoch) return undefined;
  return plantPressure(receipt.products, pressureByBook, shortestProduct);
}

export type ShortageGrowthFinanceRejection =
  "not_short" | "unprofitable" | "unpriced" | "payback_too_long";

export type ShortageGrowthFinanceEvaluation =
  | { eligible: true; pressure: number; paybackTurns: number }
  | { eligible: false; reason: ShortageGrowthFinanceRejection };

/**
 * Whether one existing sector qualifies. Profit is the sector's per-turn
 * profit in the company's currency; payback is the per-unit build price over
 * the profit each unit of operating capacity earns a turn.
 */
export function evaluateShortageGrowthFinance(input: {
  config: ShortageGrowthFinanceConfig;
  pressure: number | undefined;
  sectorProfitLocal: number;
  operatingCapacityUnits: number;
  perUnitBuildCostLocal: number;
}): ShortageGrowthFinanceEvaluation {
  const pressure = input.pressure;
  if (
    typeof pressure !== "number" ||
    !Number.isFinite(pressure) ||
    pressure < SHORTAGE_GROWTH_FINANCE_MIN_PRESSURE
  )
    return { eligible: false, reason: "not_short" };
  if (
    !(Number.isFinite(input.sectorProfitLocal) && input.sectorProfitLocal > 0) ||
    !(Number.isFinite(input.operatingCapacityUnits) && input.operatingCapacityUnits > 0)
  )
    return { eligible: false, reason: "unprofitable" };
  if (!(Number.isFinite(input.perUnitBuildCostLocal) && input.perUnitBuildCostLocal > 0))
    return { eligible: false, reason: "unpriced" };
  const profitPerUnit = input.sectorProfitLocal / input.operatingCapacityUnits;
  const paybackTurns = input.perUnitBuildCostLocal / profitPerUnit;
  if (!(paybackTurns <= input.config.maxPaybackTurns))
    return { eligible: false, reason: "payback_too_long" };
  return { eligible: true, pressure, paybackTurns };
}

/**
 * Growth units to request. The cash-sized amount stands when cash covers more;
 * otherwise as much of one growth step (already capped at half the run rate
 * and the in-flight ceiling) as the company's cash share can carry, because
 * the bank funds the rest.
 */
export function shortageGrowthFinanceUnits(input: {
  cashSizedUnits: number;
  stepCapUnits: number;
  perUnitCostLocal: number;
  contributionLimitLocal: number;
}): number {
  const whole = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
  const cash = whole(input.cashSizedUnits);
  if (!(input.perUnitCostLocal > 0)) return cash;
  const fundable = whole(
    (Math.max(0, input.contributionLimitLocal) * SHORTAGE_GROWTH_FINANCE_SIZING_SLACK) /
      SHORTAGE_GROWTH_FINANCE_CONTRIBUTION_SHARE /
      input.perUnitCostLocal
  );
  return Math.max(cash, Math.min(whole(input.stepCapUnits), fundable));
}

/** Share of its cash a company at or under its floor may put into a short-lane financed build. */
export const SHORTAGE_GROWTH_FINANCE_FLOOR_HELD_CASH_SHARE = 0.1;

/**
 * Most of its own cash a company may contribute to a short-lane financed
 * build: its headroom above the floor, or a quarter of what it holds when that
 * is larger. Never more than it holds. With `floorHeld` (nppDividendAfterTaxStage
 * >= 2) a company at or under its floor puts in at most a tenth of its cash.
 */
export function shortageGrowthCashContributionLimit(
  cashLocal: number,
  cashFloorLocal: number,
  floorHeld = false
): number {
  if (!(Number.isFinite(cashLocal) && cashLocal > 0)) return 0;
  const floor = Number.isFinite(cashFloorLocal) ? cashFloorLocal : cashLocal;
  if (floorHeld && cashLocal <= floor)
    return cashLocal * SHORTAGE_GROWTH_FINANCE_FLOOR_HELD_CASH_SHARE;
  return Math.min(
    cashLocal,
    Math.max(cashLocal - floor, cashLocal * SHORTAGE_GROWTH_FINANCE_CASH_SHARE)
  );
}

/**
 * The growth leg's short-lane sizing in one call: null when the sector does
 * not qualify, else the financed growth units (the caller keeps the larger of
 * these and what cash alone sized) and the facts the shell ranks on.
 */
export function sizeShortageGrowthFinance<S>(
  finance: { config: ShortageGrowthFinanceConfig; pressureOf: (sector: S) => number | undefined },
  sector: S,
  facts: {
    sectorProfitLocal: number;
    operatingCapacityUnits: number;
    perUnitBuildCostLocal: number;
    stepCapUnits: number;
    cashLocal: number;
    cashFloorLocal: number;
  }
): { growthUnits: number; shortageGrowth: { pressure: number; paybackTurns: number } } | null {
  if (!(facts.stepCapUnits > 0)) return null;
  const verdict = evaluateShortageGrowthFinance({
    ...facts,
    config: finance.config,
    pressure: finance.pressureOf(sector),
  });
  if (!verdict.eligible) return null;
  return {
    growthUnits: shortageGrowthFinanceUnits({
      cashSizedUnits: 0,
      stepCapUnits: facts.stepCapUnits,
      perUnitCostLocal: facts.perUnitBuildCostLocal,
      contributionLimitLocal: shortageGrowthCashContributionLimit(
        facts.cashLocal,
        facts.cashFloorLocal
      ),
    }),
    shortageGrowth: { pressure: verdict.pressure, paybackTurns: verdict.paybackTurns },
  };
}

/** Ranking score: deeper shortage and faster payback first. */
export function shortageGrowthFinancePriority(pressure: number, paybackTurns: number): number {
  return pressure / Math.max(1, paybackTurns);
}

export interface ShortageGrowthFinanceCandidateFacts {
  corporationId: string;
  sectorId: string;
  pressure: number;
  paybackTurns: number;
  /** Loan principal this request would draw, in the company's currency. */
  principalLocal: number;
  /** Company cash this request would put in, in the company's currency. */
  contributionLocal: number;
  /** Most company cash the decision allowed for financed builds this turn. */
  cashContributionLimitLocal: number;
  unitsOrdered: number;
}

export interface ShortageGrowthFinanceExposure {
  /** Outstanding construction loans, company currency. */
  outstandingLocal: number;
  /** Average per-turn profit the lender underwrites on, company currency. */
  profitPerTurnLocal: number;
}

export type ShortageGrowthFinanceBoundRejection = "over_exposure" | "over_cash_share" | "over_cap";

/**
 * Pick which short-lane requests go to the banks this turn: best priority
 * first, each within its company's exposure and cash-share limits, up to the
 * cap. Stable ids break ties so a rerun picks the same set.
 */
export function boundShortageGrowthFinanceCandidates<T extends ShortageGrowthFinanceCandidateFacts>(
  candidates: readonly T[],
  config: Pick<ShortageGrowthFinanceConfig, "candidateLimit" | "maxExposureProfitTurns">,
  exposureOf: (corporationId: string) => ShortageGrowthFinanceExposure | undefined
): {
  selected: T[];
  rejected: Array<{ candidate: T; reason: ShortageGrowthFinanceBoundRejection }>;
} {
  const ordered = [...candidates].sort(
    (a, b) =>
      shortageGrowthFinancePriority(b.pressure, b.paybackTurns) -
        shortageGrowthFinancePriority(a.pressure, a.paybackTurns) ||
      b.unitsOrdered - a.unitsOrdered ||
      a.corporationId.localeCompare(b.corporationId) ||
      a.sectorId.localeCompare(b.sectorId)
  );
  const limit =
    Number.isSafeInteger(config.candidateLimit) && config.candidateLimit > 0
      ? config.candidateLimit
      : 0;
  const cashBudget = new Map<string, number>();
  for (const c of candidates)
    cashBudget.set(
      c.corporationId,
      Math.max(cashBudget.get(c.corporationId) ?? 0, Math.max(0, c.cashContributionLimitLocal))
    );
  const borrowed = new Map<string, number>();
  const contributed = new Map<string, number>();
  const selected: T[] = [];
  const rejected: Array<{ candidate: T; reason: ShortageGrowthFinanceBoundRejection }> = [];
  for (const candidate of ordered) {
    if (selected.length >= limit) {
      rejected.push({ candidate, reason: "over_cap" });
      continue;
    }
    const id = candidate.corporationId;
    const exposure = exposureOf(id);
    const ceiling = exposure
      ? Math.max(0, exposure.profitPerTurnLocal) * config.maxExposureProfitTurns
      : 0;
    const nextBorrowed =
      (exposure ? Math.max(0, exposure.outstandingLocal) : 0) +
      (borrowed.get(id) ?? 0) +
      Math.max(0, candidate.principalLocal);
    if (!(nextBorrowed <= ceiling)) {
      rejected.push({ candidate, reason: "over_exposure" });
      continue;
    }
    const nextContributed = (contributed.get(id) ?? 0) + Math.max(0, candidate.contributionLocal);
    if (!(nextContributed <= (cashBudget.get(id) ?? 0))) {
      rejected.push({ candidate, reason: "over_cash_share" });
      continue;
    }
    borrowed.set(id, (borrowed.get(id) ?? 0) + Math.max(0, candidate.principalLocal));
    contributed.set(id, nextContributed);
    selected.push(candidate);
  }
  return { selected, rejected };
}
