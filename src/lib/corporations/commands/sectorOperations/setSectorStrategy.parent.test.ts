import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { PARENT_DIRECTED_STRATEGY_PROTECTION_TURNS } from "@/lib/constants/sectorStrategies";

/** A controlling parent's CEO retools an AI-run subsidiary's sector (S#410). */

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/corporations/resolveQuery", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/corporations/resolveQuery")>(
    "@/lib/api/corporations/resolveQuery"
  );
  // Keep the real CEO-or-parent rule; only the parent lookup is stubbed below.
  return { ...actual, resolveCorporation: vi.fn() };
});
vi.mock("@/lib/corporations/subsidiaries/authorization", () => ({
  directingParentCorporationId: vi.fn(),
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
const SUB_ID = new ObjectId();
const PARENT_ID = new ObjectId();
const SECTOR_ID = new ObjectId();
const SUB_CEO_USER = new ObjectId();
const PARENT_CEO_USER = new ObjectId();
const CURRENT_TURN = 500;

const subsidiary = {
  _id: SUB_ID,
  name: "Subco",
  countryId: "US",
  type: "manufacturing",
  ceoType: "npp",
  userId: SUB_CEO_USER,
  ceoId: new ObjectId(),
  liquidCapital: 1_000_000_000,
  liquidCurrencyCode: "USD",
  subsidiaryFormalizedAtTurn: 10,
};

const sector = {
  _id: SECTOR_ID,
  corporationId: SUB_ID,
  countryId: "US",
  stateId: "US-CA",
  sectorType: "manufacturing",
  strategyId: "standard",
  revenue: 1_000_000,
  capitalStock: 100,
  buildQueue: [],
};

async function wire(callerUserId: ObjectId, directingParent: ObjectId | null) {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: callerUserId.toString() },
  } as never);
  const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
  vi.mocked(resolveCorporation).mockResolvedValue({ ok: true, corporation: subsidiary } as never);
  const { directingParentCorporationId } =
    await import("@/lib/corporations/subsidiaries/authorization");
  vi.mocked(directingParentCorporationId).mockResolvedValue(directingParent);
  db.collectionMocks.corporateSectors.findOne.mockResolvedValue(sector);
  db.collectionMocks.corporateSectors.updateOne.mockResolvedValue({ matchedCount: 1 });
  db.collectionMocks.corporations.updateOne.mockResolvedValue({ matchedCount: 1 });
  db.collectionMocks.gameState.findOne.mockResolvedValue({
    _id: "current",
    currentTurn: CURRENT_TURN,
  });
}

const params = Promise.resolve({ id: SUB_ID.toString(), sectorId: SECTOR_ID.toString() });
const request = () =>
  new Request("http://localhost/api/corporations/1/sectors/2/strategy", {
    method: "POST",
    body: JSON.stringify({ strategyId: "heavy_metals" }),
  });

function sectorSet() {
  return (
    db.collectionMocks.corporateSectors.updateOne.mock.calls[0][1] as {
      $set: Record<string, unknown>;
    }
  ).$set;
}

describe("parent-directed sector strategy", () => {
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

  it("lets the controlling parent's CEO retool, charging the subsidiary and stamping the parent", async () => {
    await wire(PARENT_CEO_USER, PARENT_ID);
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const res = await setSectorStrategy(request(), { params });
    expect(res.status).toBe(200);
    const debit = db.collectionMocks.corporations.updateOne.mock.calls[0];
    expect(debit[0]).toEqual({ _id: SUB_ID });
    expect((debit[1] as { $inc: { liquidCapital: number } }).$inc.liquidCapital).toBeLessThan(0);
    const set = sectorSet();
    expect(set.strategyId).toBe("heavy_metals");
    expect(set.transitionCooldownUntilTurn).toBe(CURRENT_TURN + 24);
    expect(set.parentDirectedStrategy).toEqual({
      byCorporationId: PARENT_ID,
      byUserId: PARENT_CEO_USER,
      strategyId: "heavy_metals",
      atTurn: CURRENT_TURN,
      untilTurn: CURRENT_TURN + PARENT_DIRECTED_STRATEGY_PROTECTION_TURNS,
    });
  });

  it("refuses a shareholder that does not control the subsidiary", async () => {
    await wire(new ObjectId(), null);
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const res = await setSectorStrategy(request(), { params });
    expect(res.status).toBe(403);
    expect(db.collectionMocks.corporateSectors.updateOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.corporations.updateOne).not.toHaveBeenCalled();
  });

  it("keeps the subsidiary's own CEO path unchanged and unstamped", async () => {
    await wire(SUB_CEO_USER, PARENT_ID);
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const res = await setSectorStrategy(request(), { params });
    expect(res.status).toBe(200);
    const { directingParentCorporationId } =
      await import("@/lib/corporations/subsidiaries/authorization");
    expect(directingParentCorporationId).not.toHaveBeenCalled();
    expect(sectorSet().parentDirectedStrategy).toBeUndefined();
  });

  it("applies the same cooldown to the parent as to the CEO", async () => {
    await wire(PARENT_CEO_USER, PARENT_ID);
    db.collectionMocks.corporateSectors.findOne.mockResolvedValue({
      ...sector,
      transitionCooldownUntilTurn: CURRENT_TURN + 5,
    });
    const { setSectorStrategy } = await import("./setSectorStrategy");
    const res = await setSectorStrategy(request(), { params });
    expect(res.status).toBe(400);
  });
});
