import { beforeEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { computeBuildCost } from "@/lib/constants/capacityEconomy";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({
  resolveCorporation: vi.fn(),
  requireCeo: vi.fn(),
}));
vi.mock("@/lib/currency/corporationCapital", () => ({
  corpLiquidCapitalToAnchor: vi.fn((v: number) => v),
  fxRateForCorpFromMap: vi.fn(() => 1),
  loadFxRatesByCurrency: vi.fn().mockResolvedValue(new Map()),
  resolveCorpLiquidCurrencyCode: vi.fn().mockReturnValue("USD"),
}));
vi.mock("@/lib/currency/corpEconomyFields", () => ({
  readCorpEconomicAnchor: vi.fn((v: number) => v),
}));
vi.mock("@/lib/corporations/marketShare", () => ({
  fetchCorporationNationalSectorSharesByCountry: vi.fn(
    async (_db: unknown, inputs: { countryIds: string[] }) =>
      new Map(inputs.countryIds.map((countryId) => [countryId, 0]))
  ),
}));

let db: MockDb;
let GET: typeof import("./route").GET;

// Compile the dependency graph before measuring requests and changing DB fixtures.
beforeAll(async () => {
  ({ GET } = await import("./route"));
}, 60_000);

function makeRequest(query: string) {
  return new Request(`http://localhost/api/corporations/1/expand-suggestions?${query}`);
}

const ctx = () => ({ params: Promise.resolve({ id: "1" }) });

beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  db.collection("states");
  db.collection("corporateSectors");
  db.collection("corporations");
  db.collection("gameConfig");
  db.collection("gameState");
  db.collection("federalBudget");
  db.collection("macroMetrics");
  db.collection("tradeFlowSnapshots");
  db.collection("commodityPrices");

  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);

  // The command-economy gate reads the world year to resolve each country's
  // marketization level. Without it every country reads as fully market and the
  // gate stops blocking, so the exclusion assertions below go vacuous.
  db.collectionMocks.gameState.findOne.mockResolvedValue({ _id: "current", currentYear: 1970 });

  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: "user1" },
  } as never);

  const { resolveCorporation, requireCeo } = await import("@/lib/api/corporations/resolveQuery");
  const corpId = new ObjectId();
  vi.mocked(resolveCorporation).mockResolvedValue({
    ok: true,
    corporation: {
      _id: corpId,
      userId: "user1",
      countryId: "US",
      type: "energy",
      secondaryType: "defense",
      marketingStrength: 0,
      liquidCapital: 1_000_000,
    },
  } as never);
  vi.mocked(requireCeo).mockReturnValue(null);
});

