import { REVENUE_TREND_MIN_SPAN, REVENUE_TREND_TARGET_SPAN } from "@/lib/turn/gdpGrowth";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { MediaDiscriminator } from "@/lib/constants/corporations";
import { unitYieldForSupply } from "@/lib/constants/capacityEconomy";
import { getEffectiveStrategyRatesForOperatingModel } from "@/lib/constants/sectorStrategies";

export interface OutputVolumeSector {
  sectorType: OperatingSectorType;
  producedUnits?: number;
  strategyId?: string;
  transitionFromStrategyId?: string | null;
  transitionStartTurn?: number | null;
  industryModel?: string | null;
  mediaDiscriminator?: MediaDiscriminator | null;
}

/**
 * Production valued at the canonical commodity basket, never market prices or
 * FX. The common era unit scale cancels in growth ratios, so use scale 1 for
 * this index. It is a volume index, not money available to spend or tax.
 */
export function constantPriceOutput(sector: OutputVolumeSector, turn: number): number | null {
  const units = sector.producedUnits;
  if (typeof units !== "number" || !Number.isFinite(units) || units < 0) return null;
  const rates = getEffectiveStrategyRatesForOperatingModel(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.transitionFromStrategyId,
    sector.transitionStartTurn,
    turn,
    sector.industryModel,
    sector.mediaDiscriminator
  );
  const unitYield = unitYieldForSupply(rates.supply, 1);
  if (!Number.isFinite(unitYield) || unitYield <= 0) return null;
  const output = units / unitYield;
  return Number.isFinite(output) ? output : null;
}

/** Share of constant-price output a sector buys back as inputs, kept below 1 so value added stays positive. */
const MAX_INTERMEDIATE_SHARE = 0.95;

/**
 * Inputs the sector's current production method consumes, as a share of its
 * output at the canonical basket. Recipe demand rates are shares of nominal
 * output, so the sum is the intermediate share directly.
 */
export function intermediateShare(sector: OutputVolumeSector, turn: number): number {
  const rates = getEffectiveStrategyRatesForOperatingModel(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.transitionFromStrategyId,
    sector.transitionStartTurn,
    turn,
    sector.industryModel,
    sector.mediaDiscriminator
  );
  let total = 0;
  for (const rate of Object.values(rates.demand ?? {})) {
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) total += rate;
  }
  return Math.min(MAX_INTERMEDIATE_SHARE, total);
}

/** Gross output less the inputs it consumed, both at the canonical basket. */
export function valueAddedOutput(sector: OutputVolumeSector, turn: number): number | null {
  const gross = constantPriceOutput(sector, turn);
  if (gross === null) return null;
  return gross * (1 - intermediateShare(sector, turn));
}

export type OutputBasis = "gross" | "value_added";

/** Only an explicit marker selects value added; absent or unknown stays on the gross basis. */
export function resolveOutputBasis(value: unknown): OutputBasis {
  return value === "value_added" ? "value_added" : "gross";
}

/** The growth-signal volume for a sector on the world's output basis. */
export function outputVolumeOnBasis(
  sector: OutputVolumeSector,
  turn: number,
  basis: OutputBasis
): number | null {
  return basis === "value_added"
    ? valueAddedOutput(sector, turn)
    : constantPriceOutput(sector, turn);
}

/** A partial observation must never be mistaken for a regional output loss. */
export function sumObservedOutput(sectors: readonly { outputVolume?: number }[]): number | null {
  if (sectors.length === 0) return null;
  let total = 0;
  for (const sector of sectors) {
    const value = sector.outputVolume;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    total += value;
  }
  return Number.isFinite(total) ? total : null;
}

/** Grow confidence in the new measurement until a full year is observed. */
export function blendOutputGrowthSignal(
  previousSignal: number,
  physicalSignal: number | null,
  historySpanTurns: number
): number {
  if (physicalSignal === null || !Number.isFinite(physicalSignal)) return previousSignal;
  const weight = Number.isFinite(historySpanTurns)
    ? Math.max(
        0,
        Math.min(
          1,
          (historySpanTurns - REVENUE_TREND_MIN_SPAN) /
            (REVENUE_TREND_TARGET_SPAN - REVENUE_TREND_MIN_SPAN)
        )
      )
    : 0;
  return previousSignal * (1 - weight) + physicalSignal * weight;
}

/** Oldest retained observation, rather than the nearest-year trend baseline. */
export function outputHistorySpanTurns(
  snapshots: readonly { turn: number; value: number }[] | undefined,
  turn: number
): number {
  let span = 0;
  for (const snapshot of snapshots ?? []) {
    if (Number.isFinite(snapshot.turn) && Number.isFinite(snapshot.value) && snapshot.value > 0)
      span = Math.max(span, turn - snapshot.turn);
  }
  return Number.isFinite(span) ? span : 0;
}
