import type { Db } from "mongodb";
import type { GameConfig } from "@/lib/db/types";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";

/**
 * Advertising agreements ride the paid media operating-model gate: coverage is
 * derived from the operating models a supplier runs, so no model gate means no
 * agreements. Absent or false is off.
 */
export async function isAdvertisingAgreementsEnabled(db: Db): Promise<boolean> {
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { mediaOperatingModelsEnabled: 1 } }
  );
  return config?.mediaOperatingModelsEnabled === true;
}
