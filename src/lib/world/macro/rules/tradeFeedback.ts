/**
 * Funded-market trade read back into a background country's macro economy.
 *
 * On a funded turn a background country sells traded supply and buys traded
 * demand in the producer market. Actual fills are recorded as lagged rates, and
 * each tick moves capacity toward exports that found buyers: unsold output
 * shrinks capacity, sold-out output grows it slowly. Only the traded share
 * responds, so closed economies barely move.
 *
 * Pure: plain data in, plain data out.
 */
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { MacroFundedTrade, MacroSectorState } from "../types";

/** Weight of one funded turn in the lagged fill (about a four-turn memory). */
export const TRADE_FILL_WEIGHT = 0.25;

/** Export fill at which capacity holds steady. */
export const TRADE_FILL_TARGET = 0.95;

/** Capacity change per kernel tick per unit of (fill - target), before trade exposure. */
export const TRADE_CAPACITY_RESPONSE = 0.05;

/** Largest capacity change in one kernel tick. */
export const TRADE_CAPACITY_MAX_STEP = 0.02;

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

function fillOf(done: number, wanted: number): number | null {
  return Number.isFinite(wanted) && wanted > 0 ? clamp01(done / wanted) : null;
}

/**
 * The record after this turn's trade. A retried turn (same `turn`) starts from
 * the stored prior fills, so it lands on the same record instead of counting
 * the turn twice. A side with nothing offered or requested keeps its fill.
 */
export function nextFundedTrade(
  previous: MacroFundedTrade | null | undefined,
  outcome: MacroFundedTrade["last"],
  turn: number
): MacroFundedTrade {
  const base =
    previous == null
      ? null
      : previous.turn === turn
        ? previous.prior
        : { exportFill: previous.exportFill, importFill: previous.importFill };
  const blend = (prior: number | undefined, now: number | null) =>
    prior == null ? (now ?? 1) : now == null ? prior : prior + TRADE_FILL_WEIGHT * (now - prior);
  return {
    turn,
    exportFill: blend(base?.exportFill, fillOf(outcome.soldValue, outcome.offeredValue)),
    importFill: blend(base?.importFill, fillOf(outcome.boughtValue, outcome.requestedValue)),
    prior: base,
    last: outcome,
  };
}

/** Capacity factor for one kernel tick from the lagged export fill. */
export function tradeCapacityFactor(exportFill: number, tradeExposure: number): number {
  const step =
    TRADE_CAPACITY_RESPONSE * clamp01(tradeExposure) * (clamp01(exportFill) - TRADE_FILL_TARGET);
  return 1 + Math.min(TRADE_CAPACITY_MAX_STEP, Math.max(-TRADE_CAPACITY_MAX_STEP, step));
}

/**
 * The factor to apply at a kernel tick, or 1 when no funded trade was
 * recorded since the last tick (legacy worlds, or a world that left the
 * funded market), so a stale record never keeps moving capacity.
 */
export function tradeCapacityFactorAtTick(input: {
  fundedTrade: MacroFundedTrade | null | undefined;
  lastTickTurn: number | null;
  tradeExposure: number;
}): number {
  const trade = input.fundedTrade;
  if (!trade) return 1;
  if (input.lastTickTurn != null && !(trade.turn > input.lastTickTurn)) return 1;
  return tradeCapacityFactor(trade.exportFill, input.tradeExposure);
}

/** Sectors with capacity scaled by `factor`; domestic demand and productivity unchanged. */
export function scaleMacroCapacity(
  sectors: Partial<Record<OperatingSectorType, MacroSectorState>>,
  factor: number
): Partial<Record<OperatingSectorType, MacroSectorState>> {
  if (factor === 1 || !Number.isFinite(factor) || factor <= 0) return sectors;
  const out: Partial<Record<OperatingSectorType, MacroSectorState>> = {};
  for (const [sectorType, sector] of Object.entries(sectors) as [
    OperatingSectorType,
    MacroSectorState | undefined,
  ][]) {
    if (!sector) continue;
    out[sectorType] = { ...sector, capacity: sector.capacity * factor };
  }
  return out;
}
