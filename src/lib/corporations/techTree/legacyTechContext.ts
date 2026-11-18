import type { Db } from "mongodb";
import { STARTING_YEAR } from "@/lib/constants/turnTime";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import {
  resolveLegacyTechContext,
  resolveLegacyTechMode,
  type LegacyTechContext,
  type LegacyTechMode,
} from "@/lib/techTree/rules/legacyTech";

/** Read `gameConfig.legacyTechMode`: "baseline", or "off" when absent or anything else. */
export async function loadLegacyTechMode(db: Db): Promise<LegacyTechMode> {
  const cfg = await gameConfigCollection<{ _id: string; legacyTechMode?: unknown }>(db).findOne(
    { _id: "default" },
    { projection: { legacyTechMode: 1 } }
  );
  return resolveLegacyTechMode(cfg?.legacyTechMode);
}

/**
 * The era context every tech effect aggregation needs: the world's starting
 * year and how pre-start-decade nodes count. Pass a `startingYear` the caller
 * already has to skip the game state read for it.
 */
export async function loadLegacyTechContext(
  db: Db,
  known: { startingYear?: number } = {}
): Promise<LegacyTechContext> {
  const [mode, state] = await Promise.all([
    loadLegacyTechMode(db),
    known.startingYear == null
      ? gameStateCollection(db).findOne({ _id: "current" }, { projection: { startingYear: 1 } })
      : Promise.resolve(null),
  ]);
  return resolveLegacyTechContext({
    startingYear: known.startingYear ?? state?.startingYear ?? STARTING_YEAR,
    mode,
  });
}
