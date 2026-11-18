import { STRATEGY_TRANSITION_TURNS } from "@/lib/constants/sectorStrategyTypes";
import { energyProductivityMultiplier } from "./energyProductivityRamp";

export type PlantThroughputSector = {
  sectorType: string;
  strategyId?: string | null;
  transitionFromStrategyId?: string | null;
  transitionStartTurn?: number | null;
};

const STANDARD_RETAIL_THROUGHPUT_2027 = 1.26;

/** Throughput scales the run and its input purchases at the same rate. */
export function plantThroughputMultiplier(
  sector: PlantThroughputSector,
  currentTurn: number,
  preset?: string | null
): number {
  if (sector.sectorType !== "retail" || preset !== "2027-default") {
    return energyProductivityMultiplier(sector.sectorType, currentTurn, preset);
  }
  const multiplierFor = (strategyId: string) =>
    strategyId === "standard" ? STANDARD_RETAIL_THROUGHPUT_2027 : 1;
  const target = multiplierFor(sector.strategyId ?? "standard");
  const { transitionFromStrategyId, transitionStartTurn } = sector;
  if (!transitionFromStrategyId || transitionStartTurn == null || !Number.isFinite(currentTurn))
    return target;

  const progress = Math.min(
    1,
    Math.max(0, (currentTurn - transitionStartTurn) / STRATEGY_TRANSITION_TURNS)
  );
  const source = multiplierFor(transitionFromStrategyId);
  return source + (target - source) * progress;
}
