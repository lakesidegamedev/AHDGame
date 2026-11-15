/**
 * Command Economy v2 (P0) — SOE plan-fulfillment kernels.
 *
 * Pure, deterministic, NaN-guarded helpers over the {@link SoeState} overlay
 * carried on state-owned-enterprise corporations. Plan fulfillment (output /
 * target) is the score a director is judged on and the aggregate feeds the
 * endogenous-marketization drift (weak SOEs → reform pressure). Kept separate
 * from DB I/O so the command-economy turn phase can compose them.
 */

import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { SoeState } from "@/lib/db/types/corporation";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { capacityPricePerUnit, CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import { CAPITAL_DEPRECIATION_PER_TURN } from "@/lib/market/capital";

const clamp = (v: number, lo: number, hi: number): number =>
  !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v));

/** A healthy SOE meets its plan (fulfillment = 1.0). This is the drift baseline. */
export const SOE_PERF_BASELINE = 1.0;
/** Capacity headroom over the plan target at seed (matches the 10% sector convention). */
const SOE_CAPACITY_HEADROOM = 1.1;
/** Ceiling on reported plan fulfillment so a runaway overshoot can't dominate the mean. */
export const MAX_PLAN_FULFILLMENT = 2.0;

/**
 * Plan fulfillment for one SOE = output / planTarget, clamped to
 * [0, MAX_PLAN_FULFILLMENT]. A target of 0 (or non-finite) → SOE_PERF_BASELINE
 * (no information, treat as on-plan so it neither adds nor relieves pressure).
 */
export function planFulfillment(soe: Pick<SoeState, "output" | "planTarget">): number {
  const target = soe.planTarget;
  if (!Number.isFinite(target) || target <= 0) return SOE_PERF_BASELINE;
  const out = Number.isFinite(soe.output) ? soe.output : 0;
  return clamp(out / target, 0, MAX_PLAN_FULFILLMENT);
}

/**
 * Aggregate (mean) plan fulfillment across a country's SOEs. Empty set →
 * SOE_PERF_BASELINE.
 *
 * This is the DIRECTOR'S SCORE and the dashboard readout: how the enterprises
 * did against the quota the Gosplan chair actually set. It is deliberately NOT
 * what drives the marketization dial — see {@link aggregateCapacityUtilisation}.
 */
export function aggregatePlanFulfillment(
  soes: ReadonlyArray<Pick<SoeState, "output" | "planTarget">>
): number {
  if (soes.length === 0) return SOE_PERF_BASELINE;
  let sum = 0;
  for (const soe of soes) sum += planFulfillment(soe);
  return sum / soes.length;
}

/**
 * Capacity utilisation for one SOE = output / capacity, clamped to
 * [0, MAX_PLAN_FULFILLMENT]. Capacity of 0 (or non-finite) → SOE_PERF_BASELINE
 * (no information; neither adds nor relieves pressure).
 */
function capacityUtilisation(soe: Pick<SoeState, "output" | "capacity">): number {
  const capacity = soe.capacity;
  if (!Number.isFinite(capacity) || capacity <= 0) return SOE_PERF_BASELINE;
  const out = Number.isFinite(soe.output) ? soe.output : 0;
  return clamp(out / capacity, 0, MAX_PLAN_FULFILLMENT);
}

/**
 * Aggregate (mean) capacity utilisation across a country's SOEs, the `soePerf`
 * fed to marketization drift.
 *
 * Uses capacity, not plan fulfillment, because `planTarget` is PLAYER-SET: a
 * planner could pick the denominator of their own grade and steer a world
 * scalar. Capacity is not writable by the planner, so the dial keys off what
 * the enterprises physically did with the plant they have.
 */
export function aggregateCapacityUtilisation(
  soes: ReadonlyArray<Pick<SoeState, "output" | "capacity">>
): number {
  if (soes.length === 0) return SOE_PERF_BASELINE;
  let sum = 0;
  for (const soe of soes) sum += capacityUtilisation(soe);
  return sum / soes.length;
}

/**
 * Build the seed {@link SoeState} for a freshly-seeded SOE. A new enterprise
 * starts on-plan (output = target) with baseline efficiency, no accumulated
 * losses, and a vacant director seat (NPP brain runs it until claimed).
 * `planTarget` is the sum of the SOE's seeded sector revenue (nominal expected
 * output); capacity carries the standard 10% headroom.
 */
