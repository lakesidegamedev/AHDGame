import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { buildTxLogFilter, queryTxLog, TX_LOG_SORT } from "../queryLogs";

type Row = { _id: ObjectId; turn: number; createdAt: Date; type: string };

// _id order (write order) deliberately disagrees with turn order, as in prod.
const rows: Row[] = [
  { turn: 696, at: 1000 },
  { turn: 780, at: 2000 },
  { turn: 732, at: 3000 },
  { turn: 768, at: 4000 },
  { turn: 744, at: 5000 },
  // same turn, same createdAt: only _id can break the tie
  { turn: 780, at: 2000 },
  { turn: 780, at: 2500 },
].map((r, i) => ({
  _id: new ObjectId((i + 1).toString(16).padStart(24, "0")),
  turn: r.turn,
  createdAt: new Date(r.at),
  type: "transfer",
}));

type Doc = Record<string, unknown>;

function key(v: unknown): number | string {
  if (v instanceof Date) return v.getTime();
  if (v instanceof ObjectId) return v.toHexString();
  return v as number | string;
}

// Tiny evaluator for exactly the operators the ledger filter and cursor use.
function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([field, cond]) => {
    if (field === "$and") return (cond as Doc[]).every((c) => matches(doc, c));
    if (field === "$or") return (cond as Doc[]).some((c) => matches(doc, c));
    const v = key(doc[field]);
    const isOps =
      typeof cond === "object" &&
      cond !== null &&
      !(cond instanceof Date) &&
      !(cond instanceof ObjectId);
    if (!isOps) return v === key(cond);
    return Object.entries(cond as Doc).every(([op, raw]) => {
      const o = key(raw);
      if (op === "$lt") return v < o;
      if (op === "$lte") return v <= o;
      if (op === "$gte") return v >= o;
      throw new Error(`unsupported operator ${op}`);
    });
  });
}

function fakeDb(): Db {
  return {
    collection: () => ({
      find: (filter: Doc) => ({
        sort: (spec: Record<string, 1 | -1>) => ({
          limit: (n: number) => ({
            toArray: async () =>
              rows
                .filter((r) => matches(r as unknown as Doc, filter))
                .sort((a, b) => {
                  for (const [f, dir] of Object.entries(spec)) {
                    const x = key((a as unknown as Doc)[f]);
                    const y = key((b as unknown as Doc)[f]);
                    if (x !== y) return (x < y ? -1 : 1) * dir;
                  }
                  return 0;
                })
                .slice(0, n),
          }),
        }),
      }),
    }),
  } as unknown as Db;
}

async function seed(): Promise<Db> {
  return fakeDb();
}

function filterFor(qs: string) {
  const built = buildTxLogFilter(new URLSearchParams(qs));
  if (!built.ok) throw new Error(built.error);
  return built;
}

describe("queryTxLog ordering", () => {
  it("sorts by turn, then createdAt, then _id, newest first", () => {
    expect(TX_LOG_SORT).toEqual({ turn: -1, createdAt: -1, _id: -1 });
  });

  it("lists rows in turn order, not write order", async () => {
    const db = await seed();
    const { filter, limit } = filterFor("limit=50");
    const { entries, hasMore, nextCursor } = await queryTxLog(db, filter, limit);
    expect(entries.map((e) => e.turn)).toEqual([780, 780, 780, 768, 744, 732, 696]);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
  });

  it("pages through every row exactly once with the cursor", async () => {
    const db = await seed();
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const qs = new URLSearchParams({ limit: "2" });
      if (cursor) qs.set("cursor", cursor);
      const built = filterFor(qs.toString());
      const res = await queryTxLog(db, built.filter, built.limit);
      seen.push(...res.entries.map((e) => e._id.toHexString()));
      cursor = res.nextCursor;
      if (!res.hasMore) break;
    }
    const expected = [...rows]
      .sort(
        (a, b) =>
          b.turn - a.turn ||
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (b._id.toHexString() < a._id.toHexString() ? -1 : 1)
      )
      .map((r) => r._id.toHexString());
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it("keeps the cursor compatible with turn range filters", async () => {
    const db = await seed();
    const first = filterFor("limit=1&turnMin=740&turnMax=780");
    const res = await queryTxLog(db, first.filter, first.limit);
    const next = filterFor(`limit=50&turnMin=740&turnMax=780&cursor=${res.nextCursor}`);
    const rest = await queryTxLog(db, next.filter, next.limit);
    expect([...res.entries, ...rest.entries].map((e) => e.turn)).toEqual([780, 780, 780, 768, 744]);
  });

  it("rejects malformed and legacy bare-id cursors", () => {
    expect(buildTxLogFilter(new URLSearchParams("cursor=zzz")).ok).toBe(false);
    expect(buildTxLogFilter(new URLSearchParams(`cursor=${new ObjectId().toHexString()}`)).ok).toBe(
      false
    );
  });
});
