/**
 * Migration: rebase a live 2027-world's regional metric boards onto corrected
 * opening seed data (sourced US state and Canadian provincial tables).
 *
 * Rebuilds each region's opening exactly as the reset does (seed values only,
 * no live macro drift), then for each estimated metric whose opening changed,
 * swaps the opening and moves the current value, prior value and history by the
 * same relation (see src/lib/resetMetrics/rules/openingRebase.ts). Every board
 * it writes is first copied to `heal_snapshot_metric_rebase_<turn>`, and each
 * write only applies if the board is unchanged since it was read.
 *
 * Run between turns, after the deploy that carries the corrected seeds.
 * Idempotent: a second run plans zero changes.
 *
 * Usage:
 *   npx tsx scripts/migrations/rebase2027RegionalMetricOpenings.ts --dry-run
 *   npx tsx scripts/migrations/rebase2027RegionalMetricOpenings.ts --apply
 */
import { connectDb, closeDb } from "../utils/db";
import { buildModeledMetricOpening } from "../../src/lib/resetVersions/rules/modeledMetrics";
import { metricNumbers, modeledSeedMetrics } from "../../src/lib/resetVersions/modeledSeedInputs";
import {
  openingRebaseUpdate,
  planOpeningRebase,
} from "../../src/lib/resetMetrics/rules/openingRebase";
import type { ResetMetricSnapshot } from "../../src/lib/resetMetrics/rules/snapshot";
import { resetMetricSnapshotsCollection } from "../../src/lib/db/repositories/resetMetricSnapshots";

const COUNTRIES = ["US", "CA"] as const;
const PRESET = "2027-default";
const YEAR = 2027;

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await connectDb();
  try {
    const boards = await resetMetricSnapshotsCollection<ResetMetricSnapshot>(db)
      .find({ countryId: { $in: [...COUNTRIES] } })
      .toArray();
    const national = boards.filter((b) => b.scope === "national");
    const regional = boards.filter((b) => b.scope === "regional");
    const worldIds = new Set(boards.map((b) => b.worldId));
    if (worldIds.size !== 1)
      throw new Error(`Expected one world, found ${[...worldIds].join(",")}`);
    const turns = new Set(boards.map((b) => b.asOfTurn));
    if (turns.size !== 1) throw new Error("Boards are mid-refresh; run between turns");
    const turn = [...turns][0]!;
    const [states, demographics] = await Promise.all([
      db
        .collection<{ _id: string; countryId: string; population: number }>("states")
        .find(
          { countryId: { $in: [...COUNTRIES] } },
          { projection: { population: 1, countryId: 1 } }
        )
        .toArray(),
      db
        .collection<{ _id: string; countryId: string; ages: never }>("regionDemographics")
        .find({ countryId: { $in: [...COUNTRIES] } }, { projection: { ages: 1, countryId: 1 } })
        .toArray(),
    ]);
    const ages = new Map(demographics.map((d) => [`${d.countryId}:${d._id}`, d.ages]));
    const regions = COUNTRIES.flatMap((country) => {
      const seed = new Map(modeledSeedMetrics(PRESET, country).map((r) => [String(r._id), r]));
      return states
        .filter((s) => s.countryId === country)
        .map((s) => {
          const source = seed.get(String(s._id));
          const regionAges = ages.get(`${country}:${s._id}`);
          if (!source || !regionAges) throw new Error(`Missing seed input ${country}:${s._id}`);
          return {
            id: String(s._id),
            country,
            population: s.population,
            ages: regionAges,
            values: metricNumbers(source),
          };
        });
    });
    const rebuilt = buildModeledMetricOpening({
      worldId: [...worldIds][0]!,
      turn: 1,
      preset: PRESET,
      year: YEAR,
      fiscalYears: {},
      regions,
      national: Object.fromEntries(national.map((b) => [b.countryId, b.observations])) as never,
    }).filter((b) => b.scope === "regional");
    const correctedById = new Map(rebuilt.map((b) => [b._id, b.openingValues ?? {}]));
    const snapshot = db.collection(`heal_snapshot_metric_rebase_t${turn}`);
    let boardsChanged = 0;
    let metricsChanged = 0;
    for (const board of regional) {
      const corrected = correctedById.get(board._id);
      if (!corrected) throw new Error(`No rebuilt opening for ${board._id}`);
      const plan = planOpeningRebase(board, corrected);
      if (!plan.length) continue;
      boardsChanged++;
      metricsChanged += plan.length;
      for (const row of plan)
        console.log(
          `${board._id} ${row.metricId} ${row.mode} opening ${row.oldOpening.toFixed(2)} -> ${row.newOpening.toFixed(2)}, now ${row.oldCurrent.toFixed(2)} -> ${row.newCurrent.toFixed(2)}`
        );
      if (!apply) continue;
      await snapshot.updateOne(
        { _id: board._id as never },
        { $setOnInsert: { board, takenAt: new Date() } },
        { upsert: true }
      );
      const result = await resetMetricSnapshotsCollection<ResetMetricSnapshot>(db).updateOne(
        { _id: board._id, asOfTurn: board.asOfTurn, openingValues: board.openingValues },
        { $set: openingRebaseUpdate(board, plan) }
      );
      if (result.matchedCount !== 1) throw new Error(`${board._id} changed during rebase; rerun`);
    }
    console.log(
      `${apply ? "Applied" : "Dry run"}: ${metricsChanged} metrics on ${boardsChanged} of ${regional.length} regional boards at turn ${turn}`
    );
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
