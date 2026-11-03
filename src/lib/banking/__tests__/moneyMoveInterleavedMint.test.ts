import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash, InjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyMoneyMove, legStamp, resumeMoneyMove, type MoneyMove } from "../moneyMove";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const WALLETS = 10;

/**
 * The batched producer funding shape: one mint and one credit per wallet,
 * folded into one move, so the legs alternate mint, credit, mint, credit.
 */
function fixture(wallets = WALLETS, overrides: Record<string, Record<string, unknown>> = {}) {
  const memory = createInMemoryDb();
  memory.seed(
    "wallets",
    Array.from({ length: wallets }, (_, i) => ({
      _id: `w-${i}`,
      cash: 5,
      state: "open",
      ...overrides[`w-${i}`],
    }))
  );
  const move: MoneyMove = {
    key: "funding-batch:1",
    kind: "producer_household_transfer",
    turn: 9,
    legs: Array.from({ length: wallets }, (_, i) => [
      { kind: "mint" as const, amount: 10 + i, note: `mint ${i}` },
      {
        kind: "credit" as const,
        amount: 10 + i,
        collection: "wallets",
        filter: { _id: `w-${i}`, state: "open" },
        path: "cash",
        note: `credit ${i}`,
      },
    ]).flat(),
    record: { batchIndependentDebits: true },
  };
  const docs = memory.collection("wallets");
  const journal = memory.collection("bankMoneyMoves");
  const wallet = (i: number) => docs.docs.find((d) => d._id === `w-${i}`)!;
  return { memory, db: memory as unknown as Db, move, docs, journal, wallet };
}

/** Count calls on one collection at the Db boundary. */
function countingDb(memory: ReturnType<typeof createInMemoryDb>, watched: string) {
  const counts: Record<string, number> = {};
  const db = new Proxy(memory, {
    get(target, prop, receiver) {
      if (prop !== "collection") return Reflect.get(target, prop, receiver);
      return (name: string) => {
        const inner = target.collection(name);
        if (name !== watched) return inner;
        return new Proxy(inner, {
          get(c, method, r) {
            const value = Reflect.get(c, method, r);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
              counts[String(method)] = (counts[String(method)] ?? 0) + 1;
              return value.apply(c, args);
            };
          },
        });
      };
    },
  }) as unknown as Db;
  return { db, counts };
}

function expectPaidOnce(f: ReturnType<typeof fixture>) {
  for (let i = 0; i < WALLETS; i++) {
    const row = f.wallet(i);
    expect(row.cash).toBe(5 + 10 + i);
    expect(row.moneyMoveRevision).toBe(1);
    expect(row.pendingMoneyMoveReceipt).toBeUndefined();
    // The stamp names the credit's own leg index, as the per-leg path writes it.
    expect(row.settledKeys).toEqual([legStamp(f.move.key, 2 * i + 1)]);
  }
  const record = f.journal.docs[0] as { status: string; legs: { applied: boolean }[] };
  expect(record.status).toBe("applied");
  expect(record.legs).toHaveLength(2 * WALLETS);
  expect(record.legs.every((leg) => leg.applied)).toBe(true);
}

describe("credits interleaved with mint legs", () => {
  it("delivers them in one batch with the same receipts the per-leg path writes", async () => {
    const f = fixture();
    const { db, counts } = countingDb(f.memory, "wallets");
    const result = await applyMoneyMove(db, f.move);
    expect(result.status).toBe("applied");
    expect(result.applied).toHaveLength(2 * WALLETS);
    expectPaidOnce(f);
    // Per leg this was a read and two writes per wallet. Batched it is two
    // reads and two bulk writes for the whole run.
    expect(counts.bulkWrite).toBe(2);
    expect((counts.updateOne ?? 0) + (counts.findOne ?? 0)).toBe(0);
  });

  it("replays and resumes without paying anyone twice", async () => {
    const f = fixture();
    await applyMoneyMove(f.db, f.move);
    expect((await applyMoneyMove(f.db, f.move)).status).toBe("replayed");
    expect((await resumeMoneyMove(f.db, f.move.key)).status).toBe("applied");
    expectPaidOnce(f);
  });

  it("leaves a refused wallet on the per-leg path and pays the rest", async () => {
    const f = fixture(WALLETS, { "w-3": { state: "closed" } });
    const result = await applyMoneyMove(f.db, f.move);
    expect(result.status).toBe("partial");
    expect(f.wallet(3).cash).toBe(5);
    for (const i of [0, 1, 2, 4, 9]) expect(f.wallet(i).cash).toBe(5 + 10 + i);
    const record = f.journal.docs[0] as { legs: { applied: boolean; refusal?: string }[] };
    expect(record.legs[7].applied).toBe(false);
    expect(record.legs[7].refusal).toMatch(/did not apply/);
  });

  it.each([
    ["the bulk delivery", { op: "bulkWrite", onCall: 1 }],
    ["the receipt release", { op: "bulkWrite", onCall: 2 }],
  ] as const)("finishes exactly once after a crash after %s", async (_stage, crash) => {
    const f = fixture();
    const faulty = withInjectedCrash(f.memory, {
      collection: "wallets",
      op: crash.op,
      onCall: crash.onCall,
      afterWrite: true,
    });
    await expect(applyMoneyMove(faulty.db, f.move)).rejects.toBeInstanceOf(InjectedCrash);
    faulty.disarm();
    expect((await resumeMoneyMove(f.db, f.move.key)).status).toBe("applied");
    expectPaidOnce(f);
    await resumeMoneyMove(f.db, f.move.key);
    expectPaidOnce(f);
  });
});
