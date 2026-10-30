import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

/** The funded-market transition package's free retool for mismatched sectors. */

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
const OPENING_TURN = 1000;
const CURRENT_TURN = OPENING_TURN + 3;

const corporation = {
  _id: CORP_ID,
  name: "Retoolco",
  countryId: "US",
  type: "manufacturing",
  ceoId: new ObjectId(),
  liquidCapital: 1_000_000_000,
  liquidCurrencyCode: "USD",
};

const mismatchedSector = {
  _id: SECTOR_ID,
  corporationId: CORP_ID,
  countryId: "US",
  stateId: "US-CA",
  sectorType: "manufacturing",
  strategyId: "standard",
  revenue: 1_000_000,
  capitalStock: 100,
  buildQueue: [],
  transitionCooldownUntilTurn: CURRENT_TURN + 10,
  cutoverTransition: {
    mismatched: true,
    legacyRevenueAnchor: 9,
    fundedRevenueAnchor: 1,
    basisTurns: 5,
  },
};

async function wire(sector: Record<string, unknown>) {
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
    worldEpochId: "w",
    producerOpening: { worldEpoch: "w", turn: OPENING_TURN, digest: "d" },
  });
}

const params = Promise.resolve({ id: CORP_ID.toString(), sectorId: SECTOR_ID.toString() });
const request = () =>
  new Request("http://localhost/api/corporations/1/sectors/2/strategy", {
    method: "POST",
    body: JSON.stringify({ strategyId: "heavy_metals" }),
  });

describe("transition package free retool", () => {
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

  it("is free, skips the cooldown and stamps the conversion once", async () => {
    await wire(mismatchedSector);
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const res = await setSectorStrategy(request(), { params });
    expect(res.status).toBe(200);
    const debit = db.collectionMocks.corporations.updateOne.mock.calls[0][1] as {
      $inc: { liquidCapital: number };
    };
    expect(debit.$inc.liquidCapital).toBeCloseTo(0);
    const set = (
      db.collectionMocks.corporateSectors.updateOne.mock.calls[0][1] as {
        $set: Record<string, unknown>;
      }
    ).$set;
    expect(set.cutoverConvertedAtTurn).toBe(CURRENT_TURN);
  });

  it("charges and respects the cooldown after the free conversion was used", async () => {
    await wire({ ...mismatchedSector, cutoverConvertedAtTurn: CURRENT_TURN - 1 });
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const res = await setSectorStrategy(request(), { params });
    expect(res.status).toBe(400);
  });

  it("waits for a funded turn to finish", async () => {
    await wire(mismatchedSector);
    const { rejectDuringTurn } = await import("@/lib/api/rejectDuringTurn");
    vi.mocked(rejectDuringTurn).mockResolvedValueOnce(new Response(null, { status: 409 }) as never);
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const res = await setSectorStrategy(request(), { params });
    expect(res.status).toBe(409);
    expect(db.collectionMocks.corporateSectors.updateOne).not.toHaveBeenCalled();
  });
});
