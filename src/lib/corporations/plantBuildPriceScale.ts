import type { Db } from "mongodb";
import type { GameConfig } from "@/lib/db/types";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { resolvePlantBuildPriceScale } from "@/lib/corporations/rules/capacityEconomy";

/** Reads `gameConfig.plantBuildPriceScale` once. Call before a loop, never per row. */
export async function loadPlantBuildPriceScale(db: Db): Promise<number> {
  const cfg = await gameConfigCollection<
    Pick<GameConfig, "plantBuildPriceScale"> & { _id: string }
  >(db).findOne({ _id: "default" }, { projection: { plantBuildPriceScale: 1 } });
  return resolvePlantBuildPriceScale(cfg?.plantBuildPriceScale);
}
