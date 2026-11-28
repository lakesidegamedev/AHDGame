import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { emitTx } from "@/lib/financialTxLog/emit";
import { createNotification } from "@/lib/notifications";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => true }));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue("applied") }));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb(),
    sender = new ObjectId(),
    target = new ObjectId(),
    user = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  f.memory.seed("users", [{ _id: user, activeCharacterId: sender }]);
  f.memory.seed("characters", [
    {
      _id: sender,
      userId: user,
      name: "Synthetic sender",
      countryId: "JP",
      createdTurn: 0,
      currencyBalances: { personal: { USD: 1000 } },
    },
    {
      _id: target,
      userId: new ObjectId(),
      name: "Synthetic recipient",
      countryId: "CA",
      currencyBalances: { personal: { USD: 0 } },
    },
  ]);
  f.memory.seed("exchangeRates", [
    { _id: "US", currencyCode: "USD", rate: 1 },
    { _id: "JP", currencyCode: "JPY", rate: 100 },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: user.toString() },
  } as never);
  const run = (amount = 1000) =>
    POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount, currency: "USD" }),
      }),
      { params: Promise.resolve({ id: target.toString() }) }
    );
  return { ...f, sender, target, user, run };
}
it("counts the sent currency in anchor quota and records both receipts at the actual turn", async () => {
  const f = setup();
  expect((await f.run()).status).toBe(200);
  expect(f.memory.collection("users").docs[0].wireQuotaUsed).toBe(1000);
  expect(f.memory.collection("characters").docs.map((c) => c.currencyBalances)).toEqual([
    { personal: { USD: 0 } },
    { personal: { USD: 1000 } },
  ]);
  expect(emitTx).toHaveBeenCalledTimes(2);
  expect(emitTx).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      turn: 100,
      amount: -1000,
      currencyCode: "USD",
      meta: { wireAnchorAmount: 1000 },
    })
  );
});
it("rolls back quota and both wallets when destination credit acknowledgement is lost", async () => {
  const f = setup(),
    characters = f.memory.collection("characters"),
    update = characters.updateOne.bind(characters);
  vi.spyOn(characters, "updateOne").mockImplementation(async (...args) => {
    const result = await update(...args);
    if ((args[0] as { _id: ObjectId })._id.equals(f.target))
      throw new Error("destination acknowledgement lost");
    return result;
  });
  expect((await f.run()).status).toBe(500);
  expect(f.memory.collection("users").docs[0].wireQuotaUsed).toBeUndefined();
  expect(characters.docs.map((c) => c.currencyBalances)).toEqual([
    { personal: { USD: 1000 } },
    { personal: { USD: 0 } },
  ]);
  expect(createNotification).not.toHaveBeenCalled();
});
it("rolls back a failed receipt then prevents overlapping requests from spending the same wallet", async () => {
  const f = setup();
  vi.mocked(emitTx).mockRejectedValueOnce(new Error("receipt unavailable"));
  expect((await f.run()).status).toBe(500);
  expect(f.memory.collection("users").docs[0].wireQuotaUsed).toBeUndefined();
  const results = await Promise.all([f.run(600), f.run(600)]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(f.memory.collection("users").docs[0].wireQuotaUsed).toBe(600);
  expect(f.memory.collection("characters").docs.map((c) => c.currencyBalances)).toEqual([
    { personal: { USD: 400 } },
    { personal: { USD: 600 } },
  ]);
});
