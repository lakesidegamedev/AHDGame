/**
 * Migration: move live US and Canadian property crime (metric 32) onto the era
 * scale at once (rules in src/lib/resetMetrics/rules/propertyCrimeReset.ts).
 * Snapshots each board to heal_snapshot_property_crime_era_scale and skips
 * boards already there, so a rerun changes nothing. Writes only if the value
 * is unchanged since read. Run between turns.
 *
 *   npx tsx scripts/migrations/2026-11-24-property-crime-era-scale.ts --dry-run
 *   npx tsx scripts/migrations/2026-11-24-property-crime-era-scale.ts --apply
 */
import { connectDb, closeDb } from "../utils/db";
import { TURNS_PER_YEAR } from "../../src/lib/constants/turnTime";
import { propertyCrimeOnEraScale } from "../../src/lib/resetMetrics/rules/propertyCrimeReset";
import type { ResetMetricSnapshot } from "../../src/lib/resetMetrics/rules/snapshot";
import { resetMetricSnapshotsCollection } from "../../src/lib/db/repositories/resetMetricSnapshots";

const METRIC = "32";
const OPENING_YEAR = 2027;
const SNAPSHOT = "heal_snapshot_property_crime_era_scale";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await connectDb();
  try {
    const boards = await resetMetricSnapshotsCollection<ResetMetricSnapshot>(db)
      .find({ countryId: { $in: ["US", "CA"] }, scope: "regional" })
      .toArray();
    const turns = new Set(boards.map((b) => b.asOfTurn));
    if (turns.size !== 1) throw new Error("Boards are mid-refresh; run between turns");
    const turn = [...turns][0]!;
    const year = OPENING_YEAR + Math.floor((turn - 1) / TURNS_PER_YEAR);
    const snapshot = db.collection<{ _id: string }>(SNAPSHOT);
    const done = new Set((await snapshot.find({}).toArray()).map((d) => String(d._id)));
    let changed = 0;
    for (const board of boards) {
      const observation = board.observations[METRIC];
      const opening = board.openingValues?.[METRIC];
      const current = observation?.value;
      if (done.has(String(board._id))) continue;
      if (observation?.status !== "proxy" || observation.definitionVersion === 2) continue;
      if (typeof current !== "number" || typeof opening !== "number") continue;
      const next = propertyCrimeOnEraScale(opening, current, board.countryId, year);
      if (next === null || Math.abs(next - current) < 0.5) continue;
      changed++;
      console.log(
        `${board._id} opening ${opening.toFixed(1)} current ${current.toFixed(1)} -> ${next.toFixed(1)}`
      );
      if (!apply) continue;
      await snapshot.updateOne(
        { _id: String(board._id) },
        { $setOnInsert: { board, turn, takenAt: new Date() } },
        { upsert: true }
      );
      const history = board.history?.[METRIC] ?? [];
      const set: Record<string, unknown> = { [`observations.${METRIC}.value`]: next };
      if (history.at(-1)?.turn === turn)
        set[`history.${METRIC}`] = history.map((p, i) =>
          i === history.length - 1 ? { ...p, value: next } : p
        );
      const result = await resetMetricSnapshotsCollection<ResetMetricSnapshot>(db).updateOne(
        { _id: board._id, asOfTurn: turn, [`observations.${METRIC}.value`]: current },
        { $set: set }
      );
      if (result.matchedCount !== 1) throw new Error(`${board._id} changed during repair; rerun`);
    }
    console.log(
      `${apply ? "Applied" : "Dry run"}: ${changed} of ${boards.length} regional boards at turn ${turn}`
    );
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
