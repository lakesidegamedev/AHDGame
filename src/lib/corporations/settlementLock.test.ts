import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withCorporationSettlementLock } from "./settlementLock";

const FIELD = "bondSettlementInProgressAt";
const STALE_MS = 60 * 60 * 1000;

function setup(seed: Record<string, unknown> = {}) {
  const memory = createInMemoryDb();
  const id = new ObjectId();
  memory.seed("corporations", [{ _id: id, ...seed }]);
  const read = async () => memory.collection("corporations").findOne({ _id: id });
  return { db: memory as never, id, memory, read };
}

describe("withCorporationSettlementLock", () => {
  it("claims a free lock, runs, and releases it", async () => {
    const { db, id, read } = setup();
    const seen: unknown[] = [];
    const now = new Date();
    const result = await withCorporationSettlementLock(db, id, FIELD, now, async () => {
      seen.push((await read())?.[FIELD]);
      return "done";
    });
    expect(result).toBe("done");
    expect(seen).toEqual([now]);
    expect((await read())?.[FIELD]).toBeUndefined();
  });

  it("refuses while a live claim is held, with or without a lease window", async () => {
    const now = new Date();
    const held = new Date(now.getTime() - 1000);
    const { db, id, read } = setup({ [FIELD]: held });
    let ran = false;
    const run = async () => {
      ran = true;
    };
    expect(await withCorporationSettlementLock(db, id, FIELD, now, run)).toBeNull();
    expect(
      await withCorporationSettlementLock(db, id, FIELD, now, run, { staleAfterMs: STALE_MS })
    ).toBeNull();
    expect(ran).toBe(false);
    expect((await read())?.[FIELD]).toEqual(held);
  });

  it("stays frozen on an old claim unless the caller opts into takeover", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 10 * STALE_MS);
    const { db, id, read } = setup({ [FIELD]: old });
    expect(await withCorporationSettlementLock(db, id, FIELD, now, async () => "x")).toBeNull();
    expect((await read())?.[FIELD]).toEqual(old);
  });

  it("takes over a stale claim when the caller opts in", async () => {
    const now = new Date();
    const { db, id, read } = setup({ [FIELD]: new Date(now.getTime() - STALE_MS - 1) });
    const result = await withCorporationSettlementLock(db, id, FIELD, now, async () => "x", {
      staleAfterMs: STALE_MS,
    });
    expect(result).toBe("x");
    expect((await read())?.[FIELD]).toBeUndefined();
  });

  it("release does not clear a newer claim", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date(t0.getTime() + 2 * STALE_MS);
    const { db, id, read } = setup();
    const outer = await withCorporationSettlementLock(db, id, FIELD, t0, async () => {
      // The first holder outlives its lease; a second claim takes over.
      await db.collection("corporations").updateOne({ _id: id }, { $set: { [FIELD]: t1 } });
      return "late";
    });
    expect(outer).toBe("late");
    expect((await read())?.[FIELD]).toEqual(t1);
  });
});
