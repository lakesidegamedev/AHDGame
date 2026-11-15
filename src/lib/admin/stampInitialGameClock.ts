import type { Db } from "mongodb";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/** Fresh bootstraps need the preset clock to schedule era-correct elections.
 * Reference-only reseeds preserve the running clock and must skip this helper.
 */
export async function stampInitialGameClock(db: Db, preset: string): Promise<void> {
  const startingYear = getStartingYearForPreset(preset);
  await gameStateCollection(db).updateOne(
    { _id: "current" },
    { $set: { currentYear: startingYear, startingYear, preset, updatedAt: new Date() } }
  );
}
