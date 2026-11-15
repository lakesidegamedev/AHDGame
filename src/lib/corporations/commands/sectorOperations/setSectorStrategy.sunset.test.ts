import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { STRATEGY_RETOOL_COST_FRACTION } from "@/lib/constants/sectorStrategies";
import { SUNSET_CONVERSION_DISCOUNT } from "@/lib/constants/techTree/sunset";

/** Sunset conversions: retired methods close and convert to successors at a discount. */

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({
  resolveCorporation: vi.fn(),
  requireCeo: vi.fn().mockReturnValue(null),
  requireCeoOrDirectingParent: vi.fn().mockResolvedValue({ ok: true, directingParentId: null }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/currency/corporationCapital", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCorpFxRate: vi.fn().mockResolvedValue(1),
  getSectorHostFxRate: vi.fn().mockResolvedValue(1),
  resolveCorpLiquidCurrencyCode: vi.fn().mockReturnValue("USD"),
  resolveSectorHostCurrencyCode: vi.fn().mockReturnValue("USD"),
  anchorToCorpLiquidCapital: vi.fn((anchor: number) => anchor),
  corpLiquidCapitalToAnchor: vi.fn((local: number) => local),
}));
vi.mock("@/lib/currency/marketMaker", () => ({
  distributeConversionSpread: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/market/featureFlag", () => ({
  getMarketSystemModeForDb: vi.fn().mockResolvedValue("capital"),
  marketAtLeast: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/api/rejectDuringTurn", () => ({
  rejectDuringTurn: vi.fn().mockResolvedValue(null),
}));

let db: MockDb;
const CORP_ID = new ObjectId();
const SECTOR_ID = new ObjectId();
const CURRENT_TURN = 500;
const REVENUE = 1_000_000;

const corporation = {
  _id: CORP_ID,
  name: "Old Power",
  countryId: "US",
  type: "energy",
  ceoId: new ObjectId(),
  liquidCapital: 1_000_000_000,
  liquidCurrencyCode: "USD",
};

function energySector(strategyId: string) {
  return {
    _id: SECTOR_ID,
    corporationId: CORP_ID,
    countryId: "US",
    stateId: "US-TX",
    sectorType: "energy",
    strategyId,
    revenue: REVENUE,
    capitalStock: 100,
    buildQueue: [],
  };
}

async function wire(sector: Record<string, unknown>, currentYear: number) {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({ ok: true, user: { userId: "user-1" } } as never);
  const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
  vi.mocked(resolveCorporation).mockResolvedValue({ ok: true, corporation } as never);
  db.collectionMocks.corporateSectors.findOne.mockResolvedValue(sector);
  db.collectionMocks.corporateSectors.updateOne.mockResolvedValue({ matchedCount: 1 });
  db.collectionMocks.corporations.updateOne.mockResolvedValue({ matchedCount: 1 });
  db.collectionMocks.gameState.findOne.mockResolvedValue({
    _id: "current",
    currentTurn: CURRENT_TURN,
    currentYear,
    sectorTechTreesEnabled: true,
  });
}

const params = Promise.resolve({ id: CORP_ID.toString(), sectorId: SECTOR_ID.toString() });
const request = (strategyId: string) =>
  new Request("http://localhost/api/corporations/1/sectors/2/strategy", {
    method: "POST",
    body: JSON.stringify({ strategyId }),
  });

describe("sunset conversion through the retool command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    for (const c of [
      "corporations",
      "corporateSectors",
      "gameState",
      "gameConfig",
      "commodityPrices",
      "stateResourceCapacity",
    ])
      db.collection(c);
  });

  it("charges the discounted fee to convert a retired method to a named successor", async () => {
    await wire(energySector("standard"), 2041);
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const res = await setSectorStrategy(request("renewables"), { params });
    expect(res.status).toBe(200);
    const debit = db.collectionMocks.corporations.updateOne.mock.calls[0][1] as {
      $inc: { liquidCapital: number };
    };
    expect(-debit.$inc.liquidCapital).toBeCloseTo(
      REVENUE * STRATEGY_RETOOL_COST_FRACTION * (1 - SUNSET_CONVERSION_DISCOUNT)
    );
  });

  it("charges the full fee for the same move before the sunset", async () => {
    await wire(energySector("standard"), 2035);
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const res = await setSectorStrategy(request("renewables"), { params });
    expect(res.status).toBe(200);
    const debit = db.collectionMocks.corporations.updateOne.mock.calls[0][1] as {
      $inc: { liquidCapital: number };
    };
    expect(-debit.$inc.liquidCapital).toBeCloseTo(REVENUE * STRATEGY_RETOOL_COST_FRACTION);
  });

  it("refuses a retool onto the retired method", async () => {
    await wire(energySector("renewables"), 2041);
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const res = await setSectorStrategy(request("standard"), { params });
    expect(res.status).toBe(400);
    expect(db.collectionMocks.corporateSectors.updateOne).not.toHaveBeenCalled();
  });
});
