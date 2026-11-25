import type { Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import { crisesCollection } from "@/lib/db/repositories/crises";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { buildMarketContext } from "@/lib/market/marketContext";
import { getMarketSystemModeForDb } from "@/lib/market/featureFlag";
import { sectorCrisisEffects } from "../rules/sectorCrisisEffects";

export async function loadSectorCrisisEffects(db: Db, currentTurn: number) {
  const [crises, config, mode] = await Promise.all([
    crisesCollection(db)
      .find(
        { status: "active", startTurn: { $lte: currentTurn } },
        {
          projection: {
            name: 1,
            scope: 1,
            countryIds: 1,
            regionIds: 1,
            startTurn: 1,
            durationTurns: 1,
            effects: 1,
            "v2Output.productionCuts": 1,
          },
        }
      )
      .toArray(),
    gameConfigCollection(db).findOne(
      { _id: "default" },
      {
        projection: {
          marketGovernorRampTurns: 1,
          marketGovernorGlideStartTurn: 1,
          marketGovernorGlideTurns: 1,
          marketGovernorGlideMode: 1,
          marketGovernorGlideFloor: 1,
        },
      }
    ),
    getMarketSystemModeForDb(db),
  ]);
  const market = buildMarketContext(mode, {
    currentTurn,
    rampTurns: config?.marketGovernorRampTurns,
    glideStartTurn: config?.marketGovernorGlideStartTurn,
    glideTurns: config?.marketGovernorGlideTurns,
    glideMode: config?.marketGovernorGlideMode,
    glideFloor: config?.marketGovernorGlideFloor,
  });
  const affectsState = (crisis: Crisis, countryId: string, stateId: string) =>
    crisis.scope === "global" ||
    (crisis.scope === "country"
      ? crisis.countryIds.includes(countryId)
      : crisis.regionIds.includes(stateId));

  return (
    sector: Parameters<typeof sectorCrisisEffects>[1] & { stateId: string },
    countryId: string
  ) =>
    sectorCrisisEffects(
      crises.filter((crisis) => affectsState(crisis, countryId, sector.stateId)),
      sector,
      currentTurn,
      market
    );
}
