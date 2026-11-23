/**
 * Validates query scoping for getAllStateApprovalsForElection — used on every turn
 * when state-level general elections accumulate votes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Fixture dbs carry no census rows; strict tiers are covered in governmentApproval.censusTier.test.ts.
vi.mock("@/lib/country/countryTier", () => ({
  loadCountryTiers: async () => ({ fullSimulationIds: [] }),
}));

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
}));

describe("getAllStateApprovalsForElection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes state and metrics queries when countryIds is provided", async () => {
    const stateFind = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { _id: "CA", countryId: "US" },
        { _id: "TX", countryId: "US" },
      ]),
    });
    const metricsFind = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue({
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "states") return { find: stateFind };
        if (name === "macroMetrics") return { find: metricsFind };
        // P6d: loadElectorateGroups reads stateDemographics; default to empty.
        return {
          find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
          findOne: vi.fn().mockResolvedValue(null),
        };
      }),
    } as never);

    const { getAllStateApprovalsForElection } = await import("./getStateApprovalForElection");
    await getAllStateApprovalsForElection({ countryIds: ["US"] });

    expect(stateFind).toHaveBeenCalledWith(
      { countryId: { $in: ["US"] } },
      { projection: { _id: 1, countryId: 1 } }
    );
    expect(metricsFind).toHaveBeenCalledWith({
      _id: { $in: ["CA", "TX"] },
    });
  });

  it("uses unrestricted state queries and skips metrics for an empty world", async () => {
    const stateFind = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    const metricsFind = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue({
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "states") return { find: stateFind };
        if (name === "macroMetrics") return { find: metricsFind };
        // P6d: loadElectorateGroups reads stateDemographics; default to empty.
        return {
          find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
          findOne: vi.fn().mockResolvedValue(null),
        };
      }),
    } as never);

    const { getAllStateApprovalsForElection } = await import("./getStateApprovalForElection");
    await getAllStateApprovalsForElection();

    expect(stateFind).toHaveBeenCalledWith({}, { projection: { _id: 1, countryId: 1 } });
    expect(metricsFind).not.toHaveBeenCalled();
  });

  // P6d "full payoff" gate: the electorate weighting must REACH elections.
  // Two states with IDENTICAL metrics but opposite electorates must get
  // different election approvals (a conservative bloc rewards high economic
  // freedom more than a progressive bloc).
  // P6d — electorate differentiation. This used to be exercised through the
  // LEGACY metric scorer on a non-playable fixture, but every board country now
  // routes to the political pipeline, so the mechanism moved: electorate lean
  // is the affinity term of the hybrid model rather than a metric weighting.
  // The property under test is unchanged — two regions with an IDENTICAL board
  // must still diverge on approval when their electorates differ.
  it("election approval reflects each state's electorate (P6d full payoff)", async () => {
    const { POLITICAL_METRIC_FAMILIES } = await import("@/lib/politicalMetrics/families");
    // A right-leaning board: +lean families excellent, -lean families poor.
    const rightBoard = Object.fromEntries(
      POLITICAL_METRIC_FAMILIES.map((f) => [f.id, f.lean > 0 ? 80 : 40])
    );
    const states = [
      { _id: "CONS", countryId: "DE", population: 100, cachedEconomicLean: 5, cachedSocialLean: 5 },
      {
        _id: "PROG",
        countryId: "DE",
        population: 100,
        cachedEconomicLean: -5,
        cachedSocialLean: -5,
      },
    ];
    const political = [
      { _id: "CONS", countryId: "DE", values: rightBoard },
      { _id: "PROG", countryId: "DE", values: rightBoard },
    ];
    // Empty legacy docs: the result map is keyed off them, but their contents
    // no longer feed the base for a board country.
    const metrics = [
      { _id: "CONS", countryId: "DE" },
      { _id: "PROG", countryId: "DE" },
    ];
    const cursor = (data: unknown[]) => ({ toArray: vi.fn().mockResolvedValue(data) });

    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue({
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "states") return { find: () => cursor(states) };
        if (name === "macroMetrics") return { find: () => cursor(metrics) };
        if (name === "politicalMetrics") return { find: () => cursor(political) };
        // The world's preset selects which era's approval intercept DE scores
        // against; without it the lookup fails loudly rather than guessing.
        if (name === "gameState") {
          return {
            find: () => cursor([]),
            findOne: vi.fn().mockResolvedValue({ _id: "current", preset: "1953-default" }),
          };
        }
        return { find: () => cursor([]), findOne: vi.fn().mockResolvedValue(null) };
      }),
    } as never);

    const { getAllStateApprovalsForElection } = await import("./getStateApprovalForElection");
    const result = await getAllStateApprovalsForElection({ countryIds: ["DE"] });

    // Same board, different electorates — the right-leaning region approves of
    // a right-leaning policy record more than the left-leaning one does.
    expect(result.get("CONS")!).toBeGreaterThan(result.get("PROG")!);
  });

  // SP4: playable countries' election approval comes from the hybrid political
  // base — the region with the better political board wins.
  it("playable-country election approval tracks the political board (SP4)", async () => {
    const { POLITICAL_METRIC_FAMILIES } = await import("@/lib/politicalMetrics/families");
    const { APPROVAL_NEUTRAL_SCORE } = await import("@/lib/politicalLegislation/politicalApproval");
    const uniform = (v: number) =>
      Object.fromEntries(POLITICAL_METRIC_FAMILIES.map((f) => [f.id, v]));
    const states = [
      { _id: "GOOD", countryId: "US", population: 1 },
      { _id: "BAD", countryId: "US", population: 1 },
    ];
    const metrics = [
      { _id: "GOOD", economic: { gdpGrowth: { value: 2 } } },
      { _id: "BAD", economic: { gdpGrowth: { value: 2 } } },
    ];
    const political = [
      { _id: "GOOD", countryId: "US", values: uniform(APPROVAL_NEUTRAL_SCORE.US + 10) },
      { _id: "BAD", countryId: "US", values: uniform(APPROVAL_NEUTRAL_SCORE.US - 10) },
    ];
    const cursor = (data: unknown[]) => ({ toArray: vi.fn().mockResolvedValue(data) });

    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue({
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "states") return { find: () => cursor(states) };
        if (name === "macroMetrics") return { find: () => cursor(metrics) };
        if (name === "politicalMetrics") return { find: () => cursor(political) };
        return { find: () => cursor([]), findOne: vi.fn().mockResolvedValue(null) };
      }),
    } as never);

    const { getAllStateApprovalsForElection } = await import("./getStateApprovalForElection");
    const result = await getAllStateApprovalsForElection({ countryIds: ["US"] });
    expect(result.get("GOOD")!).toBeGreaterThan(result.get("BAD")!);
    expect(result.get("GOOD")!).toBeCloseTo(54.9, 1);
    expect(result.get("BAD")!).toBeCloseTo(45.1, 1);
  });
});

it("shares recorded ratings with the regional page without requiring live metric boards", async () => {
  const records = [
    {
      _id: "TX",
      stateId: "TX",
      countryId: "US",
      lastSnapshotTurn: 50,
      approvalRating: 12,
      baseApproval: 50,
      activeModifiers: [],
    },
    {
      _id: "CT",
      stateId: "CT",
      countryId: "US",
      lastSnapshotTurn: 50,
      approvalRating: 84,
      baseApproval: 60,
      activeModifiers: [],
    },
  ];
  const db = {
    collection: (name: string) => {
      if (name === "states")
        return {
          find: () => ({
            toArray: async () => records.map((row) => ({ _id: row._id, countryId: row.countryId })),
          }),
        };
      if (name === "stateApprovalHistory")
        return { find: () => ({ toArray: async () => records }), findOne: async () => records[0] };
      throw new Error(`Unexpected owner read: ${name}`);
    },
  };
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as never);
  const { getAllStateApprovalsForElection } = await import("./getStateApprovalForElection");
  const { getRegionalApprovalData } = await import("@/lib/states/approval/getRegionalApprovalData");
  const ratings = await getAllStateApprovalsForElection({ countryIds: ["US"] });
  expect(ratings.get("TX")).toBe(12);
  expect(ratings.get("CT")).toBe(84);
  expect((await getRegionalApprovalData(db as never, "US", "TX"))?.approval).toBe(
    ratings.get("TX")
  );
});
