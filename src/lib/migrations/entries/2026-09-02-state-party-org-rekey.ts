import type { Db, Document } from "mongodb";
import type { Migration, MigrationResult } from "../types";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { withSessionDb } from "@/lib/db/sessionDb";

/** Ambiguous chapters retain all cash and strength until an explicit reconciliation. */
async function rekeyDriftedStatePartyOrgIds(db: Db, dryRun: boolean): Promise<MigrationResult> {
  const result = await withSessionDb(db, async (db) => {
    const col = statePartyOrgCollection(db);
    const all = await col.find({}).toArray();
    const occupied = new Set(all.map((row) => row._id));
    const scopes = new Map<string, number>();
    for (const row of all) {
      const key = JSON.stringify([row.countryId, row.stateId, row.partyId]);
      scopes.set(key, (scopes.get(key) ?? 0) + 1);
    }
    const duplicateScopes = [...scopes.values()].filter((n) => n > 1).length;
    const claims = new Map<string, number>();
    for (const row of all) {
      if (typeof row.stateId !== "string" || typeof row.partyId !== "string") continue;
      const key = `${row.stateId}_${row.partyId}`;
      claims.set(key, (claims.get(key) ?? 0) + 1);
    }
    let moved = 0,
      retained = 0;
    for (const row of all) {
      if (typeof row.stateId !== "string" || typeof row.partyId !== "string") {
        retained++;
        continue;
      }
      const key = `${row.stateId}_${row.partyId}`;
      if (key === row._id) continue;
      if (occupied.has(key) || claims.get(key) !== 1) {
        retained++;
        continue;
      }
      if (!dryRun) {
        // Delete and replacement share a transaction, including under the unique scope index.
        const removed = await col.deleteOne({
          _id: row._id,
          stateId: row.stateId,
          partyId: row.partyId,
        });
        if (removed.deletedCount !== 1) throw new Error("Chapter changed during rekey");
        await col.insertOne({ ...row, _id: key });
      }
      occupied.delete(row._id);
      occupied.add(key);
      moved++;
    }
    return {
      documentsScanned: all.length,
      documentsInserted: dryRun ? 0 : moved,
      documentsDeleted: dryRun ? 0 : moved,
      notes: [
        `${dryRun ? "dry run: would re-key" : "re-keyed"} ${moved} row(s)`,
        `${retained} ambiguous or incomplete row(s) retained unchanged`,
      ],
      duplicateScopes,
    };
  });
  const { duplicateScopes, ...report } = result;
  if (!dryRun && duplicateScopes === 0) {
    const col = statePartyOrgCollection<Document>(db);
    try {
      await col.createIndex(
        { countryId: 1, stateId: 1, partyId: 1 },
        { unique: true, name: "statePartyOrg_country_state_party_unique" }
      );
      report.notes.push("unique index statePartyOrg_country_state_party_unique ensured");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === 11000)
        report.notes.push(
          "Concurrent duplicate scopes retained; reconcile before installing the unique index"
        );
      else if (code === 85 || code === 86) {
        const equivalent = (await col.indexes()).some(
          (index) =>
            JSON.stringify(index.key) ===
              JSON.stringify({ countryId: 1, stateId: 1, partyId: 1 }) &&
            index.unique === true &&
            !index.sparse &&
            !index.partialFilterExpression
        );
        if (!equivalent) throw error;
        report.notes.push("Equivalent unique scope index already installed");
      } else throw error;
    }
  } else if (duplicateScopes > 0)
    report.notes.push(
      `${duplicateScopes} duplicate scope(s) require reconciliation before the unique index can be installed`
    );
  return report;
}
export const migration: Migration = {
  id: "2026-09-02-state-party-org-rekey",
  description: "Re-key unambiguous state-party chapters atomically, retaining colliding resources",
  idempotent: true,
  execute: (db, ctx) => rekeyDriftedStatePartyOrgIds(db, ctx.dryRun),
};
