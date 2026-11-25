import type { Crisis } from "@/lib/db/types/crisis";
import type { MarketContext } from "@/lib/market/marketContext";
import { plantsRampShare } from "@/lib/market/capital";
import {
  buildDisasterEffectsByState,
  computeDisasterPenaltySplit,
  disasterProductionFactor,
} from "../disasterMarginPenalty";

type Sector = {
  sectorType: string;
  strategyId?: string | null;
  plantsStartTurn?: number | null;
};

export interface SectorCrisisEffectRow {
  id: string;
  name: string;
  marginPoints: number;
  outputPercent: number;
}

export function sectorCrisisEffects(
  crises: Pick<
    Crisis,
    "_id" | "name" | "effects" | "startTurn" | "durationTurns" | "regionIds" | "v2Output"
  >[],
  sector: Sector,
  currentTurn: number,
  market: MarketContext
) {
  const ramp = plantsRampShare(sector.plantsStartTurn ?? currentTurn, currentTurn, market);
  const rows: SectorCrisisEffectRow[] = [];
  let marginPoints = 0;
  let outputPoints = 0;
  for (const crisis of crises) {
    const entries = buildDisasterEffectsByState([crisis], () => ["sector"]).get("sector") ?? [];
    const penalty = computeDisasterPenaltySplit(
      entries,
      { sectorType: sector.sectorType, strategyId: sector.strategyId ?? null },
      currentTurn,
      market.plantsEnabled
    );
    const physical = penalty.productionPenalty * ramp;
    const margin = penalty.marginPenalty + (penalty.productionPenalty - physical);
    if (margin === 0 && physical === 0) continue;
    marginPoints += margin;
    outputPoints += physical;
    rows.push({
      id: crisis._id.toString(),
      name: crisis.name,
      marginPoints: margin,
      outputPercent: physical,
    });
  }
  const outputPercent = (disasterProductionFactor(outputPoints) - 1) * 100;
  return { rows, marginPoints, outputPercent, outputFloor: outputPercent - outputPoints };
}

export type SectorCrisisEffects = ReturnType<typeof sectorCrisisEffects>;
