import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

/** A paid retool must leave a finance-history row (the cash debit used to be invisible). */

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

vi.mock("@/lib/corporations/sectorRetoolTxLog", () => ({
  emitSectorRetoolTx: vi.fn().mockResolvedValue(undefined),
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

const paidSector = {
  _id: SECTOR_ID,
  corporationId: CORP_ID,
  countryId: "US",
  stateId: "US-CA",
  sectorType: "manufacturing",
  strategyId: "standard",
  revenue: 1_000_000,
  capitalStock: 100,
  buildQueue: [],
  transitionCooldownUntilTurn: CURRENT_TURN - 1,
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

describe("paid retool ledger row", () => {
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

  it("emits a row equal to the exact liquidCapital debit", async () => {
    await wire(paidSector);
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const { emitSectorRetoolTx } = await import("@/lib/corporations/sectorRetoolTxLog");
    const res = await setSectorStrategy(request(), { params });
    expect(res.status).toBe(200);
    const debit = db.collectionMocks.corporations.updateOne.mock.calls[0][1] as {
      $inc: { liquidCapital: number };
    };
    expect(debit.$inc.liquidCapital).toBeLessThan(0);
    expect(emitSectorRetoolTx).toHaveBeenCalledTimes(1);
    expect(emitSectorRetoolTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "retool",
        amountLocal: -debit.$inc.liquidCapital,
        currencyCode: "USD",
        turn: CURRENT_TURN,
      })
    );
  });
});
