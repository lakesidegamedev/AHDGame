/**
 * The operating profit a state-owned sector ACTUALLY earned, in the sector's
 * stored currency, on the daily basis `revenue` and `realizedRevenue` use.
 *
 * `revenue` is nameplate and ignores mothballing; `effectiveProfitMargin` for
 * a cold sector is a counterfactual (what its margin WOULD be), not an
 * achieved number. Multiply those and the page reports large phantom profits
 * for idle plants. Instead prefer `sector.plantsPnl.profit` when present
 * (carries upkeep and compliance), else realized revenue x the engine margin,
 * unfloored, minus the upkeep a cold plant still pays.
 *
 * The upkeep leg mirrors `plantsUpkeepCost` in `sectorTurn`: mothball pays
 * {@link MOTHBALL_UPKEEP_FRACTION} on whole capacity, idle pays
 * {@link IDLE_UPKEEP_FRACTION} on the idle share, priced off the held
 * `plantsUpkeepMarginBasisAnchor` so a fixed cost does not shrink as the
 * margin falls. Below plants nothing changes.
 */
import { activeCapacityFraction, capacityUpkeepUnits } from "@/lib/corporations/investment/rules";
import { IDLE_UPKEEP_FRACTION, MOTHBALL_UPKEEP_FRACTION } from "@/lib/constants/capacityEconomy";

/**
 * Persisted booked P&L (`CorporateSector.plantsPnl`), read structurally so this
 * module doesn't depend on that field. Absent or non-finite falls through to
 * the realized-revenue path below.
 */
interface BookedPnlShape {
  profit?: unknown;
}

/** The sector fields this basis reads. Structural so partial projections fit. */
export interface SoeOperatingProfitInput {
  revenue?: number | null;
  realizedRevenue?: number | null;
  profitMargin?: number | null;
  effectiveProfitMargin?: number | null;
  mothballed?: boolean | null;
  activeCapacityPercent?: number | null;
  capitalUtilization?: number | null;
  throughputFactor?: number | null;
  plantsUpkeepMarginBasisAnchor?: number | null;
  plantsPnl?: BookedPnlShape | null;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The share of capacity the OWNER chose to leave idle, [0, 1].
 *
 * Mirrors `ownerIdleUnits` in the turn processor and the same expression in
 * `estimateNationalizedOperatingIncome`: capacity stopped by an input shortage
 * is not an over-build, so `throughputFactor` divides out of the idle share.
 * A sector with no persisted utilization is treated as fully utilized, because
 * a missing field must never invent a cost.
 */
function ownerIdleShare(sector: SoeOperatingProfitInput): number {
  const utilization = finite(sector.capitalUtilization) ? sector.capitalUtilization : 1;
  const involuntary = finite(sector.throughputFactor) ? sector.throughputFactor : 1;
  if (!(involuntary > 0)) return 0;
  return Math.max(0, 1 - Math.min(1, utilization / involuntary));
}

/**
 * Daily upkeep on capacity that is not producing, in the sector's stored
 * currency. Under plants `revenue` is capacity x mix price, so
 * `revenue x idleShare` is the nominal value of the units standing still and
 * the turn's per-unit upkeep rate applies to it directly.
 */
export function soeIdleUpkeepCost(sector: SoeOperatingProfitInput, plantsEnabled: boolean): number {
  if (!plantsEnabled) return 0;
  const nameplate = finite(sector.revenue) ? Math.max(0, sector.revenue) : 0;
  if (!(nameplate > 0)) return 0;
  const basis = finite(sector.plantsUpkeepMarginBasisAnchor)
    ? Math.max(0, Math.min(1, sector.plantsUpkeepMarginBasisAnchor))
    : Math.max(0, 1 - (finite(sector.profitMargin) ? sector.profitMargin : 0) / 100);
  const activeFraction = activeCapacityFraction({
    mothballed: sector.mothballed ?? false,
    activeCapacityPercent: sector.activeCapacityPercent ?? undefined,
  });
  return (
    nameplate *
    basis *
    capacityUpkeepUnits({
      capacity: 1,
      activeFraction,
      ownerIdleActiveUnits: Math.max(0, ownerIdleShare(sector) - (1 - activeFraction)),
      idleFraction: IDLE_UPKEEP_FRACTION,
      coldFraction: MOTHBALL_UPKEEP_FRACTION,
      ramp: 1,
    })
  );
}

/**
 * The revenue a sector's profit may be computed against.
 *
 * Realized, never nameplate, and 0 for a mothballed plant even if a stale
 * `realizedRevenue` survives on the row: mothballing is the one state where the
 * engine is unconditional that the sector "earns exactly 0".
 */
export function soeRealizedRevenue(
  sector: SoeOperatingProfitInput,
  plantsEnabled: boolean
): number {
  if (plantsEnabled && sector.mothballed === true) return 0;
  if (finite(sector.realizedRevenue)) return Math.max(0, sector.realizedRevenue);
  return finite(sector.revenue) ? Math.max(0, sector.revenue) : 0;
}

/**
 * Operating profit for one state-owned holding, daily, in the sector's stored
 * currency. SIGNED: a sector that loses money returns a negative number, which
 * is the whole point of the change.
 *
 * `fallbackMarginPct` is the margin to use when the row carries no engine
 * figure yet (a sector that has never processed a turn); callers pass the
 * modifier-stack margin they already computed.
 */
export function soeSectorOperatingProfit(
  sector: SoeOperatingProfitInput,
  plantsEnabled: boolean,
  fallbackMarginPct: number
): number {
  // 1. The booked P&L, when the turn has written one. Carries upkeep and
  //    compliance, so no separate upkeep leg is added on top of it.
  const booked = sector.plantsPnl?.profit;
  if (plantsEnabled && finite(booked)) return booked;

  // 2. Realized revenue at the engine's margin, unfloored, less idle upkeep.
  const marginPct = finite(sector.effectiveProfitMargin)
    ? sector.effectiveProfitMargin
    : fallbackMarginPct;
  const realized = soeRealizedRevenue(sector, plantsEnabled);
  return (realized * marginPct) / 100 - soeIdleUpkeepCost(sector, plantsEnabled);
}
