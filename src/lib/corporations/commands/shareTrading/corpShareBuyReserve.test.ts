import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { buyPublicShares } from "./buyPublicShares";
import { sellPublicShares } from "./sellPublicShares";
import { placeShareOrder } from "./placeShareOrder";
import { trimCorporateBuyOrdersToReserve } from "@/lib/turn/corporation/shareOrderReserveTrim";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/corporations/hostileTakeoverNotifications", () => ({
  notifyHostileTakeoverThresholdIfEligible: vi.fn(),
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const TURN = 20;

async function fixture(opts: { cash: number; billsPerTurn: number }) {
  const { memory } = createTransactionalMemoryDb();
  const db = memory as unknown as Db;
  const userId = new ObjectId();
  const ceoId = new ObjectId();
  const buyerId = new ObjectId();
  const targetId = new ObjectId();
  memory.seed("gameState", [{ _id: "current", currentTurn: TURN, isProcessing: false }]);
  memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  memory.seed("users", [{ _id: userId, activeCharacterId: ceoId }]);
  memory.seed("characters", [
    { _id: ceoId, userId, name: "Synthetic CEO", countryId: "US", cashOnHand: 0 },
  ]);
  memory.seed("corporations", [
    {
      _id: buyerId,
      name: "Synthetic buyer",
      countryId: "US",
      ceoId,
      liquidCurrencyCode: "USD",
      liquidCapital: opts.cash,
      sharePrice: 1,
      totalShares: 1_000_000,
      publicFloat: 0,
      shareholders: [],
    },
    {
      _id: targetId,
      name: "Synthetic target",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 0,
      sharePrice: 1,
      fundamentalSharePrice: 1,
      totalShares: 10_000_000,
      publicFloat: 5_000_000,
      shareholders: [],
    },
  ]);
  memory.seed("corporateSectors", [
    {
      _id: new ObjectId(),
      corporationId: buyerId,
      producerSettlement: { turn: TURN - 1, labourPaid: opts.billsPerTurn },
    },
  ]);
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: userId.toString() },
  } as never);
  return { memory, db, buyerId, targetId };
}

async function buy(targetId: ObjectId, body: Record<string, unknown>) {
  return buyPublicShares(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyAsCorporation: true, ...body }),
    }),
    { params: Promise.resolve({ id: targetId.toString() }) }
  );
}

async function cashOf(db: Db, id: ObjectId) {
  return (await db.collection("corporations").findOne({ _id: id }))?.liquidCapital as number;
}

beforeEach(() => vi.clearAllMocks());

describe("corporate share purchase below the operating reserve", () => {
  // Plants run on 100k a turn: a 3-turn reserve of 300k on 1M of cash.
  it("refuses a buy that would spend into the reserve, with the reserve figures", async () => {
    const { db, buyerId, targetId } = await fixture({ cash: 1_000_000, billsPerTurn: 100_000 });
    const res = await buy(targetId, { shares: 800_000 });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("OPERATING_RESERVE_SHORT");
    expect(body.requiresOperatingReserveConfirm).toBe(true);
    expect(body.operatingReserveLocal).toBe(300_000);
    expect(body.maxAffordableLocal).toBe(700_000);
    expect(body.error).toMatch(/^This purchase would leave \$\d/);
    expect(await cashOf(db, buyerId)).toBe(1_000_000);
    expect(await db.collection("financialTxLog").countDocuments({ type: "stock_trade_buy" })).toBe(
      0
    );
  });

  it("lets the CEO confirm the same buy through the reserve", async () => {
    const { db, buyerId, targetId } = await fixture({ cash: 1_000_000, billsPerTurn: 100_000 });
    const res = await buy(targetId, { shares: 800_000, overrideOperatingReserve: true });
    expect(res.status).toBe(200);
    const after = await cashOf(db, buyerId);
    expect(after).toBeLessThan(300_000);
    expect(after).toBeGreaterThanOrEqual(0);
  });

  it("allows a buy that keeps the reserve without asking", async () => {
    const { db, buyerId, targetId } = await fixture({ cash: 1_000_000, billsPerTurn: 100_000 });
    const res = await buy(targetId, { shares: 100_000 });
    expect(res.status).toBe(200);
    expect(await cashOf(db, buyerId)).toBeGreaterThan(300_000);
  });

  it("refuses a buy that costs more than the cash, even when confirmed", async () => {
    const { db, buyerId, targetId } = await fixture({ cash: 1_000_000, billsPerTurn: 100_000 });
    const res = await buy(targetId, { shares: 1_500_000, overrideOperatingReserve: true });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).not.toBe("OPERATING_RESERVE_SHORT");
    expect(body.error).toContain("more than the");
    expect(await cashOf(db, buyerId)).toBe(1_000_000);
  });

  it("leaves a company with no running plants free to spend its cash", async () => {
    const { db, buyerId, targetId } = await fixture({ cash: 1_000_000, billsPerTurn: 0 });
    const res = await buy(targetId, { shares: 900_000 });
    expect(res.status).toBe(200);
    expect(await cashOf(db, buyerId)).toBeLessThan(1_000_000);
  });
});