export function makeSeedSoeState(sector: OperatingSectorType, planTarget: number): SoeState {
  const target = Number.isFinite(planTarget) && planTarget > 0 ? planTarget : 0;
  return {
    sector,
    capacity: Math.round(target * SOE_CAPACITY_HEADROOM),
    output: target,
    planTarget: target,
    efficiency: 1.0,
    cumulativeLosses: 0,
    directorId: null,
  };
}

/**
 * Build the {@link SoeState} for an enterprise brought under the plan with
 * sectors already running: the split-off path, and repair of split-offs made
 * before this overlay existed.
 *
 *  - `capacity` mirrors the plants-tier reading the command-economy turn
 *    recomputes (Σ capitalStock × mixPrice), so the overlay does not jump on
 *    the first turn. With no capital stock it falls back to the seed's 10%
 *    headroom over the target.
 *  - `output` is the realized figure, not the nameplate.
 *  - `planTarget` equals output. It is sticky and is the denominator the
 *    director is graded on, so seeding from the nameplate would brand an
 *    input-starved enterprise a failure for a shortfall it could not cover.
 *
 * Efficiency starts at baseline and losses at zero: no record under the plan
 * yet, and inventing one would be inventing a grade.
 */
export function makeAdoptedSoeState(
  sector: OperatingSectorType,
  sectors: ReadonlyArray<{
    revenue?: number | null;
    realizedRevenue?: number | null;
    capitalStock?: number | null;
  }>
): SoeState {
  let capacityValue = 0;
  let realized = 0;
  for (const sec of sectors) {
    const nominal = Number.isFinite(sec.revenue) ? (sec.revenue as number) : 0;
    const capitalStock = Number.isFinite(sec.capitalStock) ? (sec.capitalStock as number) : 0;
    // Written as the explicit identity (not just `+= nominal`) to keep it a
    // CAPACITY reading: a sector with no capital contributes no capacity.
    if (capitalStock > 0) capacityValue += capitalStock * (nominal / capitalStock);
    realized +=
      typeof sec.realizedRevenue === "number" && Number.isFinite(sec.realizedRevenue)
        ? sec.realizedRevenue
        : nominal;
  }
  const output = Math.round(realized > 0 ? realized : 0);
  const capacity =
    capacityValue > 0 ? Math.round(capacityValue) : Math.round(output * SOE_CAPACITY_HEADROOM);
  return {
    sector,
    capacity,
    output,
    planTarget: output,
    efficiency: 1.0,
    cumulativeLosses: 0,
    directorId: null,
  };
}

// ── Command Economy v2 (P1): directed credit (the active Gosbank) ────────────

/**
 * Fraction of aggregate annual plan output Gosbank lends as directed credit at
 * FULL aggressiveness. The per-turn budget is this × aggressiveness × ΣplanTarget
 * / TURNS_PER_YEAR (an annual credit programme spread across the year's turns).
 * P3-tunable.
 */
const CREDIT_INTENSITY = 0.15;
/** New productive CAPACITY built per unit of directed credit (investment 1:1). */
export const CAPACITY_PER_CREDIT = 1.0;
/** Extra OUTPUT a unit of directed credit yields THIS turn (capacity leads output
 *  so growth compounds over subsequent turns, not all at once). P3-tunable. */
const OUTPUT_PER_CREDIT = 0.5;
/** Every SOE gets at least this weight so a floor of credit flows even to
 *  on-plan sectors (keeps strategic capacity from starving). */
const CREDIT_ALLOCATION_FLOOR = 0.15;
/** Fraction of directed credit backed by real household savings (the rest is
 *  monetized → overhang). 0.4 ⇒ 60% of credit prints money. P3-tunable. */
const CREDIT_SAVINGS_COVERAGE = 0.4;

/**
 * Gosbank's per-turn directed-credit budget for one country, in the same
 * (household-currency) units as `planTarget`. Scales with how aggressively the
 * Gosbank posture funds the plan.
 *
 * @param aggregatePlanTarget Σ planTarget across the country's SOEs
 * @param aggressiveness      0 (restrained) … 1 (flood) credit posture
 */
export function directedCreditBudget(aggregatePlanTarget: number, aggressiveness: number): number {
  const base =
    Number.isFinite(aggregatePlanTarget) && aggregatePlanTarget > 0 ? aggregatePlanTarget : 0;
  const a = clamp(aggressiveness, 0, 1);
  return (CREDIT_INTENSITY * a * base) / TURNS_PER_YEAR;
}

