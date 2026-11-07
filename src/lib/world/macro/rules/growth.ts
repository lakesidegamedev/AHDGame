/**
 * Annual growth for aggregate (macro) economies (#5702).
 *
 * A background country grows at its authored trend rate, held back while a
 * shock is in force: a war, sanctions or a living conflict lower
 * `shockModifier`, which already cuts this tick's output, and the same shock
 * drags the growth rate so recovery takes years rather than one tick.
 *
 * The rate is annual. A kernel tick covers several turns, so the growth
 * applied is (1 + rate) ^ (turnsElapsed / turnsPerYear): one game year of
 * ticks compounds to exactly the annual rate, never the annual rate per turn.
 *
 * Pure: plain data in, plain data out.
 */
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { MacroSectorState } from "../types";

/** Share of an output shock that also comes off the annual growth rate. */
export const SHOCK_GROWTH_PASS_THROUGH = 0.5;

/** Bounds on the effective annual rate, so a bad shock cannot collapse an economy in a tick. */
export const MIN_ANNUAL_GROWTH = -0.15;
export const MAX_ANNUAL_GROWTH = 0.12;

/**
 * Effective annual real growth: trend, less half of any output shock.
 * A shock of 0.8 (output 20% below normal) takes 10 points off the year.
 */
export function effectiveAnnualGrowth(trendGrowth: number, shockModifier: number): number {
  const trend = Number.isFinite(trendGrowth) ? trendGrowth : 0;
  const shock = Number.isFinite(shockModifier) && shockModifier > 0 ? shockModifier : 1;
  const rate = trend + (Math.min(shock, 1) - 1) * SHOCK_GROWTH_PASS_THROUGH;
  return Math.min(MAX_ANNUAL_GROWTH, Math.max(MIN_ANNUAL_GROWTH, rate));
}

/** Growth factor for `turnsElapsed` turns at an annual rate. */
export function growthFactorForTurns(
  annualRate: number,
  turnsElapsed: number,
  turnsPerYear: number
): number {
  if (!Number.isFinite(turnsElapsed) || turnsElapsed <= 0 || turnsPerYear <= 0) return 1;
  return Math.pow(1 + annualRate, turnsElapsed / turnsPerYear);
}

/**
 * Sectors after growth. Capacity and domestic demand move together, so the
 * country's balance holds while its size changes. Productivity is untouched.
 */
export function growMacroSectors(
  sectors: Partial<Record<OperatingSectorType, MacroSectorState>>,
  factor: number
): Partial<Record<OperatingSectorType, MacroSectorState>> {
  if (factor === 1) return sectors;
  const out: Partial<Record<OperatingSectorType, MacroSectorState>> = {};
  for (const [sectorType, sector] of Object.entries(sectors) as [
    OperatingSectorType,
    MacroSectorState | undefined,
  ][]) {
    if (!sector) continue;
    out[sectorType] = {
      capacity: Math.round(sector.capacity * factor * 100) / 100,
      productivity: sector.productivity,
      domesticDemand: Math.round(sector.domesticDemand * factor * 100) / 100,
    };
  }
  return out;
}

/**
 * One tick of growth for a document that carries a trend. Returns null when
 * the document has no trend (every pre-2027 macro) or no turns have elapsed
 * since its last tick, so the caller writes nothing new.
 */
export function advanceMacroGrowth(input: {
  sectors: Partial<Record<OperatingSectorType, MacroSectorState>>;
  trendGrowth: number | undefined;
  shockModifier: number;
  lastTickTurn: number | null;
  turn: number;
  turnsPerYear: number;
}): Partial<Record<OperatingSectorType, MacroSectorState>> | null {
  if (input.trendGrowth === undefined || input.lastTickTurn == null) return null;
  const elapsed = input.turn - input.lastTickTurn;
  if (elapsed <= 0) return null;
  const rate = effectiveAnnualGrowth(input.trendGrowth, input.shockModifier);
  return growMacroSectors(input.sectors, growthFactorForTurns(rate, elapsed, input.turnsPerYear));
}
