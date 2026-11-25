import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/tariffs/ftaOverrides", () => ({
  loadActiveFtaPairs: vi.fn().mockResolvedValue([]),
}));

let db: MockDb;

const ctx = () => ({ params: Promise.resolve({ code: "US", id: "CA" }) });

beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  db.collection("exchangeRates").find.mockReturnValue({
    toArray: async () => [{ currencyCode: "USD", rate: 1 }],
  });
  db.collection("states");
  db.collection("stateMetrics");
  db.collection("macroMetrics");
  db.collection("tariffs");
  db.collection("stateResourceCapacity");
  db.collection("corporateSectors");
  db.collection("corporations");
  db.collection("users");
  db.collection("exchangeRates");
  db.collection("characters");
  db.collection("imperialCharacters");

  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
});

describe("GET /api/country/[code]/region/[id]/economy", () => {
  it("returns the primary and secondary regional sector margin bonuses in percentage points", async () => {
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 1_000_000_000,
      sectorSpecializations: { primary: "energy", secondary: "technology" },
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/country/US/region/CA/economy"),
      ctx()
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sectorSpecializations).toEqual({
      primary: "energy",
      primaryLabel: "Energy",
      primaryBonus: 5,
      secondary: "technology",
      secondaryLabel: "Technology",
      secondaryBonus: 2.5,
    });
  });

  it("filters out orphan sectors whose corporation no longer exists", async () => {
    const liveCorpId = new ObjectId();
    const orphanCorpId = new ObjectId(); // not present in `corporations`
    const liveSectorId = new ObjectId();
    const orphanSectorId = new ObjectId();

    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.stateMetrics.findOne.mockResolvedValue(null);
    db.collectionMocks.tariffs.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.stateResourceCapacity.findOne.mockResolvedValue(null);

    // Two sectors of the same type in CA: one owned by a live corp, one orphan.
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      toArray: async () => [
        {
          _id: liveSectorId,
          corporationId: liveCorpId,
          countryId: "US",
          stateId: "CA",
          sectorType: "extraction",
          revenue: 500_000,
          targetGrowthRate: 0,
          currentGrowthRate: 0,
        },
        {
          _id: orphanSectorId,
          corporationId: orphanCorpId,
          countryId: "US",
          stateId: "CA",
          sectorType: "extraction",
          revenue: 250_000,
          targetGrowthRate: 0,
          currentGrowthRate: 0,
        },
      ],
    });

    // Only the live corp comes back from `corporations.find({_id: {$in: [...]}})`.
    db.collectionMocks.corporations.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: async () => [
          {
            _id: liveCorpId,
            name: "Live Corp",
            ceoId: new ObjectId(),
            ceoType: "regular",
            ceoVacant: false,
            sequentialId: 42,
            brandColor: "#fff",
            logoUrl: null,
            marketingStrength: 100,
            countryOwnerId: null,
            countryId: "US",
            liquidCurrencyCode: "USD",
          },
        ],
      }),
    });

    db.collectionMocks.exchangeRates.find.mockReturnValue({
      toArray: async () => [{ currencyCode: "USD", rate: 1 }],
    });

    db.collectionMocks.characters.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });
    db.collectionMocks.imperialCharacters.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/country/US/region/CA/economy"),
      ctx()
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    const extractionEntry = (
      data.sectors as Array<{
        type: string;
        owners: Array<{ sectorId: string; corporationId: string }>;
      }>
    ).find((s) => s.type === "extraction");
    expect(extractionEntry).toBeDefined();
    const ownerSectorIds = extractionEntry!.owners.map((o) => o.sectorId);
    expect(ownerSectorIds).toContain(liveSectorId.toHexString());
    expect(ownerSectorIds).not.toContain(orphanSectorId.toHexString());
  });

  it("redacts marketingStrength/revenue/workers for private corps to a public viewer but keeps marketShare", async () => {
    const privateCorpId = new ObjectId();
    const sectorId = new ObjectId();

    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.stateMetrics.findOne.mockResolvedValue(null);
    db.collectionMocks.tariffs.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.stateResourceCapacity.findOne.mockResolvedValue(null);

    db.collectionMocks.corporateSectors.find.mockReturnValue({
      toArray: async () => [
        {
          _id: sectorId,
          corporationId: privateCorpId,
          countryId: "US",
          stateId: "CA",
          sectorType: "extraction",
          revenue: 500_000,
          targetGrowthRate: 0,
          currentGrowthRate: 0,
        },
      ],
    });

    db.collectionMocks.corporations.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: async () => [
          {
            _id: privateCorpId,
            name: "Secret Holdings",
            ceoId: new ObjectId(),
            ceoType: "regular",
            ceoVacant: false,
            sequentialId: 7,
            brandColor: "#000",
            logoUrl: null,
            marketingStrength: 99,
            countryOwnerId: null,
            countryId: "US",
            liquidCurrencyCode: "USD",
            isPrivate: true,
            userId: new ObjectId(),
          },
        ],
      }),
    });

    db.collectionMocks.exchangeRates.find.mockReturnValue({
      toArray: async () => [{ currencyCode: "USD", rate: 1 }],
    });
    db.collectionMocks.characters.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });
    db.collectionMocks.imperialCharacters.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/country/US/region/CA/economy"),
      ctx()
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    const extraction = (
      data.sectors as Array<{
        type: string;
        owners: Array<{
          corporationId: string;
          defenderMarketingStrength: number | null;
          revenue: number | null;
          workers: number | null;
          marketShare: number;
        }>;
      }>
    ).find((s) => s.type === "extraction");
    const owner = extraction!.owners.find((o) => o.corporationId === privateCorpId.toHexString());
    expect(owner).toBeDefined();
    expect(owner!.defenderMarketingStrength).toBeNull();
    expect(owner!.revenue).toBeNull();
    expect(owner!.workers).toBeNull();
    // marketShare stays so the ownership ranking / Sector Targets view still works.
    expect(owner!.marketShare).toBeGreaterThan(0);
  });

  it("returns macro growth context (own region metric + canonical national) for the macro header", async () => {
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.states.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: async () => [
          { _id: "CA", population: 30_000_000 },
          { _id: "TX", population: 10_000_000 },
        ],
      }),
      toArray: async () => [],
    });
    db.collectionMocks.stateMetrics.findOne.mockResolvedValue(null);
    // The region's own value comes from its own doc; the NATIONAL figure comes
    // from the national doc (`federal` for US), never a mean of the regions.
    db.collectionMocks.macroMetrics.findOne.mockImplementation(async (filter: { _id: string }) =>
      filter._id === "CA"
        ? { _id: "CA", economic: { gdpGrowth: { value: 2.5 } } }
        : { _id: "federal", economic: { gdpGrowth: { value: 4.068 } } }
    );
    db.collectionMocks.tariffs.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.stateResourceCapacity.findOne.mockResolvedValue(null);
    db.collectionMocks.corporateSectors.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.exchangeRates.find.mockReturnValue({
      toArray: async () => [{ currencyCode: "USD", rate: 1 }],
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/country/US/region/CA/economy"),
      ctx()
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.macro).toBeDefined();
    expect(data.macro.stateGdpGrowth).toBe(2.5);
    // The national doc's own value, NOT a population-weighted mean of the two
    // regions (which would have produced 2.25). Population is the wrong weight:
    // the engine compounds each region's GDP by that region's own rate, so only
    // a GDP-weighted aggregate is consistent, and the national doc already is
    // one. See lib/country/nationalGdpGrowth.
    expect(data.macro.nationalGdpGrowth).toBe(4.068);
  });

  it("degrades macro growth to nulls when metrics are missing instead of failing", async () => {
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.states.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
      toArray: async () => [],
    });
    db.collectionMocks.stateMetrics.findOne.mockResolvedValue(null);
    db.collectionMocks.macroMetrics.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });
    db.collectionMocks.tariffs.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.stateResourceCapacity.findOne.mockResolvedValue(null);
    db.collectionMocks.corporateSectors.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.exchangeRates.find.mockReturnValue({
      toArray: async () => [{ currencyCode: "USD", rate: 1 }],
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/country/US/region/CA/economy"),
      ctx()
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.macro).toEqual({ stateGdpGrowth: null, nationalGdpGrowth: null });
  });

  it("includes national sector totals for the cross-link context line", async () => {
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 0,
    });
    db.collectionMocks.states.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: async () => [{ _id: "CA", name: "California", gdp: 0, population: 30 }],
      }),
      toArray: async () => [],
    });
    db.collectionMocks.stateMetrics.findOne.mockResolvedValue(null);
    db.collectionMocks.macroMetrics.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });
    db.collectionMocks.tariffs.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.stateResourceCapacity.findOne.mockResolvedValue(null);
    // One built energy plant in CA sizes the national market; nothing is stored.
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      toArray: async () => [
        {
          _id: new ObjectId(),
          corporationId: new ObjectId(),
          stateId: "CA",
          countryId: "US",
          sectorType: "energy",
          revenue: 1000,
          realizedRevenue: 0,
          capitalStock: 5,
          operatingCapacityUnits: 5,
          strategyId: "standard",
          mothballed: false,
        },
      ],
    });
    db.collectionMocks.corporations.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });
    db.collectionMocks.exchangeRates.find.mockReturnValue({
      toArray: async () => [{ currencyCode: "USD", rate: 1 }],
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/country/US/region/CA/economy"),
      ctx()
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.nationalSectorTotals).toBeDefined();
    expect(data.nationalSectorTotals.energy).toBeGreaterThan(0);
    // No stored market exists, so the sector rows carry no unowned or split figures.
    expect(Object.keys(data.sectors[0])).not.toEqual(
      expect.arrayContaining(["unownedRevenue", "unownedPercent", "splitCost"])
    );
    expect(data.sectors[0]).not.toHaveProperty("unownedRevenue");
  });

  it("nets a country-shared room to build off plants under construction anywhere in the country", async () => {
    db.collection("gameConfig");
    db.collection("gameState");
    db.collection("commodityPrices");
    db.collection("tradeFlowSnapshots");
    db.collectionMocks.gameConfig.findOne.mockResolvedValue({
      _id: "default",
      marketSystemMode: "plants",
    });
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 10,
      currentYear: 1953,
    });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 0,
    });
    db.collectionMocks.states.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: async () => [{ _id: "CA", name: "California", gdp: 0, population: 30 }],
      }),
      toArray: async () => [
        { _id: "CA", countryId: "US" },
        { _id: "NV", countryId: "US" },
      ],
    });
    db.collectionMocks.stateMetrics.findOne.mockResolvedValue(null);
    db.collectionMocks.macroMetrics.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });
    db.collectionMocks.tariffs.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.stateResourceCapacity.findOne.mockResolvedValue(null);
    db.collectionMocks.corporations.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });
    db.collectionMocks.exchangeRates.find.mockReturnValue({
      toArray: async () => [{ currencyCode: "USD", rate: 1 }],
    });
    db.collectionMocks.tradeFlowSnapshots.findOne.mockResolvedValue({
      books: {
        US: {
          energy: {
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
      toArray: async () => [
        {
          commodity: "energy",
          globalSupply: 100,
          globalDemand: 1000,
          stateSupply: {},
          stateDemand: {},
        },
      ],
    });
    // A plant under construction in Nevada, not in the viewed state.
    let nevadaQueue: unknown[] = [];
    db.collectionMocks.corporateSectors.find.mockImplementation(
      (query: Record<string, unknown> = {}) => ({
        toArray: async () => ("buildQueue.0" in query ? nevadaQueue : []),
      })
    );

    const { GET } = await import("./route");
    const read = async () => {
      const data = await (
        await GET(new Request("http://localhost/api/country/US/region/CA/economy"), ctx())
      ).json();
      return new Map(
        (
          data.sectors as Array<{
            type: string;
            roomToBuildUnits: number;
            roomToBuildScope: string;
          }>
        ).map((s) => [s.type, s])
      );
    };

    const before = await read();
    expect(before.get("energy")?.roomToBuildScope).toBe("country");
    expect(before.get("real_estate")?.roomToBuildScope).toBe("state");
    expect(before.get("energy")?.roomToBuildUnits).toBeGreaterThan(1);

    nevadaQueue = [
      {
        stateId: "NV",
        sectorType: "energy",
        buildQueue: [{ unitsOrdered: 1, costPaidAnchor: 1, startTurn: 9, onlineTurn: 50 }],
      },
    ];
    const after = await read();
    expect(after.get("energy")?.roomToBuildUnits).toBe(
      (before.get("energy")?.roomToBuildUnits ?? 0) - 1
    );
  });

  it("exposes the sector's production level on each owner row", async () => {
    const corpId = new ObjectId();
    const sectorId = new ObjectId();

    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.stateMetrics.findOne.mockResolvedValue(null);
    db.collectionMocks.tariffs.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.stateResourceCapacity.findOne.mockResolvedValue(null);

    db.collectionMocks.corporateSectors.find.mockReturnValue({
      toArray: async () => [
        {
          _id: sectorId,
          corporationId: corpId,
          countryId: "US",
          stateId: "CA",
          sectorType: "extraction",
          revenue: 500_000,
          targetGrowthRate: 0,
          currentGrowthRate: 0,
          productionPolicyLevel: -12,
        },
      ],
    });
    db.collectionMocks.corporations.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: async () => [
          {
            _id: corpId,
            name: "Prod Corp",
            ceoId: new ObjectId(),
            ceoType: "regular",
            ceoVacant: false,
            sequentialId: 9,
            brandColor: "#fff",
            logoUrl: null,
            marketingStrength: 10,
            countryOwnerId: null,
            countryId: "US",
            liquidCurrencyCode: "USD",
          },
        ],
      }),
    });
    db.collectionMocks.exchangeRates.find.mockReturnValue({
      toArray: async () => [{ currencyCode: "USD", rate: 1 }],
    });
    db.collectionMocks.characters.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });
    db.collectionMocks.imperialCharacters.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/country/US/region/CA/economy"),
      ctx()
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    const extraction = (
      data.sectors as Array<{
        type: string;
        owners: Array<{ corporationId: string; productionLevel: number }>;
      }>
    ).find((s) => s.type === "extraction");
    const owner = extraction!.owners.find((o) => o.corporationId === corpId.toHexString());
    expect(owner).toBeDefined();
    expect(owner!.productionLevel).toBe(-12);
  });

  it("hides revenue, workers and marketing strength for private corps", async () => {
    const privateCorpId = new ObjectId();
    const privateOwnerUserId = new ObjectId();
    const viewerUserId = new ObjectId();
    const viewerCharacterId = new ObjectId();
    const viewerCorpId = new ObjectId();
    const sectorId = new ObjectId();

    const { getAuthUser } = await import("@/lib/auth");
    vi.mocked(getAuthUser).mockResolvedValue({
      userId: viewerUserId.toHexString(),
      isAdmin: false,
      isModerator: false,
    } as never);

    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.stateMetrics.findOne.mockResolvedValue(null);
    db.collectionMocks.tariffs.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.stateResourceCapacity.findOne.mockResolvedValue(null);
    db.collectionMocks.users.findOne.mockResolvedValue({ _id: viewerUserId });
    db.collectionMocks.characters.findOne.mockResolvedValue({
      _id: viewerCharacterId,
      userId: viewerUserId,
    });
    db.collectionMocks.corporations.findOne.mockResolvedValue({
      _id: viewerCorpId,
      type: "technology",
      marketingStrength: 50,
      splitEscalation: 7,
      countryId: "US",
    });

    db.collectionMocks.corporateSectors.find.mockReturnValue({
      toArray: async () => [
        {
          _id: sectorId,
          corporationId: privateCorpId,
          countryId: "US",
          stateId: "CA",
          sectorType: "extraction",
          revenue: 500_000,
          targetGrowthRate: 0,
          currentGrowthRate: 0,
        },
      ],
    });

    db.collectionMocks.corporations.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: async () => [
          {
            _id: privateCorpId,
            name: "Secret Holdings",
            ceoId: new ObjectId(),
            ceoType: "regular",
            ceoVacant: false,
            sequentialId: 7,
            brandColor: "#000",
            logoUrl: null,
            marketingStrength: 99,
            countryOwnerId: null,
            countryId: "US",
            liquidCurrencyCode: "USD",
            isPrivate: true,
            userId: privateOwnerUserId,
          },
        ],
      }),
    });

    db.collectionMocks.exchangeRates.find.mockReturnValue({
      toArray: async () => [{ currencyCode: "USD", rate: 1 }],
    });
    db.collectionMocks.characters.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });
    db.collectionMocks.imperialCharacters.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/country/US/region/CA/economy"),
      ctx()
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attackMsCost).toBe(128);
    const extraction = (
      data.sectors as Array<{
        type: string;
        owners: Array<{
          corporationId: string;
          defenderMarketingStrength: number | null;
          revenue: number | null;
          workers: number | null;
          attackCost: number | null;
          attackEstimatedCapture: number | null;
          marketShare: number;
        }>;
      }>
    ).find((s) => s.type === "extraction");
    const owner = extraction!.owners.find((o) => o.corporationId === privateCorpId.toHexString());
    expect(owner).toBeDefined();
    expect(owner!.defenderMarketingStrength).toBeNull();
    expect(owner!.revenue).toBeNull();
    expect(owner!.workers).toBeNull();
    // Attack estimates are not quoted at plants, so a private corp carries none.
    expect(owner!.attackCost ?? null).toBeNull();
    expect(owner!.attackEstimatedCapture ?? null).toBeNull();
    expect(owner!.marketShare).toBeGreaterThan(0);
  });
});