describe("GET /api/corporations/[id]/expand-suggestions (mode=unowned)", () => {
  it("queries the vehicle-model market for a manufacturing vehicle corporation", async () => {
    db.collectionMocks.gameConfig.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
    });
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentYear: 1991,
      currentTurn: 1,
    });
    const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
    vi.mocked(resolveCorporation).mockResolvedValue({
      ok: true,
      corporation: {
        _id: new ObjectId(),
        userId: "user1",
        countryId: "US",
        type: "manufacturing",
        liquidCapital: 1_000_000,
      },
    } as never);
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "MI", name: "Michigan", countryId: "US" }]),
    });
    const sectorFilters: unknown[] = [];
    db.collectionMocks.corporateSectors.find.mockImplementation((filter) => {
      sectorFilters.push(filter);
      return { project: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]) } as never;
    });
    db.collectionMocks.tradeFlowSnapshots.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    } as never);
    db.collectionMocks.commodityPrices.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    } as never);

    const response = await GET(makeRequest("sectorType=manufacturing&mode=unowned"), ctx());

    expect(response.status).toBe(200);
    expect(sectorFilters[0]).toMatchObject({
      sectorType: "manufacturing",
    });
    const data = await response.json();
    // No stored cell is needed: every region is offered as a candidate.
    expect((data.suggestions as { stateId: string }[]).map((r) => r.stateId)).toEqual(["MI"]);
  });

  it("surfaces the temporary Retail expansion pause before offering greenfield builds", async () => {
    db.collectionMocks.gameConfig.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
      retailDemandTransitionStartTurn: 100,
      retailDemandTransitionTurns: 192,
    });
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentYear: 1970,
      currentTurn: 148,
    });

    const response = await GET(makeRequest("sectorType=retail&mode=unowned"), ctx());
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("144 turns remaining");
    expect(data.error).toContain("plant transfers still operate normally");
  });

  it("keeps scope per leg while averaging: NJ logistics quotes on consulting strength despite its freight glut", async () => {
    db.collectionMocks.gameConfig.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
    });
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 10,
      currentYear: 1953,
    });
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { _id: "AZ", name: "Arizona", countryId: "US" },
        { _id: "NJ", name: "New Jersey", countryId: "US" },
      ]),
    });
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });
    db.collectionMocks.macroMetrics.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    db.collectionMocks.tradeFlowSnapshots.findOne.mockResolvedValue({
      books: {
        US: {
          freight: {
            supply: 1000,
            demand: 100,
            domesticDemand: 100,
            imports: 0,
            exports: 0,
            blockedSupply: 0,
            untradedSupply: 0,
          },
          consulting_services: {
            supply: 100,
            demand: 1000,
            domesticDemand: 1000,
            imports: 0,
            exports: 0,
            blockedSupply: 0,
            untradedSupply: 0,
          },
        },
      },
    });
    db.collectionMocks.commodityPrices.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          commodity: "freight",
          globalSupply: 1000,
          globalDemand: 100,
          stateSupply: { AZ: 100, NJ: 100 },
          stateDemand: { AZ: 200, NJ: 10 },
        },
        {
          commodity: "consulting_services",
          globalSupply: 100,
          globalDemand: 1000,
          stateSupply: {},
          stateDemand: {},
        },
      ]),
    });

    const response = await GET(makeRequest("sectorType=logistics&mode=unowned"), ctx());
    const data = await response.json();
    const byState = new Map(
      (data.suggestions as Array<{ stateId: string; roomToBuildUnits: number }>).map((row) => [
        row.stateId,
        row,
      ])
    );

    expect(response.status).toBe(200);
    expect(byState.get("AZ")?.roomToBuildUnits).toBeGreaterThan(0);
    // Demand audit step 4: the mean over legs replaces the min veto, so NJ's
    // nationally-short consulting leg lifts its quote above zero even though
    // its state-local freight leg is glutted. Scope is still per leg — NJ
    // uses NJ freight (0) and US consulting (900), never AZ's freight — so
    // the local glut still drags NJ to no more than AZ.
    expect(byState.get("NJ")?.roomToBuildUnits).toBeGreaterThan(0);
    expect(byState.get("NJ")?.roomToBuildUnits).toBeLessThanOrEqual(
      byState.get("AZ")?.roomToBuildUnits ?? 0
    );
  });

  it("shows room where buyers go unserved", async () => {
    db.collectionMocks.gameConfig.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
    });
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 10,
      currentYear: 1953,
    });
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { _id: "AZ", name: "Arizona", countryId: "US" },
        { _id: "NJ", name: "New Jersey", countryId: "US" },
      ]),
    });
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });
    db.collectionMocks.macroMetrics.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    db.collectionMocks.tradeFlowSnapshots.findOne.mockResolvedValue({
      books: {
        US: {
          freight: {
            supply: 1000,
            demand: 100,
            domesticDemand: 100,
            imports: 0,
            exports: 0,
            blockedSupply: 0,
            untradedSupply: 0,
          },
          consulting_services: {
            supply: 100,
            demand: 1000,
            domesticDemand: 1000,
            imports: 0,
            exports: 0,
            blockedSupply: 0,
            untradedSupply: 0,
          },
        },
      },
    });
    db.collectionMocks.commodityPrices.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          commodity: "freight",
          globalSupply: 1000,
          globalDemand: 100,
          stateSupply: { AZ: 100, NJ: 100 },
          stateDemand: { AZ: 200, NJ: 10 },
        },
        {
          commodity: "consulting_services",
          globalSupply: 100,
          globalDemand: 1000,
          stateSupply: {},
          stateDemand: {},
        },
      ]),
    });

    const response = await GET(makeRequest("sectorType=logistics&mode=unowned"), ctx());
    const data = await response.json();
    const az = (data.suggestions as Array<{ stateId: string; roomToBuildUnits: number }>).find(
      (row) => row.stateId === "AZ"
    );
    // AZ freight demand 200 against 100 delivered is a real shortage.
    expect(az?.roomToBuildUnits).toBeGreaterThan(0);
  });

  it("takes capacity already under construction off the room to build", async () => {
    db.collectionMocks.gameConfig.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
    });
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 10,
      currentYear: 1953,
    });
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { _id: "AZ", name: "Arizona", countryId: "US" },
        { _id: "NJ", name: "New Jersey", countryId: "US" },
      ]),
    });
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });
    db.collectionMocks.macroMetrics.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    db.collectionMocks.tradeFlowSnapshots.findOne.mockResolvedValue({
      books: {
        US: {
          freight: {
            supply: 1000,
            demand: 100,
            domesticDemand: 100,
            imports: 0,
            exports: 0,
            blockedSupply: 0,
            untradedSupply: 0,
          },
          consulting_services: {
            supply: 100,
            demand: 1000,
            domesticDemand: 1000,
            imports: 0,
            exports: 0,
            blockedSupply: 0,
            untradedSupply: 0,
          },
        },
      },
    });
    db.collectionMocks.commodityPrices.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          commodity: "freight",
          globalSupply: 1000,
          globalDemand: 100,
          stateSupply: { AZ: 100, NJ: 100 },
          stateDemand: { AZ: 200, NJ: 10 },
        },
        {
          commodity: "consulting_services",
          globalSupply: 100,
          globalDemand: 1000,
          stateSupply: {},
          stateDemand: {},
        },
      ]),
    });

    const baseline = await (
      await GET(makeRequest("sectorType=logistics&mode=unowned"), ctx())
    ).json();
    const before = (
      baseline.suggestions as Array<{ stateId: string; roomToBuildUnits: number }>
    ).find((row) => row.stateId === "AZ")!.roomToBuildUnits;
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([
        {
          _id: "6ad000000000000000000001",
          corporationId: "6ad000000000000000000002",
          stateId: "AZ",
          revenue: 0,
          buildQueue: [{ unitsOrdered: 1, costPaidAnchor: 1, startTurn: 9, onlineTurn: 20 }],
        },
      ]),
    });
    const after = (
      (await (await GET(makeRequest("sectorType=logistics&mode=unowned"), ctx())).json())
        .suggestions as Array<{ stateId: string; roomToBuildUnits: number }>
    ).find((row) => row.stateId === "AZ")!.roomToBuildUnits;
    expect(after).toBe(Math.max(0, before - 1));
  });

  it("offers zero-revenue greenfield markets under plants", async () => {
    const { fetchCorporationNationalSectorSharesByCountry } =
      await import("@/lib/corporations/marketShare");
    vi.mocked(fetchCorporationNationalSectorSharesByCountry).mockResolvedValueOnce(
      new Map([["US", 60]])
    );
    db.collectionMocks.gameConfig.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
    });
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 10,
      currentYear: 1953,
    });
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "CA", name: "California", countryId: "US" }]),
    });
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });
    db.collectionMocks.macroMetrics.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    const response = await GET(makeRequest("sectorType=real_estate&mode=unowned"), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.suggestions).toEqual([expect.objectContaining({ stateId: "CA", canAfford: true })]);
    const suggestion = data.suggestions[0] as { starterBuildCostAnchor: number };
    const expected = computeBuildCost({
      sectorType: "real_estate",
      units: data.starterUnits as number,
      strategyId: null,
      year: 1953,
      eraUnitScale: 1,
      marketSharePercent: 0,
      nationalMarketSharePercent: 60,
      primeRate: 3,
      founding: true,
    });
    expect(suggestion.starterBuildCostAnchor).toBe(Math.round(expected.totalAnchor));
  });

  it("serves plants suggestions for an off-type sector (any type is buildable)", async () => {
    db.collectionMocks.gameConfig.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
    });
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 10,
      currentYear: 1953,
    });
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "CA", name: "California", countryId: "US" }]),
    });
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });
    db.collectionMocks.macroMetrics.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    const response = await GET(makeRequest("sectorType=retail&mode=unowned"), ctx());

    expect(response.status).toBe(200);
  });

  it("returns foreign markets under plants — cross-border founding is buildable", async () => {
    db.collectionMocks.gameConfig.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
    });
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 10,
      currentYear: 1953,
    });
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { _id: "CA", name: "California", countryId: "US" },
        { _id: "ENG", name: "England", countryId: "UK" },
      ]),
    });
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });
    db.collectionMocks.macroMetrics.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    const response = await GET(makeRequest("sectorType=energy&mode=unowned"), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    // Both the home (CA/US) and foreign (ENG/UK) markets are offered now.
    expect((data.suggestions as { stateId: string }[]).map((row) => row.stateId).sort()).toEqual([
      "CA",
      "ENG",
    ]);
    expect(data.availableCountries).toEqual(["UK", "US"]);
  });

  it("excludes command-economy states (RU) from unowned-market suggestions and country chips", async () => {
    // Second call onward (post `stateIds` resolution) needs the full docs.
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { _id: "CA", name: "California", countryId: "US" },
        { _id: "UKR", name: "Ukraine", countryId: "RU" },
      ]),
    });
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });

    const response = await GET(makeRequest("sectorType=energy&mode=unowned"), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    const stateIds = (data.suggestions as { stateId: string }[]).map((s) => s.stateId);
    expect(stateIds).toContain("CA");
    expect(stateIds).not.toContain("UKR");
    expect(data.availableCountries).toEqual(["US"]);
  });

  it("returns no suggestions (not an error) when every candidate state is command-economy", async () => {
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "UKR", name: "Ukraine", countryId: "RU" }]),
    });
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });

    const response = await GET(makeRequest("sectorType=energy&mode=unowned"), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.suggestions).toEqual([]);
    expect(data.availableCountries).toEqual([]);
  });

  it("pins a below-top-N state into the returned suggestions when ?state= is set", async () => {
    const rows = ["CA", "NY", "PA", "IL", "OH", "MD"].map((stateId) => ({ stateId }));
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(
        rows.map((r) => ({
          _id: r.stateId,
          name: r.stateId,
          countryId: "US",
        }))
      ),
    });
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });

    const response = await GET(makeRequest("sectorType=defense&mode=unowned&state=MD"), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    const stateIds = (data.suggestions as { stateId: string }[]).map((s) => s.stateId);
    expect(stateIds[0]).toBe("MD");
    expect(stateIds).toContain("CA");
    expect(stateIds).toHaveLength(5);
  });
});

