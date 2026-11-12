import type { AnyBulkWriteOperation, Collection, Db, Document } from "mongodb";
import type { Migration, MigrationContext, MigrationResult } from "../types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { nppsCollection } from "@/lib/db/repositories/npps";

/**
 * Characters and NPPs written by older builds keep their group approvals in
 * `archetypeApprovals`; this build reads only `bucketApprovals`, so without
 * the move every record's approvals read as empty. Keys are already
 * "dim:bucket", so values carry over unchanged.
 *
 * Each legacy value is added to `bucketApprovals` with `$inc` and the legacy
 * field is unset in the same write, filtered on the legacy field existing.
 * The add keeps anything the new build wrote first (a turn can run before the
 * boot pass reaches a record), the single-document write is atomic, and a
 * second run finds nothing to move.
 */

const BATCH = 500;

export interface LegacyApprovalMove {
  inc: Record<string, number>;
  /** Keys Mongo cannot address as a field path, or values that are not numbers. */
  skipped: string[];
}

/** The `$inc` that moves one legacy approval map onto `bucketApprovals`. */
export function legacyApprovalIncrements(legacy: unknown): LegacyApprovalMove {
  const move: LegacyApprovalMove = { inc: {}, skipped: [] };
  if (legacy == null || typeof legacy !== "object" || Array.isArray(legacy)) return move;
  for (const [key, value] of Object.entries(legacy as Record<string, unknown>)) {
    const addressable = key.length > 0 && !key.includes(".") && !key.startsWith("$");
    if (!addressable || typeof value !== "number" || !Number.isFinite(value)) {
      move.skipped.push(key);
      continue;
    }
    if (value !== 0) move.inc[`bucketApprovals.${key}`] = value;
  }
  return move;
}

interface LegacyApprovalDoc extends Document {
  archetypeApprovals?: unknown;
}

async function moveCollection(
  name: string,
  collection: Collection<LegacyApprovalDoc>,
  dryRun: boolean,
  result: Required<Pick<MigrationResult, "documentsScanned" | "documentsUpdated">> & {
    notes: string[];
  }
): Promise<void> {
  const filter = { archetypeApprovals: { $exists: true } };
  const cursor = collection.find(filter, { projection: { _id: 1, archetypeApprovals: 1 } });
  let ops: AnyBulkWriteOperation<LegacyApprovalDoc>[] = [];
  let scanned = 0;
  let updated = 0;
  const skipped = new Set<string>();
  const flush = async () => {
    if (ops.length === 0) return;
    if (!dryRun) {
      const res = await collection.bulkWrite(ops, { ordered: false });
      updated += res.modifiedCount;
    }
    ops = [];
  };
  for await (const doc of cursor) {
    scanned += 1;
    const move = legacyApprovalIncrements(doc.archetypeApprovals);
    for (const key of move.skipped) skipped.add(key);
    const update: Document = { $unset: { archetypeApprovals: "" } };
    if (Object.keys(move.inc).length > 0) update.$inc = move.inc;
    ops.push({ updateOne: { filter: { _id: doc._id, ...filter }, update } });
    if (ops.length >= BATCH) await flush();
  }
  await flush();
  result.documentsScanned += scanned;
  result.documentsUpdated += updated;
  result.notes.push(
    dryRun ? `${name}: ${scanned} to move` : `${name}: moved ${updated} of ${scanned}`
  );
  if (skipped.size > 0) {
    result.notes.push(`${name}: dropped unusable keys ${[...skipped].sort().join(", ")}`);
  }
}

export const migration: Migration = {
  id: "2026-11-11-bucket-approvals-rename",
  description:
    "Move character and NPP archetypeApprovals onto bucketApprovals, adding to any values already there.",
  idempotent: true,
  async execute(db: Db, ctx: MigrationContext): Promise<MigrationResult> {
    const result = { documentsScanned: 0, documentsUpdated: 0, notes: [] as string[] };
    await moveCollection(
      "characters",
      charactersCollection<LegacyApprovalDoc>(db),
      ctx.dryRun,
      result
    );
    await moveCollection("npps", nppsCollection<LegacyApprovalDoc>(db), ctx.dryRun, result);
    return result;
  },
};
