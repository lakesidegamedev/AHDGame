import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash, type FaultPlan } from "@/lib/test-utils/faultyDb";
import { executeForcedDivestiture } from "./forcedDivestiture";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
function world(poolCash = 10000) {
  const { db, memory } = createTransactionalMemoryDb();
  const target = new ObjectId(),
    parent = new ObjectId();
  memory.seed("gameState", [{ _id: "current", currentTurn: 120 }]);
  memory.seed("corporations", [
    {
      _id: target,
      name: "Target",
      countryId: "CA",
      liquidCurrencyCode: "CAD",
      totalShares: 1000,
      publicFloat: 200,
      fundamentalSharePrice: 4,
      shareholders: [
        { corporationId: parent, shares: 800, avgCostPerShare: 2, avgCostBasisUnit: "anchor" },
      ],
    },
    {
      _id: parent,
      name: "Parent",
      countryId: "JP",
      liquidCurrencyCode: "JPY",
      liquidCapital: 1000,
    },
  ]);
  memory.seed("equityMarketPools", [{ _id: "CAD", cashLocal: poolCash }]);
  const args = {
    target: { _id: target } as Corporation,
    parent: { _id: parent } as Corporation,
    exchangeRatesByCurrency: new Map([
      ["CAD" as const, 2],
      ["JPY" as const, 100],
    ]),
    turn: 120,
    now: new Date(),
  };
  return { db, memory, args };
}
it("uses fresh ownership and pays the same anchor value across denominations once", async () => {
  const { db, memory, args } = world();
  const results = await Promise.all([
    executeForcedDivestiture(db, args),
    executeForcedDivestiture(db, args),
  ]);
  expect(results[0]).toEqual({ status: "sold", shares: 300, proceedsAnchor: 600 });
  expect(memory.collection("corporations").docs[0]).toMatchObject({
    publicFloat: 500,
    shareholders: [{ corporationId: args.parent._id, shares: 500 }],
  });
  expect(memory.collection("corporations").docs[1].liquidCapital).toBe(61000);
  expect(memory.collection("equityMarketPools").docs[0].cashLocal).toBe(8800);
  expect(memory.collection("financialTxLog").docs).toHaveLength(1);
});
it.each<FaultPlan>([
  { collection: "equityMarketPools", op: "findOneAndUpdate", onCall: 1, afterWrite: true },
  { collection: "corporations", op: "findOneAndUpdate", onCall: 1, afterWrite: true },
  { collection: "corporations", op: "updateOne", onCall: 1, afterWrite: true },
  { collection: "financialTxLog", op: "insertOne", onCall: 1, afterWrite: true },
])("restores every leg after interruption at $collection.$op", async (plan) => {
  const { db, memory, args } = world();
  const fault = withInjectedCrash(memory, plan);
  Object.assign(fault.db, { client: db.client });
  await expect(executeForcedDivestiture(fault.db, args)).rejects.toThrow();
  expect(memory.collection("corporations").docs[0].publicFloat).toBe(200);
  expect(memory.collection("corporations").docs[1].liquidCapital).toBe(1000);
  expect(memory.collection("equityMarketPools").docs[0].cashLocal).toBe(10000);
  fault.disarm();
  expect((await executeForcedDivestiture(db, args)).status).toBe("sold");
  expect(memory.collection("corporations").docs[1].liquidCapital).toBe(61000);
});
it("defers an unfunded sale without consuming its retry identity or any shares", async () => {
  const { db, memory, args } = world(10);
  expect(await executeForcedDivestiture(db, args)).toEqual({
    status: "deferred",
    why: "poolShort",
  });
  expect(memory.collection("bankMoneyMoves").docs).toHaveLength(0);
  expect(memory.collection("corporations").docs[0].publicFloat).toBe(200);
  memory.collection("equityMarketPools").docs[0].cashLocal = 10000;
  expect((await executeForcedDivestiture(db, args)).status).toBe("sold");
});
