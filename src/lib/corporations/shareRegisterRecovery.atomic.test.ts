import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { getDb } from "@/lib/mongodb";
import { POST as heal } from "@/app/api/admin/heal/nationalization-shares/route";
import { POST as consolidate } from "@/app/api/corporations/[id]/shares/consolidate/route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: async () => ({ ok: true }) }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireBasicAuth: async () => ({ ok: true, user: { userId: "ceo" } }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: async () => null,
}));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({
  resolveCorporation: async (db: Db, id: string) => ({
    ok: true,
    corporation: await db.collection("corporations").findOne({ _id: new ObjectId(id) }),
  }),
  requireCeo: () => null,
}));
vi.mock("@/lib/corporations/shareTradeHistory", () => ({ recordShareTrade: vi.fn() }));
vi.mock("@/lib/turn/stockExchangeSnapshot", () => ({ generateStockExchangeSnapshots: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => true }));
vi.mock("@/lib/corporations/cleanupShareMarketActivity", () => ({
  cleanupShareMarketActivityForCorporationTargets: async (db: Db) => {
    const order = await db.collection("shareOrders").findOne({});
    if (order) {
      await db
        .collection("characters")
        .updateOne({ _id: order.buyer }, { $inc: { cashOnHand: 50 } });
      await db.collection("shareOrders").deleteOne({ _id: order._id });
    }
    return { ordersCancelled: order ? 1 : 0, listingsCancelled: 0, offersCancelled: 0 };
  },
}));
function world() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, preset: "2019-default" }]);
  f.memory.seed("exchangeRates", [
    { currencyCode: "USD", rate: 2 },
    { currencyCode: "CAD", rate: 2.8 },
  ]);
  return f;
}
describe("share-register atomic repairs", () => {
  it("heals ownership and basis once without creating cash, including a landed failure and overlapping retries", async () => {
    const f = world(),
      issuer = new ObjectId(),
      old = new ObjectId(),
      national = new ObjectId();
    f.memory.seed("corporations", [
      {
        _id: issuer,
        countryId: "US",
        liquidCurrencyCode: "USD",
        name: "Issuer",
        sharePrice: 50,
        totalShares: 100,
        publicFloat: 0,
        shareholders: [
          { corporationId: old, shares: 60, avgCostPerShare: 3, superShares: 6 },
          {
            corporationId: national,
            shares: 40,
            avgCostPerShare: 2,
            avgCostBasisUnit: "anchor",
            superShares: 4,
          },
        ],
      },
      {
        _id: national,
        countryId: "US",
        countryOwnerId: "US",
        liquidCurrencyCode: "CAD",
        liquidCapital: 1000,
        name: "National",
      },
    ]);
    const call = () =>
      heal(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dryRun: false }),
        })
      );
    const fault = withInjectedCrash(f.memory, {
      collection: "corporations",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    vi.mocked(getDb).mockResolvedValue(fault.db);
    expect((await call()).ok).toBe(false);
    expect(f.memory.collection("corporations").docs[0].shareholders).toHaveLength(2);
    vi.mocked(getDb).mockResolvedValue(f.db);
    await Promise.all([call(), call()]);
    expect(f.memory.collection("corporations").docs[0]).toMatchObject({
      totalShares: 100,
      publicFloat: 0,
      shareholders: [
        {
          corporationId: national,
          shares: 100,
          avgCostPerShare: 1.7,
          avgCostBasisUnit: "anchor",
          superShares: 10,
        },
      ],
    });
    expect(f.memory.collection("corporations").docs[1].liquidCapital).toBe(1000);
  });
  it("rolls back a split, escrow refund and mirrored fund write together, then parallel retries apply once", async () => {
    const f = world(),
      issuer = new ObjectId(),
      fund = new ObjectId(),
      buyer = new ObjectId();
    f.memory.seed("corporations", [
      {
        _id: issuer,
        name: "Issuer",
        countryId: "US",
        liquidCurrencyCode: "USD",
        ceoId: buyer,
        sharePrice: 100,
        fundamentalSharePrice: 80,
        totalShares: 1_200_000,
        publicFloat: 600_000,
        shareholders: [{ fundId: fund, shares: 600_000, avgCostPerShare: 10 }],
      },
    ]);
    f.memory.seed("characters", [{ _id: buyer, cashOnHand: 100 }]);
    f.memory.seed("shareOrders", [{ _id: new ObjectId(), buyer, escrowAmount: 50 }]);
    f.memory.seed("indexFunds", [
      {
        _id: fund,
        holdings: [{ corporationId: issuer, shares: 600_000, avgCostPerShareAnchor: 10 }],
      },
    ]);
    const call = () =>
      consolidate(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetTotalShares: 1_000_000 }),
        }),
        { params: Promise.resolve({ id: String(issuer) }) }
      );
    const fault = withInjectedCrash(f.memory, {
      collection: "indexFunds",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    vi.mocked(getDb).mockResolvedValue(fault.db);
    expect((await call()).ok).toBe(false);
    expect(f.memory.collection("corporations").docs[0].totalShares).toBe(1_200_000);
    expect(f.memory.collection("characters").docs[0].cashOnHand).toBe(100);
    expect(f.memory.collection("shareOrders").docs).toHaveLength(1);
    vi.mocked(getDb).mockResolvedValue(f.db);
    const results = await Promise.all([call(), call()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(f.memory.collection("corporations").docs[0]).toMatchObject({
      totalShares: 1_000_000,
      sharePrice: 120,
      publicFloat: 500_000,
    });
    expect(f.memory.collection("indexFunds").docs[0]).toMatchObject({
      holdings: [{ shares: 500_000, avgCostPerShareAnchor: 12 }],
    });
    expect(f.memory.collection("characters").docs[0].cashOnHand).toBe(150);
    expect(f.memory.collection("shareOrders").docs).toHaveLength(0);
  });
});