async function placeOrder(targetId: ObjectId, body: Record<string, unknown>) {
  return placeShareOrder(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "buy", placeAsCorporation: true, ...body }),
    }),
    { params: Promise.resolve({ id: targetId.toString() }) }
  );
}

describe("corporate resting buy orders and the operating reserve", () => {
  it("refuses to escrow into the reserve, then marks a confirmed order", async () => {
    const { db, buyerId, targetId } = await fixture({ cash: 1_000_000, billsPerTurn: 100_000 });
    // A limit well under the market rests, escrowing its full value now.
    const refused = await placeOrder(targetId, { shares: 2_000_000, pricePerShare: 0.4 });
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("OPERATING_RESERVE_SHORT");
    expect(await cashOf(db, buyerId)).toBe(1_000_000);

    const placed = await placeOrder(targetId, {
      shares: 2_000_000,
      pricePerShare: 0.4,
      overrideOperatingReserve: true,
    });
    expect(placed.status).toBe(200);
    expect((await placed.json()).filled).toBe(false);
    expect(await cashOf(db, buyerId)).toBe(200_000);
    const order = await db.collection("shareOrders").findOne({ placerCorporationId: buyerId });
    expect(order?.operatingReserveOverride).toBe(true);
  });

  it("refuses an order that would escrow more than the cash, confirm or not", async () => {
    const { db, buyerId, targetId } = await fixture({ cash: 1_000_000, billsPerTurn: 100_000 });
    const res = await placeOrder(targetId, {
      shares: 3_000_000,
      pricePerShare: 0.4,
      overrideOperatingReserve: true,
    });
    expect(res.status).toBe(400);
    expect(await cashOf(db, buyerId)).toBe(1_000_000);
    expect(await db.collection("shareOrders").countDocuments({})).toBe(0);
  });

  it("gives escrow back at turn time when the company fell below its reserve", async () => {
    // Cash 50k against a 300k reserve; two unconfirmed orders and one confirmed.
    const { memory, db, buyerId, targetId } = await fixture({
      cash: 50_000,
      billsPerTurn: 100_000,
    });
    const older = new ObjectId();
    const newer = new ObjectId();
    const confirmed = new ObjectId();
    const base = {
      corporationId: targetId,
      placerCorporationId: buyerId,
      type: "buy",
      pricePerShare: 1,
      status: "open",
      updatedAt: new Date(),
    };
    memory.seed("shareOrders", [
      {
        ...base,
        _id: older,
        shares: 400_000,
        sharesRemaining: 400_000,
        escrowAmount: 400_000,
        createdAt: new Date("2026-01-01"),
      },
      {
        ...base,
        _id: newer,
        shares: 100_000,
        sharesRemaining: 100_000,
        escrowAmount: 100_000,
        createdAt: new Date("2026-01-02"),
      },
      {
        ...base,
        _id: confirmed,
        shares: 900_000,
        sharesRemaining: 900_000,
        escrowAmount: 900_000,
        operatingReserveOverride: true,
        createdAt: new Date("2026-01-03"),
      },
    ]);

    const summary = await trimCorporateBuyOrdersToReserve(db, new Date(), TURN);
    expect(summary).toEqual({ ordersTrimmed: 1, ordersReleased: 1 });

    // Newest unconfirmed order released in full (100k), the older one by 150k.
    expect(await cashOf(db, buyerId)).toBe(300_000);
    const n = await db.collection("shareOrders").findOne({ _id: newer });
    expect(n?.status).toBe("cancelled");
    expect(n?.cancelReason).toContain("running costs");
    const o = await db.collection("shareOrders").findOne({ _id: older });
    expect(o?.status).toBe("open");
    expect(o?.sharesRemaining).toBe(250_000);
    expect(o?.escrowAmount).toBe(250_000);
    expect(o?.operatingReserveTrim).toMatchObject({ turn: TURN, sharesReleased: 150_000 });
    const c = await db.collection("shareOrders").findOne({ _id: confirmed });
    expect(c?.sharesRemaining).toBe(900_000);
    expect(
      await db.collection("financialTxLog").countDocuments({ type: "stock_order_refund" })
    ).toBe(2);
  });

  it("leaves resting orders alone while the reserve is covered", async () => {
    const { memory, db, buyerId, targetId } = await fixture({
      cash: 500_000,
      billsPerTurn: 100_000,
    });
    const id = new ObjectId();
    memory.seed("shareOrders", [
      {
        _id: id,
        corporationId: targetId,
        placerCorporationId: buyerId,
        type: "buy",
        shares: 10,
        sharesRemaining: 10,
        pricePerShare: 1,
        escrowAmount: 10,
        status: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    expect(await trimCorporateBuyOrdersToReserve(db, new Date(), TURN)).toEqual({
      ordersTrimmed: 0,
      ordersReleased: 0,
    });
    expect(await cashOf(db, buyerId)).toBe(500_000);
  });
});

describe("public share settlement interruption and overlap", () => {
  it.each(["market", "immediate-order"])(
    "rolls back cash and shares if the issuer credit fails: %s",
    async (kind) => {
      const { memory, db, buyerId, targetId } = await fixture({ cash: 1_000_000, billsPerTurn: 0 });
      const corporations = memory.collection("corporations");
      const update = corporations.findOneAndUpdate.bind(corporations);
      let interrupt = true;
      vi.spyOn(corporations, "findOneAndUpdate").mockImplementation(
        async (filter, operation, options) => {
          if (
            interrupt &&
            String(filter._id) === String(targetId) &&
            Number((operation as { $inc?: { liquidCapital?: number } }).$inc?.liquidCapital) > 0
          ) {
            interrupt = false;
            throw new Error("interrupted issuer credit");
          }
          return update(filter, operation, options);
        }
      );
      const submit = () =>
        kind === "market"
          ? buy(targetId, { shares: 100_000 })
          : placeOrder(targetId, { shares: 100_000, pricePerShare: 1.1 });
      expect((await submit()).status).toBe(500);
      expect(await cashOf(db, buyerId)).toBe(1_000_000);
      expect(await cashOf(db, targetId)).toBe(0);
      expect((await db.collection("corporations").findOne({ _id: targetId }))?.publicFloat).toBe(
        5_000_000
      );
      expect((await submit()).status).toBe(200);
      expect((await cashOf(db, buyerId)) + (await cashOf(db, targetId))).toBe(1_000_000);
      const target = await db.collection("corporations").findOne({ _id: targetId });
      expect(target?.publicFloat).toBe(4_900_000);
      expect(
        (target?.shareholders as { corporationId: ObjectId; shares: number }[]).find((holder) =>
          holder.corporationId?.equals(buyerId)
        )?.shares
      ).toBe(100_000);
    }
  );
  it("restores a resting order's reserved cash when insertion is interrupted", async () => {
    const { memory, db, buyerId, targetId } = await fixture({ cash: 1_000_000, billsPerTurn: 0 });
    vi.spyOn(memory.collection("shareOrders"), "insertOne").mockRejectedValueOnce(
      new Error("interrupted escrow order")
    );
    expect((await placeOrder(targetId, { shares: 100_000, pricePerShare: 0.9 })).status).toBe(500);
    expect(await cashOf(db, buyerId)).toBe(1_000_000);
    expect(await db.collection("shareOrders").countDocuments({})).toBe(0);
    expect((await placeOrder(targetId, { shares: 100_000, pricePerShare: 0.9 })).status).toBe(200);
    expect(await cashOf(db, buyerId)).toBe(910_000);
    expect(await db.collection("shareOrders").countDocuments({})).toBe(1);
  });
  it("does not oversell a shared public float when two purchases overlap", async () => {
    const { db, buyerId, targetId } = await fixture({ cash: 10_000_000, billsPerTurn: 0 });
    const results = await Promise.all([
      buy(targetId, { shares: 3_000_000 }),
      buy(targetId, { shares: 3_000_000 }),
    ]);
    expect(results.filter((response) => response.status === 200)).toHaveLength(1);
    expect((await db.collection("corporations").findOne({ _id: targetId }))?.publicFloat).toBe(
      2_000_000
    );
    expect((await cashOf(db, buyerId)) + (await cashOf(db, targetId))).toBe(10_000_000);
  });
  it("restores issuer cash and the holding when seller credit is interrupted", async () => {
    const { memory, db, buyerId, targetId } = await fixture({ cash: 1_000_000, billsPerTurn: 0 });
    expect((await buy(targetId, { shares: 100_000 })).status).toBe(200);
    const corporations = memory.collection("corporations");
    const update = corporations.updateOne.bind(corporations);
    let interrupt = true;
    vi.spyOn(corporations, "updateOne").mockImplementation(async (filter, operation, options) => {
      if (
        interrupt &&
        String(filter._id) === String(buyerId) &&
        Number((operation as { $inc?: { liquidCapital?: number } }).$inc?.liquidCapital) > 0
      ) {
        interrupt = false;
        throw new Error("interrupted seller credit");
      }
      return update(filter, operation, options);
    });
    const sell = () =>
      sellPublicShares(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shares: 100_000, sellAsCorporation: true }),
        }),
        { params: Promise.resolve({ id: String(targetId) }) }
      );
    expect((await sell()).status).toBe(500);
    expect(await cashOf(db, buyerId)).toBe(900_000);
    expect(await cashOf(db, targetId)).toBe(100_000);
    expect((await db.collection("corporations").findOne({ _id: targetId }))?.publicFloat).toBe(
      4_900_000
    );
    expect((await sell()).status).toBe(200);
    expect((await cashOf(db, buyerId)) + (await cashOf(db, targetId))).toBe(1_000_000);
    expect((await db.collection("corporations").findOne({ _id: targetId }))?.publicFloat).toBe(
      5_000_000
    );
  });
});

