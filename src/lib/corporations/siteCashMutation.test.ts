import { beforeEach, describe, expect, it, vi } from "vitest";
import { BSON, type ClientSession, type Db, ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";

const transaction = vi.hoisted(() => ({
  run: undefined as unknown as (
    body: (session: ClientSession) => Promise<unknown>
  ) => Promise<unknown>,
}));
vi.mock("@/lib/db/runRequiredTransaction", async (original) => ({
  ...(await original<typeof import("@/lib/db/runRequiredTransaction")>()),
  runRequiredTransaction: (body: (session: ClientSession) => Promise<unknown>) =>
    transaction.run(body),
}));
import { commitSiteCashMutation } from "./siteCashMutation";

let memory: InMemoryDb;
const corpId = new ObjectId();
const siteId = new ObjectId();
const now = new Date();
const corporation = { _id: corpId, liquidCapital: 1000, liquidCurrencyCode: "USD" } as Corporation;
const input = () => ({
  corporation,
  chargeLocal: 200,
  now,
  site: {
    filter: { _id: siteId, buildQueue: [] },
    update: { $set: { buildQueue: [{ unitsOrdered: 1, costPaidAnchor: 200 }] } },
  },
});

beforeEach(() => {
  memory = createInMemoryDb();
  memory.seed("gameState", [{ _id: "current", isProcessing: false }]);
  memory.seed("corporations", [corporation as unknown as Record<string, unknown>]);
  memory.seed("corporateSectors", [{ _id: siteId, corporationId: corpId, buildQueue: [] }]);
  let tail = Promise.resolve();
  transaction.run = async (body) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const saved = new Map(
      [...memory.collections].map(([name, col]) => [name, BSON.EJSON.stringify(col.docs)])
    );
    try {
      return await body({} as ClientSession);
    } catch (error) {
      for (const [name, col] of memory.collections) {
        col.docs.splice(0, col.docs.length, ...BSON.EJSON.parse(saved.get(name) ?? "[]"));
      }
      throw error;
    } finally {
      release();
    }
  };
});

const clientDb = (db: Db | InMemoryDb) => Object.assign(db, { client: {} }) as unknown as Db;
describe("site cash transaction boundaries", () => {
  it.each([false, true])(
    "rolls back an interruption at the property write (after=%s)",
    async (afterWrite) => {
      const fault = withInjectedCrash(memory, {
        collection: "corporateSectors",
        op: "updateOne",
        onCall: 1,
        afterWrite,
      });
      await expect(commitSiteCashMutation(clientDb(fault.db), input())).rejects.toThrow();
      expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
      expect(memory.collection("corporateSectors").docs[0].buildQueue).toEqual([]);
      fault.disarm();
      expect(await commitSiteCashMutation(clientDb(memory), input())).toBe(true);
      expect(await commitSiteCashMutation(clientDb(memory), input())).toBe(false);
      expect(memory.collection("corporations").docs[0].liquidCapital).toBe(800);
    }
  );
  it("rolls back cash and property if the receipt fails", async () => {
    await expect(
      commitSiteCashMutation(clientDb(memory), {
        ...input(),
        record: async () => {
          throw new Error("receipt unavailable");
        },
      })
    ).rejects.toThrow("receipt unavailable");
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
    expect(memory.collection("corporateSectors").docs[0].buildQueue).toEqual([]);
  });
  it("one competing queue writer wins and only its payment commits", async () => {
    const results = await Promise.all([
      commitSiteCashMutation(clientDb(memory), input()),
      commitSiteCashMutation(clientDb(memory), input()),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(800);
  });
  it("refuses a turn that acquired the world before the transaction", async () => {
    await memory
      .collection("gameState")
      .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
    expect(await commitSiteCashMutation(clientDb(memory), input())).toBe(false);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
  });
  it("does not debit a treasury whose denomination changed after the quote", async () => {
    await memory
      .collection("corporations")
      .updateOne({ _id: corpId }, { $set: { liquidCurrencyCode: "JPY" } });
    expect(await commitSiteCashMutation(clientDb(memory), input())).toBe(false);
  });
  it("refund and completion marker roll back together", async () => {
    const fault = withInjectedCrash(memory, {
      collection: "corporateSectors",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    const refund = { ...input(), chargeLocal: -150 };
    await expect(commitSiteCashMutation(clientDb(fault.db), refund)).rejects.toThrow();
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
    fault.disarm();
    expect(await commitSiteCashMutation(clientDb(memory), refund)).toBe(true);
    expect(await commitSiteCashMutation(clientDb(memory), refund)).toBe(false);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1150);
  });
});
