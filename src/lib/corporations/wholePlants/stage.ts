import type { Db } from "mongodb";
import type { GameConfig } from "@/lib/db/types";
import { wholePlantsOn } from "./rules";

/**
 * Reads `gameConfig.wholePlantsStage` once. Call before a loop, never per row.
 * Off (false) on a missing config, which is today's behaviour.
 */
export async function loadWholePlantsOn(db: Db): Promise<boolean> {
  const cfg = await db
    .collection<Pick<GameConfig, "wholePlantsStage"> & { _id: string }>("gameConfig")
    .findOne({ _id: "default" }, { projection: { wholePlantsStage: 1 } });
  return wholePlantsOn(cfg?.wholePlantsStage);
}
