/**
 * Plant productivity. Technology and throughput rules increase output per
 * unit of capacity; productionProductivityMultiplier gives production and
 * expansion estimates the same current-turn output basis.
 */
import { techOutputUnitsMultiplier } from "@/lib/constants/capacityEconomy";
import type { CommodityType } from "@/lib/constants/commodities";
import { plantThroughputMultiplier, type PlantThroughputSector } from "./plantThroughput";

export function productionProductivityMultiplier(input: {
  sector: PlantThroughputSector;
  supply?: Partial<Record<CommodityType, number>>;
  outputRateMult?: Record<string, number> | null;
  currentTurn: number;
  preset?: string;
}): number {
  return (
    techOutputUnitsMultiplier(input.supply, input.outputRateMult) *
    plantThroughputMultiplier(input.sector, input.currentTurn, input.preset)
  );
}