describe("GET /api/corporations/[id]/expand-suggestions (mode=playerCorp)", () => {
  it("still surfaces competitor corporations operating in a command-economy state", async () => {
    const natCorpId = new ObjectId();

    // Three distinct `corporateSectors.find` calls happen for this mode:
    // (1) the initial competitor-states lookup (`corporationId: {$ne}`),
    // (2) `ownedSectors` for OUR corp (`corporationId: <ours>`), and
    // (3) `siblingCorpSectors` (no corporationId filter — everyone). Branch on
    // shape rather than a single static return so `ownedSectors` doesn't get
    // handed a doc missing `_id`.
    db.collectionMocks.corporateSectors.find.mockImplementation(
      (query: { corporationId?: { $ne?: unknown } } = {}) => {
        const chain = { project: vi.fn().mockReturnThis(), toArray: vi.fn() };
        if (query.corporationId && "$ne" in query.corporationId) {
          chain.toArray.mockResolvedValue([{ stateId: "UKR" }]);
        } else if (query.corporationId) {
          chain.toArray.mockResolvedValue([]); // our corp owns nothing here
        } else {
          chain.toArray.mockResolvedValue([
            { stateId: "UKR", corporationId: natCorpId, revenue: 9000 },
          ]);
        }
        return chain;
      }
    );
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "UKR", name: "Ukraine", countryId: "RU" }]),
    });
    db.collectionMocks.corporations.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([{ _id: natCorpId, name: "USSR State Energy Trust" }]),
    });

    const response = await GET(makeRequest("sectorType=energy&mode=playerCorp"), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    const stateIds = (data.suggestions as { stateId: string }[]).map((s) => s.stateId);
    expect(stateIds).toContain("UKR");
    expect(data.availableCountries).toEqual(["RU"]);
  });
});

