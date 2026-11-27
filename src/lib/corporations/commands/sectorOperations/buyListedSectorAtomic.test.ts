import { queueUndeliveredCost } from "@/lib/corporations/buildDelivery";
import type { SectorBuildOrder } from "@/lib/db/types";
import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { buyListedSector } from "./buyListedSector";
import { getDb } from "@/lib/mongodb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireBasicAuth: async () => ({ ok: true, user: { userId: "buyer" } }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: async () => null,
}));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({
  resolveCorporation: async (db: Awaited<ReturnType<typeof getDb>>, id: string) => ({
    ok: true,
    corporation: await db.collection("corporations").findOne({ _id: new ObjectId(id) }),
  }),
}));
vi.mock("./turnGuard", () => ({ rejectWhileTurnProcessing: async () => null }));
vi.mock("@/lib/economy/queries/privateEnterpriseGate", () => ({
  isPrivateEnterpriseBlocked: async () => false,
}));
vi.mock("@/lib/corporations/commands/acquisitions/controllerTransferBarrier", () => ({
  controllerTransferBarrierError: async () => null,
}));
vi.mock("@/lib/corporations/brandFacilityLoss", () => ({
  applyBrandFacilityLoss: async () => undefined,
}));
vi.mock("@/lib/market/featureFlag", () => ({
  getMarketSystemModeForDb: async () => "plants",
  marketAtLeast: () => true,
}));
vi.mock("@/lib/currency/corporationCapital", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/corporationCapital")>()),
  getCorpFxRate: async () => 1,
  getSectorHostFxRate: async () => 1,
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: async () => undefined }));
vi.mock("@/lib/corporations/economicActionLog", () => ({
  logEconomicAction: async () => undefined,
}));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
function fixture(merge: boolean) {
  const { db, memory } = createTransactionalMemoryDb();
  vi.mocked(getDb).mockResolvedValue(db);
  const buyerId = new ObjectId(),
    sellerId = new ObjectId(),
    sourceId = new ObjectId(),
    survivorId = new ObjectId();
  memory.seed("gameState", [
    { _id: "current", currentTurn: 10, worldEpochId: "test", isProcessing: false },
  ]);
  memory.seed("corporations", [
    {
      _id: buyerId,
      name: "Buyer",
      userId: "buyer",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 5000,
    },
    {
      _id: sellerId,
      name: "Seller",
      userId: "seller",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 1000,
    },
  ]);
  const base = {
    stateId: "TX",
    countryId: "US",
    sectorType: "agriculture",
    strategyId: "traditional",
    revenue: 1000,
    workers: 5,
    profitMargin: 20,
    plantCount: 1,
    capitalStock: 100,
    capacityBookAnchor: 3000,
    inventoryUnits: { food: 10 },
    inventoryValueAnchor: 50,
  };
  const source = {
    ...base,
    _id: sourceId,
    corporationId: sellerId,
    forSale: { priceAnchor: 1000 },
    buildQueue: [
      { id: "paid-order", unitsOrdered: 100, costPaidAnchor: 2000, startTurn: 9, onlineTurn: 12 },
    ],
    constructionInProgressAnchor: 2000,
  };
  memory.seed("corporateSectors", [
    source,
    ...(merge
      ? [
          {
            ...base,
            _id: survivorId,
            corporationId: buyerId,
            buildQueue: [],
            constructionInProgressAnchor: 0,
          },
        ]
      : []),
  ]);
  memory.seed("states", [{ _id: "TX", countryId: "US", name: "Texas" }]);
  const buy = () =>
    buyListedSector(
      new Request("http://localhost/sector/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerCorporationId: String(buyerId) }),
      }),
      { params: Promise.resolve({ id: String(sellerId), sectorId: String(sourceId) }) }
    );
  return { db, memory, buyerId, sellerId, sourceId, survivorId, buy };
}
describe("atomic acquisition of settled property", () => {
  beforeEach(() => vi.clearAllMocks());
  it("restores cash, inventory and paid construction when source deletion fails after merge", async () => {
    const f = fixture(true);
    const sectors = f.memory.collection("corporateSectors");
    vi.spyOn(sectors, "deleteOne").mockRejectedValueOnce(new Error("interrupted source deletion"));
    expect((await f.buy()).status).toBe(500);
    expect(sectors.docs).toHaveLength(2);
    expect((await sectors.findOne({ _id: f.survivorId }))?.capitalStock).toBe(100);
    expect(
      (await f.memory.collection("corporations").findOne({ _id: f.buyerId }))?.liquidCapital
    ).toBe(5000);
    expect((await f.buy()).status).toBe(200);
    expect(sectors.docs).toHaveLength(1);
    expect(sectors.docs[0]).toMatchObject({
      capitalStock: 200,
      inventoryUnits: { food: 20 },
      inventoryValueAnchor: 100,
    });
    expect(sectors.docs[0].buildQueue as unknown[]).toHaveLength(1);
    expect(queueUndeliveredCost(sectors.docs[0].buildQueue as SectorBuildOrder[], 10)).toBe(2000);
    expect(
      (await f.memory.collection("corporations").findOne({ _id: f.buyerId }))?.liquidCapital
    ).toBe(4000);
    expect(
      (await f.memory.collection("corporations").findOne({ _id: f.sellerId }))?.liquidCapital
    ).toBe(2000);
  });
  it("overlapping purchases deliver property and charge once", async () => {
    const f = fixture(false);
    const results = await Promise.all([f.buy(), f.buy()]);
    expect(results.filter((response) => response.status === 200)).toHaveLength(1);
    expect(f.memory.collection("corporations").docs.map((row) => row.liquidCapital)).toEqual([
      4000, 2000,
    ]);
    expect(f.memory.collection("corporateSectors").docs[0].corporationId).toEqual(f.buyerId);
    expect(f.memory.collection("corporateSectors").docs[0].buildQueue as unknown[]).toHaveLength(1);
  });
  it("refuses acquisition while a frozen turn is awaiting recovery", async () => {
    const f = fixture(false);
    await f.memory
      .collection("gameState")
      .updateOne(
        { _id: "current" },
        { $set: { isProcessing: true, processingAbandonedAt: new Date(0) } }
      );
    expect((await f.buy()).status).toBe(409);
    expect(f.memory.collection("corporations").docs.map((row) => row.liquidCapital)).toEqual([
      5000, 1000,
    ]);
  });
});
