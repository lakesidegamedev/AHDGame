import type { Db } from "mongodb";
import { logWarning } from "@/lib/utils/errorLog";
import type { GameConfig } from "@/lib/db/types";
import { gameConfig } from "@/lib/seeds/reference/gameConfig";
import { assertKnownSeedPreset, strictEraForPreset } from "@/lib/seeds/presetSelector";
import { splitFreshWorldGameConfigFlags } from "@/lib/seeds/reference/featureFlagDefaults";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import type { Document } from "mongodb";

export async function seedGameConfig(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset?: string
) {
  if (preset !== undefined) assertKnownSeedPreset(preset);
  if (reset)
    await gameConfigCollection<Document>(db)
      .drop()
      .catch((error) => {
        logWarning("Collection drop failed (may not exist)", {
          component: "AdminSeed",
          action: "drop collection",
          metadata: { error: String(error) },
        });
      });
  const { _id, ...configData } = gameConfig;
  // Flags and switches are insert-only so a seed run never flips a running
  // world; a reset dropped the collection above, so it receives all of them.
  const { settings, flags } = splitFreshWorldGameConfigFlags(configData);
  const extra: Pick<GameConfig, "seedYear"> =
    preset !== undefined ? { seedYear: parseInt(strictEraForPreset(preset), 10) } : {};
  await gameConfigCollection(db).updateOne(
    { _id },
    { $set: { ...settings, ...extra }, $setOnInsert: flags },
    { upsert: true }
  );
  log("Seeded game config");
}
