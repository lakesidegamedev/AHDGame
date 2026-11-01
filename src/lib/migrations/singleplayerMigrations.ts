// Migrations for singleplayer worlds.
//
// A hosted world gets its registry migrations from an operator
// (`npm run migrate`) and its required repairs from `instrumentation.ts`. A
// local world gets neither: the standalone server never calls `register()`,
// and there is no operator. A save outlives the build that created it, so a
// client update opens an old world with new code that assumes those
// migrations ran.
//
// The rule: a world seeded by a build is current with that build's registry.
// World creation stamps every migration the build knows (the baseline marker
// records that it happened). On every start, pending migrations run in
// registry order, so a later build applies exactly the ones written after the
// world's build.
//
// Saves created before the baseline existed carry no stamp. No desktop client
// bundled a game from before 2026-09-04 (singleplayer shipped 2026-09-05), so
// for those the catch-up starts at that date.

import type { Db } from "mongodb";
import { resumePendingDemographicFlowReceipts } from "@/lib/demographics/flowJournal";
import { migration as ukJpSubdivisionPopulations } from "./entries/2026-11-01-uk-jp-subdivision-populations";
import { migration as countyPopulations } from "./entries/2026-10-30-county-populations";
import { MIGRATIONS } from "./registry";
import { runMigrations, type RunSummary } from "./runner";
import { runRequiredStartupMigrations } from "./startupMigrations";
import type { Migration, MigrationMarker } from "./types";

const COLLECTION = "migrationsRun";

/** Marker id written when a local world is stamped current with its build. */
export const SINGLEPLAYER_BASELINE_MARKER = "singleplayer-registry-baseline";

/** Earliest migration a pre-baseline save can be missing. */
export const SINGLEPLAYER_LEGACY_CUTOFF = "2026-09-04";

/**
 * The registry chain plus the held entries a local world needs and can take
 * safely. County stocks are held on the hosted world because population
 * writers must be paused; a local world at startup or right after a reset
 * runs no turn, and demographicFlows fails every turn without them.
 */
export const SINGLEPLAYER_MIGRATIONS: readonly Migration[] = [
  ...MIGRATIONS,
  countyPopulations,
  ukJpSubdivisionPopulations,
];

function datedOnOrAfter(id: string, cutoff: string): boolean {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(id)?.[0];
  return date != null && date >= cutoff;
}

/** Marks every singleplayer migration as applied without running it. */
export async function stampSingleplayerBaseline(db: Db): Promise<number> {
  const completedAt = new Date();
  const ids = [...SINGLEPLAYER_MIGRATIONS.map((m) => m.id), SINGLEPLAYER_BASELINE_MARKER];
  const result = await db.collection<MigrationMarker>(COLLECTION).bulkWrite(
    ids.map((id) => ({
      updateOne: {
        filter: { _id: id },
        update: {
          $setOnInsert: {
            _id: id,
            completedAt,
            markerVersion: 1 as const,
            result: { notes: ["singleplayer baseline: world seeded by this build"] },
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  return result.upsertedCount;
}

/**
 * Brings an existing local world up to this build. No world means nothing to
 * migrate: creating one stamps the baseline.
 */
export async function migrateSingleplayerWorld(db: Db): Promise<RunSummary | null> {
  const world = await db
    .collection<{ _id: string; worldEpochId?: string; currentTurn?: number }>("gameState")
    .findOne({ _id: "current" }, { projection: { _id: 1, worldEpochId: 1, currentTurn: 1 } });
  if (!world) return null;

  const stamped = await db
    .collection<MigrationMarker>(COLLECTION)
    .findOne({ _id: SINGLEPLAYER_BASELINE_MARKER }, { projection: { _id: 1 } });
  const migrations = stamped
    ? [...SINGLEPLAYER_MIGRATIONS]
    : SINGLEPLAYER_MIGRATIONS.filter((m) => datedOnOrAfter(m.id, SINGLEPLAYER_LEGACY_CUTOFF));

  // A failed chain entry must not withhold the required repairs, and must not
  // be stamped as applied: it stays pending for the next start.
  let chain: RunSummary;
  try {
    // The launcher has not let the player in yet, so no local turn is running.
    // Finish only already-frozen outcomes before stock migrations inspect totals;
    // this never starts a new turn or recomputes a crashed phase's demographics.
    if (
      typeof world.worldEpochId === "string" &&
      world.worldEpochId.length > 0 &&
      Number.isSafeInteger(world.currentTurn) &&
      world.currentTurn! >= 0 &&
      world.currentTurn! < Number.MAX_SAFE_INTEGER
    )
      await resumePendingDemographicFlowReceipts(db, world.worldEpochId, world.currentTurn! + 1);
    chain = await runMigrations(db, { migrations, dryRun: false });
  } catch (error) {
    await runRequiredStartupMigrations(db);
    throw error;
  }
  const required = await runRequiredStartupMigrations(db);
  await stampSingleplayerBaseline(db);

  const ranIds = [...new Set([...chain.ranIds, ...required.ranIds])];
  return {
    ranIds,
    skippedIds: [...new Set([...chain.skippedIds, ...required.skippedIds])].filter(
      (id) => !ranIds.includes(id)
    ),
    results: { ...chain.results, ...required.results },
    dryRun: false,
  };
}
