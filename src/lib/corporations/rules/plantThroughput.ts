import { STRATEGY_TRANSITION_TURNS } from "@/lib/constants/sectorStrategyTypes";
import { energyProductivityMultiplier } from "./energyProductivityRamp";

export type PlantThroughputSector = {
  sectorType: string;
  strategyId?: string | null;
  transitionFromStrategyId?: string | null;
  transitionStartTurn?: number | null;
};

const THROUGHPUT_2027 = new Map([
  ["retail", { strategyId: "standard", multiplier: 1.26 }],
  ["financial", { strategyId: "fintech", multiplier: 3 }],
]);

/** Throughput scales the run and its input purchases at the same rate. */
export function plantThroughputMultiplier(
  sector: PlantThroughputSector,
  currentTurn: number | undefined,
  preset?: string | null
): number {
  const method = preset === "2027-default" ? THROUGHPUT_2027.get(sector.sectorType) : undefined;
  if (!method) {
    return energyProductivityMultiplier(sector.sectorType, currentTurn, preset);
  }
  const multiplierFor = (strategyId: string) =>
    strategyId === method.strategyId ? method.multiplier : 1;
  const target = multiplierFor(sector.strategyId ?? "standard");
  const { transitionFromStrategyId, transitionStartTurn } = sector;
  if (
    !transitionFromStrategyId ||
    transitionStartTurn == null ||
    currentTurn == null ||
    !Number.isFinite(currentTurn)
  )
    return target;

  const progress = Math.min(
    1,
    Math.max(0, (currentTurn - transitionStartTurn) / STRATEGY_TRANSITION_TURNS)
  );
  const source = multiplierFor(transitionFromStrategyId);
  return source + (target - source) * progress;
}
