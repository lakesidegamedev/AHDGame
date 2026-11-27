import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { DELETE } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuthWithCharacter: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => true }));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb(),
    owner = new ObjectId(),
    order = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  f.memory.seed("characters", [{ _id: owner, currencyBalances: { personal: { USD: 0 } } }]);
  f.memory.seed("currencyOrders", [
    {
      _id: order,
      characterId: owner,
      type: "limit",
      status: "partial",
      amount: 1000,
      filledAmount: 200,
      fromCurrency: "USD",
      toCurrency: "CAD",
    },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  vi.mocked(requireAuthWithCharacter).mockResolvedValue({
    ok: true,
    user: { userId: new ObjectId().toString(), character: { _id: owner } },
  } as never);
  return {
    ...f,
    owner,
    order,
    run: () =>
      DELETE(new Request("http://localhost", { method: "DELETE" }), {
        params: Promise.resolve({ orderId: order.toString() }),
      }),
  };
}
it("uses the claimed remaining escrow when a partial fill finishes after the initial read", async () => {
  const f = setup(),
    orders = f.memory.collection("currencyOrders"),
    claim = orders.findOneAndUpdate.bind(orders);
  vi.spyOn(orders, "findOneAndUpdate").mockImplementationOnce(async (...args) => {
    await orders.updateOne({ _id: f.order }, { $set: { filledAmount: 500 } });
    return claim(...args);
  });
  const response = await f.run();
  expect(response.status).toBe(200);
  expect((await response.json()).refundedAmount).toBe(500);
  expect(f.memory.collection("characters").docs[0].currencyBalances).toEqual({
    personal: { USD: 500 },
  });
});
it("rolls back an unacknowledged refund and cancels once across overlapping requests", async () => {
  const f = setup(),
    characters = f.memory.collection("characters"),
    update = characters.updateOne.bind(characters);
  vi.spyOn(characters, "updateOne").mockImplementationOnce(async (...args) => {
    await update(...args);
    throw new Error("interrupted cancellation credit");
  });
  expect((await f.run()).status).toBe(500);
  expect(f.memory.collection("currencyOrders").docs[0].status).toBe("partial");
  expect(characters.docs[0].currencyBalances).toEqual({ personal: { USD: 0 } });
  const results = await Promise.all([f.run(), f.run()]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(f.memory.collection("currencyOrders").docs[0].status).toBe("cancelled");
  expect(characters.docs[0].currencyBalances).toEqual({ personal: { USD: 800 } });
});
it("adopts a stamped legacy refund without repaying escrow", async () => {
  const f = setup();
  await f.memory.collection("characters").updateOne(
    { _id: f.owner },
    {
      $set: {
        "currencyBalances.personal.USD": 800,
        settledKeys: [`forex-cancel:${f.order.toString()}#refund`],
      },
    }
  );
  const response = await f.run();
  expect(response.status).toBe(200);
  expect((await response.json()).refundedAmount).toBe(0);
  expect(f.memory.collection("characters").docs[0].currencyBalances).toEqual({
    personal: { USD: 800 },
  });
  expect(f.memory.collection("currencyOrders").docs[0].status).toBe("cancelled");
});
it("retains escrow for a missing recipient and refuses cancellation during turn processing", async () => {
  const f = setup();
  await f.memory.collection("characters").deleteOne({ _id: f.owner });
  expect((await f.run()).status).toBe(500);
  expect(f.memory.collection("currencyOrders").docs[0].status).toBe("partial");
  await f.memory
    .collection("gameState")
    .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
  expect((await f.run()).status).toBe(409);
  expect(f.memory.collection("currencyOrders").docs[0].status).toBe("partial");
});
