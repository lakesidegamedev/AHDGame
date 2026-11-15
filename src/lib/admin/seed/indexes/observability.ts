import type { Db } from "mongodb";
import { ensureIndex } from "./helpers";

/**
 * Indexes for the admin observability layer: game health snapshots.
 */
export async function seedObservabilityIndexes(db: Db, log: (msg: string) => void) {
  log("Game health snapshot indexes:");

  // 30-day TTL so admin health history doesn't grow unbounded.
  await ensureIndex(
    db,
    "gameHealthSnapshots",
    { timestamp: 1 },
    { name: "ghs_timestamp_ttl", expireAfterSeconds: 30 * 24 * 60 * 60 },
    log
  );

  await ensureIndex(db, "gameHealthSnapshots", { turn: -1 }, { name: "ghs_turn_desc" }, log);

  await ensureIndex(
    db,
    "gameHealthSnapshots",
    { "turnProcessing.warningCount": 1, "turnProcessing.errorCount": 1, turn: -1 },
    { name: "ghs_warnings_errors_turn" },
    log
  );

  log("Observability indexes ensured");
}
