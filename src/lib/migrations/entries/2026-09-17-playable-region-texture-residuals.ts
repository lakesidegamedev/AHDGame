import type { Db } from "mongodb";
import type { AnyBulkWriteOperation } from "mongodb";
import type { Migration, MigrationResult } from "../types";
import type { PoliticalMetricsDoc } from "@/lib/db/types/politicalMetrics";
import { getRegionalTexture1953 } from "@/lib/politicalMetrics/seeds/regionalTexture1953";
import { POLITICAL_METRIC_COUNTRY_IDS, type PoliticalMetricId } from "@/lib/politicalMetrics/types";

const PRESET = "1953-default";
const STARTING_YEAR = 1953;

const MIGRATION_ID = "2026-09-17-playable-region-texture-residuals";

/**
 * Backfill the playable-region texture into live 1953 worlds via `residuals`,
 * not `values`: the dynamics phase drifts values to equilibrium, so a residual
 * delta lets regions glide over turns instead of lurching mid-campaign.
 *
 * residual_new = residual_old + texture because the law book (and the old
 * residual's baseline) is unchanged, so the gap is exactly the texture delta;
 * residuals are fixed at reset, making delta-add correct.
 *
 * Safety rules, all enforced below and covered by the sibling test:
 * - strict preset/startingYear guards; other worlds skipped with a note.
 * - only US/UK/RU/DD regions present in the texture table.
 * - docs without a residuals map are skipped, never invented (lazy self-heal
 *   owns those; fabricating would fork its derivation).
 * - $set the WHOLE residuals map, never a dotted per-family path: board maps
 *   key literal dotted strings, so "residuals.<family>" would nest. Spread the
 *   read doc to preserve sibling families.
 * - idempotent via the stamp field; dry runs read only.
 */
async function backfillPlayableTextureResiduals(db: Db, dryRun: boolean): Promise<MigrationResult> {
  const gameState = await db
    .collection<{ _id: string; preset?: string; startingYear?: number }>("gameState")
    .findOne({ _id: "current" }, { projection: { preset: 1, startingYear: 1 } });
  if (gameState?.preset !== PRESET) {
    return { notes: [`skipped: active preset is ${String(gameState?.preset ?? "unknown")}`] };
  }
  if (gameState.startingYear !== undefined && gameState.startingYear !== STARTING_YEAR) {
    return {
      notes: [`skipped: startingYear is ${String(gameState.startingYear)}, not ${STARTING_YEAR}`],
    };
  }

  const docs = await db
    .collection<PoliticalMetricsDoc>("politicalMetrics")
    .find({ countryId: { $in: [...POLITICAL_METRIC_COUNTRY_IDS] } })
    .toArray();

  const notes: string[] = [];
  let scanned = 0;
  let withoutResiduals = 0;
  let alreadyApplied = 0;
  let noTexture = 0;
  const ops: AnyBulkWriteOperation<PoliticalMetricsDoc>[] = [];
  const perCountry = new Map<string, number>();

  for (const doc of docs) {
    scanned++;
    const regionId = String(doc._id);
    const countryId = String(doc.countryId);
    const texture =
      getRegionalTexture1953()[countryId as keyof ReturnType<typeof getRegionalTexture1953>]?.[
        regionId
      ];
    if (!texture || Object.keys(texture).length === 0) {
      noTexture++;
      continue;
    }
    const prior = doc.residuals;
    if (!prior) {
      withoutResiduals++;
      continue;
    }
    if (doc.playableTexture1953MigrationId === MIGRATION_ID) {
      alreadyApplied++;
      continue;
    }
    // Whole-map rewrite with the delta folded in: dotted per-family $set
    // paths would nest under "residuals" instead of landing on the literal
    // dotted key. Siblings spread forward untouched.
    const residuals: Record<PoliticalMetricId, number> = { ...prior };
    let touched = 0;
    for (const [familyId, delta] of Object.entries(texture)) {
      if (typeof delta !== "number" || delta === 0) continue;
      const id = familyId as PoliticalMetricId;
      residuals[id] = (prior[id] ?? 0) + delta;
      touched++;
    }
    if (touched === 0) {
      noTexture++;
      continue;
    }
    perCountry.set(countryId, (perCountry.get(countryId) ?? 0) + 1);
    if (dryRun) continue;
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            residuals,
            playableTexture1953MigrationId: MIGRATION_ID,
            lastUpdated: new Date(),
          },
        },
      },
    });
  }

  const wouldWrite = [...perCountry.values()].reduce((n, c) => n + c, 0);
  for (const [countryId, count] of [...perCountry.entries()].sort()) {
    notes.push(`${countryId}: ${dryRun ? "would texture" : "textured"} ${count} region(s)`);
  }
  if (withoutResiduals > 0) {
    notes.push(
      `${withoutResiduals} doc(s) have no residuals map — skipped for the dynamics self-heal`
    );
  }
  if (alreadyApplied > 0) notes.push(`${alreadyApplied} doc(s) already stamped — skipped`);
  if (noTexture > 0) notes.push(`${noTexture} doc(s) carry no texture — skipped`);

  if (dryRun) {
    notes.push(`dry run: no writes performed (${wouldWrite} doc(s) would be updated)`);
    return { documentsScanned: scanned, documentsUpdated: 0, notes };
  }
  if (ops.length === 0) {
    notes.push("nothing to backfill");
    return { documentsScanned: scanned, documentsUpdated: 0, notes };
  }

  const result = await db
    .collection<PoliticalMetricsDoc>("politicalMetrics")
    .bulkWrite(ops, { ordered: false });
  const documentsUpdated = result.modifiedCount ?? 0;
  if (documentsUpdated !== ops.length) {
    notes.push(
      `${ops.length - documentsUpdated} doc(s) did not report a modification; left untouched`
    );
  }
  return { documentsScanned: scanned, documentsUpdated, notes };
}

export const migration: Migration = {
  id: MIGRATION_ID,
  description:
    "Backfill the 1953 playable-region texture into live residuals (in-place per-family adds; 1953 worlds only).",
  idempotent: true,
  execute: (db, ctx) => backfillPlayableTextureResiduals(db, ctx.dryRun),
};
