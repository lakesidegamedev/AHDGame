import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { legacyApprovalIncrements, migration } from "./2026-11-11-bucket-approvals-rename";
import { REQUIRED_STARTUP_MIGRATIONS } from "../startupMigrations";

type Doc = { _id: string; archetypeApprovals?: unknown };

function fakeDb(docs: Record<string, Doc[]>) {
  const writes: Record<string, unknown[]> = {};
  const finds: Record<string, unknown[]> = {};
  const db = {
    collection: (name: string) => ({
      find: (filter: unknown, options: unknown) => {
        finds[name] = [filter, options];
        return (async function* () {
          for (const d of docs[name] ?? []) yield d;
        })();
      },
      bulkWrite: vi.fn(async (ops: unknown[]) => {
        writes[name] = [...(writes[name] ?? []), ...ops];
        return { modifiedCount: ops.length };
      }),
    }),
  } as unknown as Db;
  return { db, writes, finds };
}

describe("legacyApprovalIncrements", () => {
  it("adds every legacy value onto bucketApprovals", () => {
    expect(legacyApprovalIncrements({ "economic:left": 4, "social:urban": -2.5 })).toEqual({
      inc: { "bucketApprovals.economic:left": 4, "bucketApprovals.social:urban": -2.5 },
      skipped: [],
    });
  });

  it("skips keys Mongo cannot address and values that are not numbers", () => {
    const move = legacyApprovalIncrements({ "a.b": 1, $x: 2, c: "3", d: Number.NaN, e: 0 });
    expect(move.inc).toEqual({});
    expect(move.skipped.sort()).toEqual(["$x", "a.b", "c", "d"]);
  });

  it("treats a missing or malformed map as nothing to move", () => {
    expect(legacyApprovalIncrements(null)).toEqual({ inc: {}, skipped: [] });
    expect(legacyApprovalIncrements([1, 2])).toEqual({ inc: {}, skipped: [] });
  });
});

describe("2026-11-11-bucket-approvals-rename", () => {
  it("runs at boot so the first 1.20 turn reads moved approvals", () => {
    expect(REQUIRED_STARTUP_MIGRATIONS).toContain(migration);
    expect(migration.idempotent).toBe(true);
  });

  it("adds legacy approvals and unsets the old field in one write per record", async () => {
    const { db, writes, finds } = fakeDb({
      characters: [{ _id: "c1", archetypeApprovals: { "economic:left": 3 } }],
      npps: [{ _id: "n1", archetypeApprovals: {} }],
    });
    const result = await migration.execute(db, { dryRun: false });

    expect(finds.characters?.[0]).toEqual({ archetypeApprovals: { $exists: true } });
    expect(writes.characters).toEqual([
      {
        updateOne: {
          filter: { _id: "c1", archetypeApprovals: { $exists: true } },
          update: {
            $unset: { archetypeApprovals: "" },
            $inc: { "bucketApprovals.economic:left": 3 },
          },
        },
      },
    ]);
    // An empty legacy map still loses its field, so the next run has nothing to scan.
    expect(writes.npps).toEqual([
      {
        updateOne: {
          filter: { _id: "n1", archetypeApprovals: { $exists: true } },
          update: { $unset: { archetypeApprovals: "" } },
        },
      },
    ]);
    expect(result.documentsUpdated).toBe(2);
  });

  it("writes nothing on a dry run", async () => {
    const { db, writes } = fakeDb({
      characters: [{ _id: "c1", archetypeApprovals: { "economic:left": 3 } }],
    });
    const result = await migration.execute(db, { dryRun: true });
    expect(writes).toEqual({});
    expect(result.documentsScanned).toBe(1);
  });
});
