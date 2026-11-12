import type { Db } from "mongodb";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/**
 * Stamps gameState.currentYear/startingYear/preset for the given preset.
 *
 * bootstrapGameWorld() above seeds every country's region/party/demographic
 * data correctly for the requested `preset` (seedAllCountryData receives and
 * threads it throughout) — but it does NOT set the game-clock fields on the
 * gameState document. Those are normally set by the separate, higher-level
 * resetGameWorld() (src/lib/admin/resetGameWorld.ts) BEFORE it calls
 * bootstrapGameWorld() — bootstrapGameWorld's own internal
 * initializeGameState() call is idempotent (no-ops if a gameState doc
 * already exists), so resetGameWorld's earlier stamp survives. The
 * admin reset flow (resetAndBootstrapGameWorld → resetGameWorld then
 * bootstrapGameWorld) already gets this right.
 *
 * bootstrapGameWorld() is deliberately left alone here rather than made to
 * stamp the clock itself: it's also used to re-seed reference data on an
 * EXISTING, already-running world (resetReference re-seeds without
 * resetting), where forcibly resetting currentYear back to the preset's
 * starting year would be wrong.
 *
 * Direct callers that bootstrap a genuinely FRESH/EMPTY database — and
 * therefore DO need the clock to land correctly — must call this BEFORE
 * bootstrapGameWorld(), via initializeGameState() first (so the doc exists)
 * then this. See scripts/bootstrap-full.ts and scripts/sim/runWorld.ts.
 * Found the hard way: stamping after bootstrap (instead of before) leaves
 * region data correctly era-flavored but every election bootstrapGameWorld
 * spawns internally still anchors to whatever preset was in gameState at
 * call time — i.e. still wrong, just less obviously.
 */
export async function stampInitialGameClock(db: Db, preset: string): Promise<void> {
  const startingYear = getStartingYearForPreset(preset);
  await gameStateCollection(db).updateOne(
    { _id: "current" },
    { $set: { currentYear: startingYear, startingYear, preset, updatedAt: new Date() } }
  );
}
