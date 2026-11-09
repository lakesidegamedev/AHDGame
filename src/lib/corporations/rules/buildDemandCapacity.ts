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
    const remaining =
      row.unmet == null
        ? null
        : expansionGapAfterExistingCapacity(
            row.unmet,
            input.producers
              .filter(
                (p) =>
                  (p.supply[row.commodity] ?? 0) > 0 &&
                  (row.scope === "regional"
                    ? p.stateId === input.stateId
                    : p.countryId === input.countryId)
              )
              .map((p) => ({
                capacity: p.capacity,
                produced: p.produced ?? NaN,
                queued: p.queued,
                weight: commodityMixWeight(p.supply, COMMODITY_BASE_PRICES, row.commodity),
              }))
          );
    return {
      ...row,
      capacityUnits:
        remaining != null && Number.isFinite(outputPerUnit) && outputPerUnit > 0
          ? remaining / outputPerUnit
          : null,
    };
  });
}

/** Capacity whose entire output mix has measured buyers after idle plants and queues. */
export function fullMixBuildRoom(rows: readonly BuildDemandRow[]): number | null {
  const primary = [...new Map(rows.map((row) => [row.commodity, row])).values()];
  if (!primary.length || primary.some((row) => row.capacityUnits == null)) return null;
  return Math.max(0, Math.min(...primary.map((row) => row.capacityUnits!)));
}
