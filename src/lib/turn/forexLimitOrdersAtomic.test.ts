import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { processTriggeredLimitOrders, expireStaleOrders } from "./forexLimitOrders";
function setup() {
  const f = createTransactionalMemoryDb(),
    character = new ObjectId(),
    order = new ObjectId();
  f.memory.seed("characters", [
    { _id: character, name: "Synthetic", currencyBalances: { personal: { CAD: 0, USD: 0 } } },
  ]);
  f.memory.seed("exchangeRates", [
    {
      _id: "US",
      countryId: "US",
      currencyCode: "USD",
      rate: 1,
      buyVolume24: 1e9,
      sellVolume24: 1e9,
    },
    {
      _id: "CA",
      countryId: "CA",
      currencyCode: "CAD",
      rate: 1.5,
      buyVolume24: 1e9,
      sellVolume24: 1e9,
    },
  ]);
  f.memory.seed("centralBanks", [
    { _id: "US", forexRevenue: 0 },
    { _id: "CA", spreadFeeReserveBalances: { USD: 0 } },
  ]);
  f.memory.seed("currencyOrders", [
    {
      _id: order,
      characterId: character,
      characterName: "Synthetic",
      countryId: "US",
      type: "limit",
      status: "open",
      fromCurrency: "USD",
      toCurrency: "CAD",
      amount: 1000,
      filledAmount: 0,
      limitRate: 1.4,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ]);
  return {
    ...f,
    character,
    order,
    run: () => processTriggeredLimitOrders(f.db, 100, new Date("2026-01-01")),
  };
}
it("rolls back a fill interrupted after its wallet credit and history, then fills once across overlapping retries", async () => {
  const f = setup(),
    orders = f.memory.collection("currencyOrders"),
    update = orders.updateOne.bind(orders);
  let fail = true;
  vi.spyOn(orders, "updateOne").mockImplementation(async (...args) => {
    const result = await update(...args);
    if (fail && (args[1] as { $set?: { status?: string } }).$set?.status === "filled") {
      fail = false;
      throw new Error("interrupted terminal fill");
    }
    return result;
  });
  expect((await f.run()).ordersFilled).toBe(0);
  expect(orders.docs[0].status).toBe("open");
  expect(f.memory.collection("characters").docs[0].currencyBalances).toEqual({
    personal: { CAD: 0, USD: 0 },
  });
  expect(f.memory.collection("tradeHistory").docs).toHaveLength(0);
  expect(f.memory.collection("centralBanks").docs[0].forexRevenue).toBe(0);
  const results = await Promise.all([f.run(), f.run()]);
  expect(results.reduce((n, r) => n + r.ordersFilled, 0)).toBe(1);
  expect(f.memory.collection("tradeHistory").docs).toHaveLength(1);
  const trade = f.memory.collection("tradeHistory").docs[0];
  const received = (
    f.memory.collection("characters").docs[0].currencyBalances as { personal: { CAD: number } }
  ).personal.CAD;
  expect(received).toBeCloseTo(Number(trade.amount) * Number(trade.rate), 8);
  expect(received / 1.5 + Number(trade.spread)).toBeCloseTo(1000, 8);
});
it("does not reopen a legacy processing order whose prior wallet movement is unproven", async () => {
  const f = setup();
  await f.memory
    .collection("currencyOrders")
    .updateOne({ _id: f.order }, { $set: { status: "processing" } });
  await f.memory
    .collection("characters")
    .updateOne({ _id: f.character }, { $set: { "currencyBalances.personal.CAD": 100 } });
  expect((await f.run()).ordersFilled).toBe(0);
  expect(f.memory.collection("currencyOrders").docs[0].status).toBe("processing");
  expect(f.memory.collection("characters").docs[0].currencyBalances).toEqual({
    personal: { CAD: 100, USD: 0 },
  });
});
it("keeps missing-recipient escrow recoverable and lets other valid orders finish", async () => {
  const f = setup(),
    other = new ObjectId();
  await f.memory.collection("currencyOrders").insertOne({
    ...f.memory.collection("currencyOrders").docs[0],
    _id: other,
    characterId: new ObjectId(),
  });
  expect((await f.run()).ordersFilled).toBe(1);
  expect((await f.memory.collection("currencyOrders").findOne({ _id: other }))?.status).toBe(
    "open"
  );
  expect(f.memory.collection("tradeHistory").docs).toHaveLength(1);
});
it("does not substitute parity for a missing live currency quote", async () => {
  const f = setup();
  await f.memory.collection("exchangeRates").deleteOne({ _id: "CA" });
  expect((await f.run()).ordersFilled).toBe(0);
  expect(f.memory.collection("currencyOrders").docs[0].status).toBe("open");
  expect(f.memory.collection("characters").docs[0].currencyBalances).toEqual({
    personal: { CAD: 0, USD: 0 },
  });
});

it("preserves expiry claims for missing owners and rolls back an interrupted wallet refund batch", async () => {
  const f = setup(),
    other = new ObjectId(),
    orders = f.memory.collection("currencyOrders");
  await orders.updateOne(
    { _id: f.order },
    { $set: { expiresAtTurn: 1, status: "partial", filledAmount: 200 } }
  );
  await orders.insertOne({ ...orders.docs[0], _id: other, characterId: new ObjectId() });
  const characters = f.memory.collection("characters"),
    bulk = characters.bulkWrite.bind(characters);
  vi.spyOn(characters, "bulkWrite").mockImplementationOnce(async (...args) => {
    await bulk(...args);
    throw new Error("interrupted expiry refund");
  });
  await expect(expireStaleOrders(f.db, 100, new Date())).rejects.toThrow(
    "interrupted expiry refund"
  );
  expect(characters.docs[0].currencyBalances).toEqual({ personal: { CAD: 0, USD: 0 } });
  expect(orders.docs.map((order) => order.expiryRefundState)).toEqual(["pending", "pending"]);
  await Promise.all([0, 1].map(() => expireStaleOrders(f.db, 100, new Date())));
  expect(characters.docs[0].currencyBalances).toEqual({ personal: { CAD: 0, USD: 800 } });
  expect((await orders.findOne({ _id: f.order }))?.expiryRefundState).toBeUndefined();
  expect((await orders.findOne({ _id: other }))?.expiryRefundState).toBe("pending");
});
it.each(["pending", "credited"] as const)(
  "adopts a proven legacy %s expiry credit without paying it twice",
  async (state) => {
    const f = setup(),
      stamp = `forex-expiry:${String(f.order)}#refund`;
    await f.memory
      .collection("currencyOrders")
      .updateOne(
        { _id: f.order },
        { $set: { status: "expired", filledAmount: 200, expiryRefundState: state } }
      );
    await f.memory
      .collection("characters")
      .updateOne(
        { _id: f.character },
        { $set: { "currencyBalances.personal.USD": 800, forexExpiryRefunds: [stamp] } }
      );
    await expireStaleOrders(f.db, 100, new Date());
    expect(f.memory.collection("characters").docs[0].currencyBalances).toEqual({
      personal: { CAD: 0, USD: 800 },
    });
    expect(f.memory.collection("characters").docs[0].forexExpiryRefunds).toEqual([]);
    expect(f.memory.collection("currencyOrders").docs[0].expiryRefundState).toBeUndefined();
  }
);
it("retains an unproven credited expiry marker for reconciliation", async () => {
  const f = setup();
  await f.memory
    .collection("currencyOrders")
    .updateOne({ _id: f.order }, { $set: { status: "expired", expiryRefundState: "credited" } });
  await expireStaleOrders(f.db, 100, new Date());
  expect(f.memory.collection("currencyOrders").docs[0].expiryRefundState).toBe("credited");
  expect(f.memory.collection("characters").docs[0].currencyBalances).toEqual({
    personal: { CAD: 0, USD: 0 },
  });
});