/**
 * Allocate a total credit budget across a country's SOEs, weighted toward
 * UNDER-performing strategic sectors: weight ∝ planTarget × (floor + shortfall),
 * where shortfall = max(0, baseline − plan fulfillment). Big strategic sectors
 * and those missing their plan draw more credit; on-plan sectors still get the
 * floor. Returns a sector → amount map (amounts sum to `totalCredit`, modulo
 * finite-guarding). Empty / zero-weight input → even split.
 */
export function allocateDirectedCredit(
  soes: ReadonlyArray<Pick<SoeState, "sector" | "output" | "planTarget">>,
  totalCredit: number
): Map<OperatingSectorType, number> {
  const out = new Map<OperatingSectorType, number>();
  const credit = Number.isFinite(totalCredit) && totalCredit > 0 ? totalCredit : 0;
  if (soes.length === 0 || credit === 0) {
    for (const s of soes) out.set(s.sector, 0);
    return out;
  }
  const weights = soes.map((s) => {
    const target = Number.isFinite(s.planTarget) && s.planTarget > 0 ? s.planTarget : 0;
    const shortfall = Math.max(0, SOE_PERF_BASELINE - planFulfillment(s));
    return Math.max(0, target * (CREDIT_ALLOCATION_FLOOR + shortfall));
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  soes.forEach((s, i) => {
    const share = totalWeight > 0 ? weights[i] / totalWeight : 1 / soes.length;
    out.set(s.sector, credit * share);
  });
  return out;
}

/**
 * Command Economy v2 (P2): resolve the directed-credit allocation honoring the
 * player levers, with this precedence:
 *
 *  1. Gosbank Chair's explicit per-sector weighting (`sectorCredit`) — when
 *     present and non-empty, credit is split strictly by those weights ("pick
 *     the winners"). Sectors absent from the map get zero.
 *  2. Otherwise the automatic under-performer weighting, additionally pulled
 *     toward SOEs whose director filed an `investmentRequest` (a bounded demand
 *     boost so a director asking for capital actually draws more of it).
 *
 * Returns a sector → amount map summing to `totalCredit` (modulo finite-guard).
 */
export function resolveCreditAllocation(
  soes: ReadonlyArray<
    Pick<SoeState, "sector" | "output" | "planTarget"> & { investmentRequest?: number }
  >,
  totalCredit: number,
  sectorCredit?: Record<string, number> | null
): Map<OperatingSectorType, number> {
  const credit = Number.isFinite(totalCredit) && totalCredit > 0 ? totalCredit : 0;
  const out = new Map<OperatingSectorType, number>();
  if (soes.length === 0 || credit === 0) {
    for (const s of soes) out.set(s.sector, 0);
    return out;
  }

  // 1. Explicit Gosbank override.
  if (sectorCredit && Object.keys(sectorCredit).length > 0) {
    const weights = soes.map((s) => {
      const w = sectorCredit[s.sector];
      return Number.isFinite(w) && (w as number) > 0 ? (w as number) : 0;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    soes.forEach((s, i) => {
      out.set(s.sector, total > 0 ? credit * (weights[i] / total) : 0);
    });
    return out;
  }

  // 2. Automatic weighting + director investment-request boost.
  const weights = soes.map((s) => {
    const target = Number.isFinite(s.planTarget) && s.planTarget > 0 ? s.planTarget : 0;
    const shortfall = Math.max(0, SOE_PERF_BASELINE - planFulfillment(s));
    const base = Math.max(0, target * (CREDIT_ALLOCATION_FLOOR + shortfall));
    const req =
      Number.isFinite(s.investmentRequest) && (s.investmentRequest ?? 0) > 0
        ? (s.investmentRequest as number)
        : 0;
    // A request adds up to its face value in demand weight (bounded to the
    // sector's plan size so one loud director can't monopolize the budget).
    const reqBoost = Math.min(req, target > 0 ? target : req);
    return base + reqBoost;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  soes.forEach((s, i) => {
    const share = totalWeight > 0 ? weights[i] / totalWeight : 1 / soes.length;
    out.set(s.sector, credit * share);
  });
  return out;
}

/**
 * Apply directed credit to one SOE: investment builds CAPACITY (durable, carried
 * turn to turn) and lifts OUTPUT toward that raised ceiling this turn. Output is
 * capped at capacity, so sustained credit compounds output over subsequent turns
 * as capacity climbs. Pure; NaN-guarded.
 */
export function applyDirectedCreditToSoe(
  soe: SoeState,
  credit: number,
  /**
   * Under plants, `capacityValueAdded` is passed here after the caller has
   * already `$inc`d `capitalStock` on the SOE's sectors. Add it to the
   * overlay's `capacity` so the overlay tracks real plants the money bought.
   * Output is deliberately unchanged: it is produced from capital stock and
   * read back next turn via `loadSoeStates`. Crediting it here would
   * double-count the same money and restore the phantom capacity the plants
   * tier removes.
   */
  plants?: { capacityValueAdded: number } | null
): SoeState {
  const c = Number.isFinite(credit) && credit > 0 ? credit : 0;
  if (plants) {
    const added =
      Number.isFinite(plants.capacityValueAdded) && plants.capacityValueAdded > 0
        ? plants.capacityValueAdded
        : 0;
    if (added === 0) return soe;
    const capacity = Math.max(0, (Number.isFinite(soe.capacity) ? soe.capacity : 0) + added);
    return { ...soe, capacity: Math.round(capacity) };
  }
  if (c === 0) return soe;
  const capacity = Math.max(
    0,
    (Number.isFinite(soe.capacity) ? soe.capacity : 0) + c * CAPACITY_PER_CREDIT
  );
  const baseOutput = Number.isFinite(soe.output) ? soe.output : 0;
  const output = clamp(baseOutput + c * OUTPUT_PER_CREDIT, 0, capacity);
  return { ...soe, capacity: Math.round(capacity), output: Math.round(output) };
}

/**
 * P3b — how much REAL capacity a directed-credit tranche buys under plants.
 *
 * `creditAnchor` is the tranche in ₳; `unitPriceAnchor` is
 * `capacityPricePerUnit(sectorType, year)` — the SAME era-priced ₳/unit the
 * player-facing build path charges, so the Gosbank cannot buy capacity cheaper
 * than a private CEO can. Returns units/day of new capacity. A missing or
 * non-positive price buys nothing (never Infinity).
 */
export function directedCreditCapacityUnits(creditAnchor: number, unitPriceAnchor: number): number {
  if (!Number.isFinite(creditAnchor) || creditAnchor <= 0) return 0;
  if (!Number.isFinite(unitPriceAnchor) || unitPriceAnchor <= 0) return 0;
  return creditAnchor / unitPriceAnchor;
}

// ── State capacity replacement (the SOE capex channel) ──────────────────────

/**
 * REPLACEMENT COST of an enterprise's existing capacity for ONE turn, in ₳:
 *
 *     Σ_sectors capitalStock × δ × capacityPricePerUnit(sectorType, year)
 *
 * Depreciation replacement is the largest state grant provably not a growth
 * subsidy: it is bounded by the plant that already exists and leaves
 * `capitalStock` flat, so it cannot be exploited as an unbounded build request.
 * Command economies floor the Gosbank directed credit tranche here; other
 * state-owned corps debit the owning treasury for exactly this. No capital
 * stock means 0: founding a plant is a policy decision, not maintenance.
 */
export function soeCapacityReplacementCostAnchor(
  sectors: ReadonlyArray<{
    sectorType: OperatingSectorType;
    strategyId?: string | null;
    capitalStock?: number | null;
  }>,
  year: number | null | undefined,
  unitScale: number,
  depreciationPerTurn: number = CAPITAL_DEPRECIATION_PER_TURN
): number {
  const delta =
    Number.isFinite(depreciationPerTurn) && depreciationPerTurn > 0 ? depreciationPerTurn : 0;
  if (delta <= 0) return 0;
  const priceYear = typeof year === "number" && Number.isFinite(year) ? year : CAPACITY_ANCHOR_YEAR;
  let total = 0;
  for (const sector of sectors) {
    const stock =
      typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
        ? Math.max(0, sector.capitalStock)
        : 0;
    if (stock <= 0) continue;
    const unitPrice = capacityPricePerUnit(
      sector.sectorType,
      priceYear,
      unitScale,
      sector.strategyId ?? null
    );
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;
    total += stock * delta * unitPrice;
  }
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/**
 * The monetized slice of a directed-credit programme — the part NOT covered by
 * real savings, which prints money and feeds the monetary overhang. This is the
 * core Gosbank tradeoff: funding growth worsens shortages.
 */
export function directedCreditIssuance(
  totalCredit: number,
  savingsCoverage = CREDIT_SAVINGS_COVERAGE
): number {
  const credit = Number.isFinite(totalCredit) && totalCredit > 0 ? totalCredit : 0;
  const covered = clamp(savingsCoverage, 0, 1);
  return credit * (1 - covered);
}
