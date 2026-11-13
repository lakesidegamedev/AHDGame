import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { once } from "node:events";
import { EJSON, type Db } from "mongodb";
import { getActionAuditLogCollection } from "@/lib/db/collections/actionAuditLog";

export interface AuditArchiveResult {
  rows: number;
  path: string;
  dropped: number;
}

export function auditArchivePath(dir: string, databaseName: string, at: Date, suffix = ""): string {
  const stamp = at.toISOString().replace(/[:.]/g, "-");
  return join(dir, `action-audit-${databaseName}-${stamp}${suffix}.ndjson`);
}

/** Dry-run: how many rows a reset would export and drop. Writes nothing. */
export async function planAuditArchive(db: Db): Promise<number> {
  const col = await getActionAuditLogCollection(db);
  return col.estimatedDocumentCount();
}

/**
 * Export every audit row present now to an NDJSON file, then drop exactly those rows.
 * Rows are only dropped after the file has been fully written and closed, and rows
 * written after the export began are left alone.
 */
export async function archiveAndDropAuditLog(
  db: Db,
  options: { dir: string; at: Date; suffix?: string }
): Promise<AuditArchiveResult> {
  const col = await getActionAuditLogCollection(db);
  const path = auditArchivePath(options.dir, db.databaseName, options.at, options.suffix);
  const newest = await col
    .find({}, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();
  if (newest.length === 0) return { rows: 0, path, dropped: 0 };
  const bound = { _id: { $lte: newest[0]._id } };

  await mkdir(options.dir, { recursive: true });
  const out = createWriteStream(path, { flags: "wx" });
  let rows = 0;
  try {
    for await (const doc of col.find(bound).sort({ _id: 1 })) {
      if (!out.write(EJSON.stringify(doc, { relaxed: false }) + "\n")) await once(out, "drain");
      rows += 1;
    }
  } finally {
    out.end();
    await once(out, "finish");
  }
  const { deletedCount } = await col.deleteMany(bound);
  return { rows, path, dropped: deletedCount };
}
