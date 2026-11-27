import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { emitTx } from "@/lib/financialTxLog/emit";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/api/newCharacterTransferBarrier", () => ({
  newCharacterTransferBarrierResponse: async () => null,
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => true }));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb(),
    user = new ObjectId(),
    ceo = new ObjectId(),
    previous = new ObjectId(),
    corp = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  f.memory.seed("exchangeRates", [
    { _id: "CAD", currencyCode: "CAD", rate: 2 },
    { _id: "USD", currencyCode: "USD", rate: 1 },
  ]);
  f.memory.seed("characters", [
    {
      _id: previous,
      userId: user,
      countryId: "US",
      currencyBalances: { personal: { USD: 1_000_000 } },
    },
    { _id: ceo, userId: user, countryId: "CA", currencyBalances: { personal: { CAD: 200 } } },
  ]);
  f.memory.seed("corporations", [
    {
      _id: corp,
      name: "Synthetic",
      userId: user,
      ceoId: ceo,
      countryId: "US",
      liquidCurrencyCode: "USD",
      isPrivate: true,
      liquidCapital: 0,
    },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: user.toString(), activeCharacterId: ceo.toString() },
  } as never);
  const run = (amount = 200) =>
    POST(
      new Request("http://localhost/api/capital-injection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      }),
      { params: Promise.resolve({ id: corp.toString() }) }
    );
  return { ...f, corp, ceo, previous, run };
}
it("uses the active character and reports corporation-native amount and source currency separately", async () => {
  const f = setup();
  const response = await f.run();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    injectedAmount: 100,
    currencyCode: "USD",
    sourceAmount: 200,
    sourceCurrencyCode: "CAD",
  });
  expect((await f.memory.collection("corporations").findOne({ _id: f.corp }))?.liquidCapital).toBe(
    100
  );
  expect(
    (await f.memory.collection("characters").findOne({ _id: f.previous }))?.currencyBalances
  ).toEqual({ personal: { USD: 1_000_000 } });
  expect(emitTx).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ amount: 100, currencyCode: "USD" })
  );
});
it("rolls back both balances if the receipt fails, then overlapping retries cannot overspend", async () => {
  const f = setup();
  vi.mocked(emitTx).mockRejectedValueOnce(new Error("interrupted capital receipt"));
  expect((await f.run()).status).toBe(500);
  expect((await f.memory.collection("corporations").findOne({ _id: f.corp }))?.liquidCapital).toBe(
    0
  );
  expect(
    (await f.memory.collection("characters").findOne({ _id: f.ceo }))?.currencyBalances
  ).toEqual({ personal: { CAD: 200 } });
  const results = await Promise.all([f.run(), f.run()]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect((await f.memory.collection("corporations").findOne({ _id: f.corp }))?.liquidCapital).toBe(
    100
  );
});
it("refuses injections while a turn is processing", async () => {
  const f = setup();
  await f.memory
    .collection("gameState")
    .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
  expect((await f.run()).status).toBe(409);
  expect((await f.memory.collection("corporations").findOne({ _id: f.corp }))?.liquidCapital).toBe(
    0
  );
});
