import { describe, it, expect } from "vitest";
import { makeStrictInMemoryStore } from "@/lib/test-utils/inMemoryStore";
import { ObjectId } from "mongodb";
import {
  listCollections,
  MAX_QUERY_LIMIT,
  reviveExtendedJson,
  runCount,
  runDistinct,
  runQuery,
} from "./inspect";

function seed() {
  return makeStrictInMemoryStore({
    widgets: [
      { _id: "w1", kind: "a", bad: true },
      { _id: "w2", kind: "b", bad: true },
      { _id: "w3", kind: "a", bad: false },
    ],
  });
}

describe("runQuery", () => {
  it("returns matched and returned counts separately", async () => {
    const { db } = seed();
    const result = await runQuery(db, { collection: "widgets", filter: { bad: true } });
    expect(result.matched).toBe(2);
    expect(result.returned).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("caps the limit so a query cannot pull a whole collection into a response", async () => {
    const { db } = seed();
    const result = await runQuery(db, { collection: "widgets", limit: 10_000 });
    expect(result.returned).toBeLessThanOrEqual(MAX_QUERY_LIMIT);
  });

  it("needs a collection", async () => {
    const { db } = seed();
    await expect(runQuery(db, { collection: "" })).rejects.toThrow(/needs a collection/);
  });

  describe("server-side code execution", () => {
    const banned = [
      { $where: "this.bad === true" },
      { $expr: { $function: { body: "function(){}", args: [], lang: "js" } } },
      { kind: { $function: { body: "x" } } },
    ];

    it.each(banned)("refuses %j", async (filter) => {
      const { db } = seed();
      await expect(
        runQuery(db, { collection: "widgets", filter: filter as Record<string, unknown> })
      ).rejects.toThrow(/not permitted/);
    });
  });
});

describe("runCount", () => {
  it("counts", async () => {
    const { db } = seed();
    expect(await runCount(db, "widgets", { bad: true })).toBe(2);
    expect(await runCount(db, "widgets")).toBe(3);
  });

  it("refuses $where", async () => {
    const { db } = seed();
    await expect(runCount(db, "widgets", { $where: "1" })).rejects.toThrow(/not permitted/);
  });
});

describe("runDistinct", () => {
  it("refuses $where", async () => {
    const { db } = seed();
    await expect(runDistinct(db, "widgets", "kind", { $where: "1" })).rejects.toThrow(
      /not permitted/
    );
  });
});

describe("listCollections", () => {
  it("counts collections concurrently and returns them sorted", async () => {
    let active = 0;
    let peak = 0;
    const names = Array.from({ length: 40 }, (_, i) => `c${String(i).padStart(2, "0")}`);
    const db = {
      listCollections: () => ({
        toArray: async () =>
          [...names]
            .reverse()
            .map((name) => ({ name }))
            .concat([{ name: "system.views" }]),
      }),
      collection: (name: string) => ({
        estimatedDocumentCount: async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 2));
          active--;
          return Number(name.slice(1));
        },
      }),
    } as unknown as Parameters<typeof listCollections>[0];
    const rows = await listCollections(db);
    expect(rows.map((r) => r.name)).toEqual(names);
    expect(rows[7]).toEqual({ name: "c07", count: 7 });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(16);
  });
});

describe("reviveExtendedJson", () => {
  const hex = "6ac550c1aaada07aa97fad81";

  it("turns $oid into an ObjectId, including inside $in", () => {
    const out = reviveExtendedJson({
      _id: { $oid: hex },
      owner: { $in: [{ $oid: hex }, "plain"] },
    }) as { _id: ObjectId; owner: { $in: unknown[] } };
    expect(out._id).toBeInstanceOf(ObjectId);
    expect(out._id.toHexString()).toBe(hex);
    expect(out.owner.$in[0]).toBeInstanceOf(ObjectId);
    expect(out.owner.$in[1]).toBe("plain");
  });

  it("turns $date (ISO, millis or $numberLong) into a Date", () => {
    const iso = "2026-10-28T00:00:00.000Z";
    const out = reviveExtendedJson({
      a: { $gte: { $date: iso } },
      b: { $date: Date.parse(iso) },
      c: { $date: { $numberLong: String(Date.parse(iso)) } },
    }) as { a: { $gte: Date }; b: Date; c: Date };
    expect(out.a.$gte.toISOString()).toBe(iso);
    expect(out.b.toISOString()).toBe(iso);
    expect(out.c.toISOString()).toBe(iso);
  });

  it("leaves operators, invalid ids and plain values alone", () => {
    const filter = { n: { $gt: 3 }, id: { $oid: "not-hex" }, s: "x", list: [1, 2] };
    expect(reviveExtendedJson(filter)).toEqual(filter);
  });
});
