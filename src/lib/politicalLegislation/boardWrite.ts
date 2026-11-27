/** Literal dotted board keys require whole-object updates within a transaction. */
import { withSessionDb } from "@/lib/db/sessionDb";
import type { AnyBulkWriteOperation, Db, Filter } from "mongodb";
import type { PoliticalMetricsDoc } from "@/lib/db/types/politicalMetrics";
import type { PoliticalMetricId } from "@/lib/politicalMetrics/types";
import { politicalMetricsCollection } from "@/lib/db/repositories/politicalMetrics";

const clampScore = (v: number) => Math.max(0, Math.min(100, v));

export interface BoardDeltaResult {
  regionsUpdated: number;
}

/**
 * Add `scoreDelta` to one family across every region matching `filter`.
 *
 * Values clamp to 0-100. Residuals do NOT: a residual is a signed gap, and
 * clamping it would quietly cap how far a structural effect can push. The
 * composed target is clamped by `composeTarget` at read time instead.
 */
export async function applyBoardDelta(
  db: Db,
  filter: Filter<PoliticalMetricsDoc>,
  familyId: string,
  scoreDelta: number,
  mode: "value" | "residual"
): Promise<BoardDeltaResult> {
  if (!Number.isFinite(scoreDelta) || scoreDelta === 0) return { regionsUpdated: 0 };
  return withSessionDb(db, (db) => applyBoardDeltaWork(db, filter, familyId, scoreDelta, mode));
}

async function applyBoardDeltaWork(
  db: Db,
  filter: Filter<PoliticalMetricsDoc>,
  familyId: string,
  scoreDelta: number,
  mode: "value" | "residual"
): Promise<BoardDeltaResult> {
  const docs = await politicalMetricsCollection(db).find(filter).toArray();
  if (docs.length === 0) return { regionsUpdated: 0 };

  const id = familyId as PoliticalMetricId;
  const now = new Date();
  const ops: AnyBulkWriteOperation<PoliticalMetricsDoc>[] = [];

  for (const doc of docs) {
    if (mode === "value") {
      const current = doc.values?.[id];
      if (typeof current !== "number" || !Number.isFinite(current)) continue;
      const next = clampScore(current + scoreDelta);
      if (next === current) continue;
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { values: { ...doc.values, [id]: next }, lastUpdated: now } },
        },
      });
    } else {
      // A doc with no residuals yet is left alone: the dynamics phase heals it
      // to `value - lawTarget` on its next touch, and pre-empting that here
      // would bake this delta into what is supposed to be the RESET-time
      // structural gap.
      if (!doc.residuals) continue;
      const current = doc.residuals[id];
      const base = typeof current === "number" && Number.isFinite(current) ? current : 0;
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: { residuals: { ...doc.residuals, [id]: base + scoreDelta }, lastUpdated: now },
          },
        },
      });
    }
  }

  if (ops.length === 0) return { regionsUpdated: 0 };
  await politicalMetricsCollection(db).bulkWrite(ops);
  return { regionsUpdated: ops.length };
}

export interface BoardDelta {
  familyId: string;
  scoreDelta: number;
}

/**
 * Apply per-region VALUE deltas in one read and one write.
 *
 * Same arithmetic as calling `applyBoardDelta` once per delta in order (each
 * step clamps before the next is added), but the SOE mandate loop was doing
 * exactly that for ~650 region/family pairs a turn, which on a remote Mongo
 * is ~1,300 serial round trips.
 */
export async function applyBoardValueDeltasByRegion(
  db: Db,
  deltasByRegion: ReadonlyMap<string, readonly BoardDelta[]>
): Promise<BoardDeltaResult> {
  if (!deltasByRegion.size) return { regionsUpdated: 0 };
  return withSessionDb(db, (db) => applyBoardValueDeltasByRegionWork(db, deltasByRegion));
}

async function applyBoardValueDeltasByRegionWork(
  db: Db,
  deltasByRegion: ReadonlyMap<string, readonly BoardDelta[]>
): Promise<BoardDeltaResult> {
  const regionIds = [...deltasByRegion.keys()];
  if (regionIds.length === 0) return { regionsUpdated: 0 };

  const docs = await politicalMetricsCollection(db)
    .find({ _id: { $in: regionIds } } as Filter<PoliticalMetricsDoc>)
    .toArray();
  if (docs.length === 0) return { regionsUpdated: 0 };

  const now = new Date();
  const ops: AnyBulkWriteOperation<PoliticalMetricsDoc>[] = [];
  for (const doc of docs) {
    const deltas = deltasByRegion.get(String(doc._id));
    if (!deltas || deltas.length === 0) continue;
    const values = { ...doc.values };
    let changed = false;
    for (const { familyId, scoreDelta } of deltas) {
      if (!Number.isFinite(scoreDelta) || scoreDelta === 0) continue;
      const id = familyId as PoliticalMetricId;
      const current = values[id];
      if (typeof current !== "number" || !Number.isFinite(current)) continue;
      const next = clampScore(current + scoreDelta);
      if (next === current) continue;
      values[id] = next;
      changed = true;
    }
    if (!changed) continue;
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { values, lastUpdated: now } },
      },
    });
  }

  if (ops.length === 0) return { regionsUpdated: 0 };
  await politicalMetricsCollection(db).bulkWrite(ops);
  return { regionsUpdated: ops.length };
}
