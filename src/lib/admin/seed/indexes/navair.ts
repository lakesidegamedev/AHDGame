import type { Db } from "mongodb";
import { ensureIndex } from "./helpers";

/**
 * Indexes for the naval and air layer.
 *
 *   - `navairChannels` on (countryId, region), UNIQUE. `saveNavairChannels`
 *     upserts on exactly this pair every turn; without the constraint two
 *     concurrent upserts both insert, silently duplicating rows. The loader's
 *     Map then lets a random row win each turn and a country's sea control
 *     flickers between histories.
 *
 *   - `militaryUnits` on (domain), because `navairOperations` and
 *     `battleResolution` read `{ domain: { $in: ["naval", "air"] } }` every
 *     turn; unindexed that is a full scan twice per turn.
 */
export async function seedNavairIndexes(db: Db, log: (msg: string) => void) {
  log("Naval and air indexes:");

  await ensureIndex(
    db,
    "navairChannels",
    { countryId: 1, region: 1 },
    { name: "navairChannels_country_region_unique", unique: true },
    log
  );

  // Supports the per-turn "every hull and wing in the world" read. Not unique: a country
  // has many units per domain, which is the point.
  await ensureIndex(db, "militaryUnits", { domain: 1 }, { name: "militaryUnits_domain" }, log);

  // Stationing reads and the war room both ask "what is in this region", and the turn
  // pass groups by station. Sparse because only naval and air formations carry one, so
  // the index does not pay for every ground unit in the game.
  await ensureIndex(
    db,
    "militaryUnits",
    { station: 1 },
    { name: "militaryUnits_station", sparse: true },
    log
  );

  // The war room asks "what happened in these regions lately", newest first.
  await ensureIndex(
    db,
    "navairEngagements",
    { region: 1, turn: -1 },
    { name: "navairEngagements_region_turn" },
    log
  );

  log("Naval and air indexes ensured");
}