describe("reserve trim atomic refunds", () => {
  it("restores escrow after a failed refund and overlapping retries refund once", async () => {
    const { memory, db, buyerId, targetId } = await fixture({
      cash: 50_000,
      billsPerTurn: 100_000,
    });
    const orderId = new ObjectId();
    memory.seed("shareOrders", [
      {
        _id: orderId,
        corporationId: targetId,
        placerCorporationId: buyerId,
        type: "buy",
        status: "open",
        sharesRemaining: 400_000,
        escrowAmount: 400_000,
        pricePerShare: 1,
        createdAt: new Date(),
      },
    ]);
    vi.spyOn(memory.collection("corporations"), "bulkWrite").mockRejectedValueOnce(
      new Error("interrupted reserve refund")
    );
    await expect(trimCorporateBuyOrdersToReserve(db, new Date(), TURN)).rejects.toThrow(
      "interrupted reserve refund"
    );
    expect((await db.collection("shareOrders").findOne({ _id: orderId }))?.escrowAmount).toBe(
      400_000
    );
    expect(await cashOf(db, buyerId)).toBe(50_000);
    await Promise.all([
      trimCorporateBuyOrdersToReserve(db, new Date(), TURN),
      trimCorporateBuyOrdersToReserve(db, new Date(), TURN),
    ]);
    expect(await cashOf(db, buyerId)).toBe(300_000);
    expect((await db.collection("shareOrders").findOne({ _id: orderId }))?.escrowAmount).toBe(
      150_000
    );
    expect(await trimCorporateBuyOrdersToReserve(db, new Date(), TURN)).toEqual({
      ordersTrimmed: 0,
      ordersReleased: 0,
    });
  });
});
