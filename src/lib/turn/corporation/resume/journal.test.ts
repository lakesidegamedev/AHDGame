import { describe, expect, it } from "vitest";
import { ObjectId, type Db, type Document } from "mongodb";
import { applyJournaledOps, type JournalContext } from "./journal";

/** Minimal in-memory stand-in for the journal collection. */
function fakeDb(): Db {
  const rows = new Map<string, Document>();
  const matches = (row: Document, filter: Document) =>
    Object.entries(filter).every(([k, v]) =>
      typeof v === "object" && v !== null && "$lt" in v
        ? row[k] < (v as { $lt: number }).$lt
        : row[k] === v
    );
  const setPath = (row: Document, path: string, value: unknown) => {
    const parts = path.split(".");
    let cur = row;
    for (const p of parts.slice(0, -1)) cur = cur[p] ??= {};
    cur[parts.at(-1)!] = value;
  };
  const collection = {
    findOne: async (f: Document) => rows.get(f._id) ?? null,
    insertMany: async (docs: Document[]) => docs.forEach((d) => rows.set(d._id, d)),
    deleteMany: async (f: Document) => {
      for (const [id, row] of rows) if (matches(row, f)) rows.delete(id);
    },
    updateOne: async (f: Document, u: Document) => {
      const row = rows.get(f._id) ?? {};
      if (!rows.has(f._id)) Object.assign(row, { _id: f._id, ...u.$setOnInsert });
      for (const [k, v] of Object.entries(u.$set ?? {})) setPath(row, k, v);
      for (const [k, v] of Object.entries(u.$addToSet ?? {})) {
        const parts = k.split(".");
        let cur = row;
        for (const p of parts.slice(0, -1)) cur = cur[p] ??= {};
        const list = (cur[parts.at(-1)!] ??= []) as unknown[];
        if (!list.includes(v)) list.push(v);
      }
      rows.set(f._id, row);
    },
  };
  return { collection: () => collection } as unknown as Db;
}

const op = (id: ObjectId, n: number) => ({
  updateOne: { filter: { _id: id }, update: { $inc: { cash: n } } },
});

describe("applyJournaledOps", () => {
  it("writes directly below stage 2", async () => {
    const calls: number[] = [];
    const ctx: JournalContext = { db: fakeDb(), stage: 1, turn: 5 };
    const r = await applyJournaledOps(
      ctx,
      "corporationCash",
      [op(new ObjectId(), 1)],
      async (c) => {
        calls.push(c.length);
      }
    );
    expect(r).toBe("direct");
    expect(calls).toEqual([1]);
  });

  it("stores the plan, and a resume applies the stored plan, not the recomputed one", async () => {
    const db = fakeDb();
    const ctx: JournalContext = { db, stage: 2, turn: 5, worldEpoch: "w1" };
    const id = new ObjectId();
    const applied: Document[][] = [];
    await applyJournaledOps(ctx, "corporationCash", [op(id, 7)], async (chunk) => {
      applied.push(chunk);
      throw new Error("crash before the chunk is marked");
    }).catch(() => undefined);
    expect(applied).toHaveLength(1);
    expect(Object.keys(applied[0]![0]!.updateOne.filter)).toContain(
      "corpTurnApplied.corporationCash.0"
    );

    // Resume: the recomputed plan differs, the stored one wins and is applied once.
    const replay: Document[][] = [];
    const r = await applyJournaledOps(ctx, "corporationCash", [op(id, 999)], async (chunk) => {
      replay.push(chunk);
    });
    expect(r).toBe("replayed");
    expect(replay).toHaveLength(1);
    expect(replay[0]![0]!.updateOne.update).toMatchObject({ $inc: { cash: 7 } });
    expect(replay[0]![0]!.updateOne.filter._id).toEqual(id);

    // Third run: everything applied, nothing written.
    const again: Document[][] = [];
    await applyJournaledOps(ctx, "corporationCash", [op(id, 1)], async (c) => {
      again.push(c);
    });
    expect(again).toEqual([]);
  });

  it("refuses to replay a plan that could not be stamped", async () => {
    const ctx: JournalContext = { db: fakeDb(), stage: 2, turn: 6 };
    await applyJournaledOps(
      ctx,
      "sectorWrites",
      [{ insertOne: { document: { a: 1 } } }],
      async () => {
        throw new Error("crash");
      }
    ).catch(() => undefined);
    const r = await applyJournaledOps(ctx, "sectorWrites", [], async () => undefined);
    expect(r).toBe("unreplayable");
  });
});