describe("GET region economy with a foreign owner in a euro country", () => {
  it("loads a region whose sector is stored in an era-blind host currency", async () => {
    // A US corp's French sector is stored in the host's era-blind currency,
    // which has no live quote; the regional market view reads it at the era rate.
    const { resetCorpFxRateCacheForTests } = await import("@/lib/currency/corporationCapital");
    resetCorpFxRateCacheForTests();
    const corpId = new ObjectId();
    db.collection("gameState").findOne.mockResolvedValue({
      _id: "current",
      currentYear: 2027,
      preset: "2027-default",
    });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "FR-IDF",
      countryId: "FR",
      name: "Paris",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.stateMetrics.findOne.mockResolvedValue(null);
    db.collectionMocks.tariffs.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.stateResourceCapacity.findOne.mockResolvedValue(null);
    db.collectionMocks.corporateSectors.find.mockReturnValue({
      toArray: async () => [
        {
          _id: new ObjectId(),
          corporationId: corpId,
          countryId: "FR",
          stateId: "FR-IDF",
          sectorType: "extraction",
          revenue: 500_000,
          targetGrowthRate: 0,
          currentGrowthRate: 0,
        },
      ],
    });
    db.collectionMocks.corporations.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: async () => [
          {
            _id: corpId,
            name: "Overseas Corp",
            ceoId: new ObjectId(),
            ceoType: "regular",
            ceoVacant: false,
            sequentialId: 43,
            brandColor: "#fff",
            logoUrl: null,
            marketingStrength: 100,
            countryOwnerId: null,
            countryId: "US",
            liquidCurrencyCode: "USD",
          },
        ],
      }),
    });
    db.collectionMocks.exchangeRates.find.mockReturnValue({
      toArray: async () => [
        { currencyCode: "USD", rate: 1 },
        { currencyCode: "EUR", rate: 0.9 },
      ],
    });
    db.collectionMocks.characters.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });
    db.collectionMocks.imperialCharacters.find.mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: async () => [] }),
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/country/FR/region/FR-IDF/economy"),
      { params: Promise.resolve({ code: "FR", id: "FR-IDF" }) }
    );

    expect(response.status).toBe(200);
  });
});
