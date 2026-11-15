import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { migration } from "./2026-11-11-region-group-drift-to-buckets";
import { MIGRATIONS } from "../registry";
import { REQUIRED_STARTUP_MIGRATIONS } from "../startupMigrations";

type Doc = Record<string, unknown> & { _id: string };

function fakeDb(docs: Record<string, Doc[]>) {
  const writes: unknown[] = [];
  const finds: Record<string, unknown[]> = {};
  const db = {
    collection: (name: string) => ({
      find: (filter: Record<string, unknown>, options: unknown) => {
        finds[name] = [filter, options];
        const rows = (docs[name] ?? []).filter((doc) => {
          const ids = (filter._id as { $in?: string[] } | undefined)?.$in;
          return ids ? ids.includes(doc._id) : true;
        });
        const iterable = (async function* () {
          for (const d of rows) yield d;
        })();
        return Object.assign(iterable, { toArray: async () => rows });
      },
      bulkWrite: vi.fn(async (ops: unknown[]) => {
        writes.push(...ops);
        return { modifiedCount: ops.length };
      }),
    }),
  } as unknown as Db;
  return { db, writes, finds };
}

const docs = () => ({
  stateDemographics: [
    {
      _id: "US-OH",
      countryId: "US",
      groups: { retirees: { economicLean: 0.5, socialLean: 1 } },
    },
    { _id: "US-PA", countryId: "US", groups: { retirees: { economicLean: 0.4, socialLean: 1 } } },
  ],
  demographicDefaults: [
    { _id: "US-OH", groups: { retirees: { economicLean: 0.4, socialLean: 1 } } },
    { _id: "US-PA", groups: { retirees: { economicLean: 0.4, socialLean: 1 } } },
  ],
});

describe("2026-11-11-region-group-drift-to-buckets", () => {
  it("runs at boot and is registered", () => {
    expect(REQUIRED_STARTUP_MIGRATIONS).toContain(migration);
    expect(MIGRATIONS).toContain(migration);
    expect(migration.idempotent).toBe(true);
  });

  it("moves drift onto the overlay and resets the group row in one write", async () => {
    const { db, writes, finds } = fakeDb(docs());
    const result = await migration.execute(db, { dryRun: false });

    expect(finds.stateDemographics[0]).toEqual({ groups: { $exists: true, $type: "object" } });
    expect(writes).toHaveLength(1);
    const op = writes[0] as {
      updateOne: { filter: unknown; update: { $set: Record<string, number> } };
    };
    expect(op.updateOne.filter).toEqual({ _id: "US-OH" });
    const set = op.updateOne.update.$set;
    expect(set["groups.retirees.economicLean"]).toBe(0.4);
    expect(set["layer1PositionOverrides.age.senior.economicLean"]).toBeCloseTo(0.07, 10);
    expect(set["layer1PositionOverrides.age.mature.economicLean"]).toBeCloseTo(0.03, 10);
    expect(result.documentsScanned).toBe(2);
    expect(result.documentsUpdated).toBe(1);
  });

  it("writes nothing on a dry run", async () => {
    const { db, writes } = fakeDb(docs());
    const result = await migration.execute(db, { dryRun: true });
    expect(writes).toHaveLength(0);
    expect(result.notes).toEqual(["stateDemographics: 1 of 2 regions carry drift to move"]);
  });

  it("does nothing on a world saved without group rows", async () => {
    const { db, writes } = fakeDb({ stateDemographics: [], demographicDefaults: [] });
    const result = await migration.execute(db, { dryRun: false });
    expect(writes).toHaveLength(0);
    expect(result.documentsScanned).toBe(0);
  });
});