describe("GET /api/corporations/[id]/expand-suggestions entry verdict (plants)", () => {
  type Row = {
    stateId: string;
    canAfford: boolean;
    entry: { canEnter: boolean; reason: string | null; message: string | null } | null;
    roomToBuildUnits: number | null;
    roomScope: string | null;
  };

  function seedPlantsMarket(gameState: Record<string, unknown> = {}) {
    db.collectionMocks.gameConfig.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
    });
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 10,
      currentYear: 1953,
      ...gameState,
    });
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "CA", name: "California", countryId: "US" }]),
    });
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });
    db.collectionMocks.macroMetrics.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
  }

  async function corpOverride(fields: Record<string, unknown>) {
    const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
    vi.mocked(resolveCorporation).mockResolvedValue({
      ok: true,
      corporation: {
        _id: new ObjectId(),
        userId: "user1",
        countryId: "US",
        type: "energy",
        marketingStrength: 0,
        liquidCapital: 1_000_000,
        ...fields,
      },
    } as never);
  }

  async function firstRow(): Promise<{ row: Row; data: Record<string, unknown> }> {
    const response = await GET(makeRequest("sectorType=real_estate&mode=unowned"), ctx());
    expect(response.status).toBe(200);
    const data = await response.json();
    return { row: (data.suggestions as Row[])[0], data };
  }

  it("marks an affordable market enterable and reports room to build", async () => {
    seedPlantsMarket();
    const { row, data } = await firstRow();
    expect(row.entry).toEqual({ canEnter: true, reason: null, message: null });
    expect(typeof row.roomToBuildUnits).toBe("number");
    expect(row.roomScope).toBe(data.countrySharedDemand ? "country" : "state");
  });

  it("publishes funded national construction demand and its measured regional subset", async () => {
    seedPlantsMarket({ worldEpochId: "funded" });
    await corpOverride({ type: "construction" });
    db.collection("producerMarketOutcomes").findOne.mockResolvedValue({
      turn: 10,
      books: [{ countryId: "US", commodity: "construction_services", funded: 100, filled: 10 }],
      regionalBuildBooks: [],
    });
    const response = await GET(makeRequest("sectorType=construction&mode=unowned"), ctx());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.countrySharedDemand).toBe(true);
    expect(data.suggestions[0]).toMatchObject({
      roomScope: "country",
      buildDemandTurn: 10,
      buildDemand: [
        { commodity: "construction_services", scope: "regional", unmet: 0 },
        { commodity: "construction_services", scope: "national", unmet: 90 },
      ],
    });
  });

  it("does not rank mixed Telecom output as thousands of fully sellable hubs when software is filled", async () => {
    seedPlantsMarket({ worldEpochId: "funded" });
    await corpOverride({ type: "telecommunications" });
    db.collection("producerMarketOutcomes").findOne.mockResolvedValue({
      turn: 10,
      books: [
        { countryId: "US", commodity: "software", funded: 442352, filled: 483414 },
        { countryId: "US", commodity: "network_services", funded: 101859, filled: 0 },
      ],
      regionalBuildBooks: [],
    });
    const response = await GET(makeRequest("sectorType=telecommunications&mode=unowned"), ctx());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions[0].roomToBuildUnits).toBe(0);
    expect(data.countryDemandEstimates[0].roomToBuildUnits).toBe(0);
    expect(
      data.suggestions[0].buildDemand.find(
        (r: { commodity: string; scope: string }) =>
          r.commodity === "network_services" && r.scope === "national"
      ).capacityUnits
    ).toBeGreaterThan(0);
  });

  it("refuses with insufficient_capital when cash is short of the founding charge", async () => {
    seedPlantsMarket();
    await corpOverride({ liquidCapital: 0 });
    const { row } = await firstRow();
    expect(row.canAfford).toBe(false);
    expect(row.entry).toMatchObject({ canEnter: false, reason: "insufficient_capital" });
  });

  it("refuses with player_control_required while non-player management runs the corp", async () => {
    seedPlantsMarket();
    await corpOverride({ ceoType: "npp" });
    const { row } = await firstRow();
    // Affordable, but the command would still refuse it.
    expect(row.canAfford).toBe(true);
    expect(row.entry).toEqual({
      canEnter: false,
      reason: "player_control_required",
      message: "Resume player control of this corporation in its settings, then try again.",
    });
  });

  it("refuses with actions_paused while corporation actions are paused", async () => {
    seedPlantsMarket({ corporationActionsPaused: true });
    const { row } = await firstRow();
    expect(row.entry).toEqual({
      canEnter: false,
      reason: "actions_paused",
      message: "Corporation actions are currently paused by an admin",
    });
  });

  it("refuses with command_economy for a state-run market listed in competitor mode", async () => {
    seedPlantsMarket();
    const natCorpId = new ObjectId();
    db.collectionMocks.corporateSectors.find.mockImplementation(
      (query: { corporationId?: { $ne?: unknown } } = {}) => {
        const chain = { project: vi.fn().mockReturnThis(), toArray: vi.fn() };
        if (query.corporationId && "$ne" in query.corporationId) {
          chain.toArray.mockResolvedValue([{ stateId: "UKR" }]);
        } else if (query.corporationId) {
          chain.toArray.mockResolvedValue([]);
        } else {
          chain.toArray.mockResolvedValue([
            { stateId: "UKR", corporationId: natCorpId, revenue: 9000 },
          ]);
        }
        return chain;
      }
    );
    db.collectionMocks.states.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "UKR", name: "Ukraine", countryId: "RU" }]),
    });
    db.collectionMocks.corporations.find.mockReturnValue({
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([{ _id: natCorpId, name: "State Energy Trust" }]),
    });

    const response = await GET(makeRequest("sectorType=energy&mode=playerCorp"), ctx());
    const data = await response.json();
    const ukr = (data.suggestions as Row[]).find((s) => s.stateId === "UKR");
    expect(ukr?.entry).toMatchObject({ canEnter: false, reason: "command_economy" });
  });
});
