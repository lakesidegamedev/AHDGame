/** Shared physical sizing for funded build advice, independent of operating history. */
import {
  commodityMixWeight,
  COMMODITY_BASE_PRICES,
  type CommodityType,
} from "@/lib/constants/commodities";
import { expansionGapAfterExistingCapacity } from "../investment/expansion/rules";
import type { BuildDemandRow } from "./fundedBuildDemand";

export interface BuildDemandProducer {
  stateId: string;
  countryId?: string;
  supply: Partial<Record<CommodityType, number>>;
  capacity: number;
  produced?: number;
  queued: number;
}

/** National rows include regional rows. Each output is sized separately; never sum them. */
export function sizeBuildDemand(input: {
  rows: readonly BuildDemandRow[];
  supply: Partial<Record<CommodityType, number>>;
  outputMultiplier: number;
  stateId: string;
  countryId: string;
  producers: readonly BuildDemandProducer[];
}): BuildDemandRow[] {
  return input.rows.map((row) => {
    const weight = commodityMixWeight(input.supply, COMMODITY_BASE_PRICES, row.commodity);
    const outputPerUnit = weight * input.outputMultiplier;
    if (!Number.isFinite(outputPerUnit) || outputPerUnit <= 0) {
      return { ...row, capacityUnits: null };
    }
    const producers = input.producers
      .filter(
        (p) =>
          (p.supply[row.commodity] ?? 0) > 0 &&
          (row.scope === "regional" ? p.stateId === input.stateId : p.countryId === input.countryId)
      )
      .map((p) => ({
        capacity: p.capacity,
        produced: p.produced ?? NaN,
        queued: p.queued,
        weight: commodityMixWeight(p.supply, COMMODITY_BASE_PRICES, row.commodity),
      }));
    const remaining =
      row.unmet == null ? null : expansionGapAfterExistingCapacity(row.unmet, producers);
    // Modeled and paid demand can overlap. Use the larger gap.
    const estimated = row.capHiddenUnmet
      ? expansionGapAfterExistingCapacity(Math.max(row.unmet ?? 0, row.capHiddenUnmet), producers)
      : null;
    return {
      ...row,
      capacityUnits: remaining != null ? remaining / outputPerUnit : null,
      ...(estimated != null ? { estimatedCapacityUnits: estimated / outputPerUnit } : {}),
    };
  });
}

/** The tightest primary market. National totals already include their regional subsets. */
export function limitingBuildOutput(rows: readonly BuildDemandRow[]): BuildDemandRow | null {
  const primary = [...new Map(rows.map((row) => [row.commodity, row])).values()];
  if (!primary.length || primary.some((row) => row.capacityUnits == null)) return null;
  return primary.reduce((limiting, row) =>
    row.capacityUnits! < limiting.capacityUnits! ? row : limiting
  );
}

/** Full-mix estimate when the cap signal increases the room above paid orders. */
export function estimatedFullMixBuildRoom(rows: readonly BuildDemandRow[]): number | null {
  const withEstimates = rows.map((row) => ({
    ...row,
    capacityUnits: row.estimatedCapacityUnits ?? row.capacityUnits,
  }));
  const estimated = fullMixBuildRoom(withEstimates);
  return estimated != null && estimated > (fullMixBuildRoom(rows) ?? 0) ? estimated : null;
}

/** Capacity whose entire output mix has measured buyers after idle plants and queues. */
export function fullMixBuildRoom(rows: readonly BuildDemandRow[]): number | null {
  const capacityUnits = limitingBuildOutput(rows)?.capacityUnits;
  return capacityUnits == null ? null : Math.max(0, capacityUnits);
}
