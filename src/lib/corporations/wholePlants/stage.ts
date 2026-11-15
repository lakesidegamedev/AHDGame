import type { Db } from "mongodb";
import type { GameConfig } from "@/lib/db/types";
import { wholePlantsOn } from "./rules";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";

/**
 * Reads `gameConfig.wholePlantsStage` once. Call before a loop, never per row.
 * Off (false) on a missing config, which is today's behaviour.
 */
export async function loadWholePlantsOn(db: Db): Promise<boolean> {
  const cfg = await gameConfigCollection<Pick<GameConfig, "wholePlantsStage"> & { _id: string }>(
    db
  ).findOne({ _id: "default" }, { projection: { wholePlantsStage: 1 } });
  return wholePlantsOn(cfg?.wholePlantsStage);
}
