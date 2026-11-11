/** Batched, projected capacity observations for funded build advice. */
import type { Db } from "mongodb";
import type { Corporation, CorporateSector, GameState, State } from "@/lib/db/types";
import { resolvePresetIdFromGameState } from "@/lib/world/countryReadinessContract";
import { buildDemandProducer } from "./rules/buildDemandProducers";

export async function loadBuildDemandProducers(db: Db) {
  const [state, sectors, regions] = await Promise.all([
    db.collection<GameState>("gameState").findOne(
      { _id: "current" },
      {
        projection: {
          currentTurn: 1,
          sectorTechTreesEnabled: 1,
          preset: 1,
          hardwareInputReliefStartTurn: 1,
        },
      }
    ),
    db
      .collection<CorporateSector>("corporateSectors")
      .find(
        {},
        {
          projection: {
            corporationId: 1,
            stateId: 1,
            countryId: 1,
            sectorType: 1,
            industryModel: 1,
            mediaDiscriminator: 1,
            strategyId: 1,
            transitionFromStrategyId: 1,
            transitionStartTurn: 1,
            operatingCapacityUnits: 1,
            capitalStock: 1,
            producedUnits: 1,
            buildQueue: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<State>("states")
      .find({}, { projection: { _id: 1, countryId: 1 } })
      .toArray(),
  ]);
  const owners = state?.sectorTechTreesEnabled
    ? await db
        .collection<Corporation>("corporations")
        .find(
          { _id: { $in: sectors.map((s) => s.corporationId) } },
          {
            projection: {
              type: 1,
              industryModel: 1,
              mediaDiscriminator: 1,
              unlockedTechNodeIds: 1,
              techDecadeLane: 1,
            },
          }
        )
        .toArray()
    : [];
  const byOwner = new Map(owners.map((owner) => [owner._id.toString(), owner]));
  const byRegion = new Map(regions.map((region) => [region._id, region.countryId]));
  const preset = resolvePresetIdFromGameState(state);
  return {
    state,
    preset,
    producers: sectors.map((sector) =>
      buildDemandProducer({
        sector,
        owner: byOwner.get(sector.corporationId.toString()),
        countryId: byRegion.get(sector.stateId),
        techEnabled: state?.sectorTechTreesEnabled === true,
        turn: state?.currentTurn ?? 0,
        preset,
        hardwareInputReliefStartTurn: state?.hardwareInputReliefStartTurn,
      })
    ),
  };
}
