import { describe, it, expect } from "vitest";
import {
  findBestMarketCandidate as findBestMarketCandidateRaw,
  HQ_STATE_SCORE_BONUS,
  hasEnterableHeadroom,
  markMarketsActive,
  sectorShortageScore,
} from "./marketSignals";
import type { MarketCandidate } from "./marketCandidates";
import { candidateWithRoom, roomOf, withCandidateRoom } from "./__fixtures__/marketCandidates";
import type { CommodityType } from "@/lib/constants/commodities";

const us = (sectorType: string, stateId: string, room = 100_000): MarketCandidate =>
  candidateWithRoom({ sectorType, stateId } as never, room);

const findBestMarketCandidate: typeof findBestMarketCandidateRaw = (...args) => {
  const withSignals = [...args] as unknown as Parameters<typeof findBestMarketCandidateRaw>;
  withSignals[10] = withCandidateRoom(args[10]);
  return findBestMarketCandidateRaw(...withSignals);
};

const ratios =
  (map: Partial<Record<CommodityType, number>>) =>
  (commodity: CommodityType): number | null =>
    map[commodity] ?? 1;

describe("state-resolution placement signals (supply dislocation, t202)", () => {
  it("prefers an adjacent frontier state and allows the same sector type there", () => {
    const pool = new Map([
      ["US", [us("manufacturing", "AZ", 100_000), us("manufacturing", "TX", 10_000_000)]],
    ]);
    const pick = findBestMarketCandidate(
      "US",
      "CA",
      "manufacturing",
      null,
      new Set(["CA:manufacturing"]),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      undefined,
      new Set(["AZ", "NV", "OR"])
    );

    expect(pick?.stateId).toBe("AZ");
    expect(pick?.sectorType).toBe("manufacturing");
  });

  it("a starved non-HQ state outscores the HQ state", () => {
    // Two open manufacturing buckets, same size. NY's state prices show a real
    // shortage; the HQ state (PA) is at base. The old unconditional HQ pick
    // returned PA regardless — the shortage signal must now win.
    const pool = new Map([["US", [us("manufacturing", "PA"), us("manufacturing", "NY")]]]);
    const pick = findBestMarketCandidate(
      "US",
      "PA",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      { statePriceRatioOf: (_commodity, stateId) => (stateId === "NY" ? 1.5 : 1.0) }
    );
    expect(pick?.stateId).toBe("NY");
  });

  it("the HQ state still wins a tie (score bonus, not a hard pick)", () => {
    const pool = new Map([["US", [us("manufacturing", "NY"), us("manufacturing", "PA")]]]);
    const pick = findBestMarketCandidate(
      "US",
      "PA",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      { statePriceRatioOf: () => 1.0 }
    );
    expect(HQ_STATE_SCORE_BONUS).toBeGreaterThan(1);
    expect(pick?.stateId).toBe("PA");
  });

  it("without signals the behavior is score-ranked with the HQ bonus (no signals = country scope)", () => {
    // Legacy callers pass no signals; ranking still runs and HQ still gets its
    // preference on equal candidates.
    const pool = new Map([["US", [us("manufacturing", "NY"), us("manufacturing", "PA")]]]);
    const pick = findBestMarketCandidate(
      "US",
      "PA",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false
    );
    expect(pick?.stateId).toBe("PA");
  });

  it("extraction never founds in a state with zero deposit headroom", () => {
    // TX has deposits, the HQ state (NY) has none. Even with the HQ bonus the
    // NY candidate is dropped outright — a depositless extraction sector clamps
    // at zero output forever.
    const pool = new Map([["US", [us("extraction", "NY"), us("extraction", "TX")]]]);
    const pick = findBestMarketCandidate(
      "US",
      "NY",
      "extraction",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      { extractionHeadroomOf: (stateId) => (stateId === "TX" ? 0.8 : 0) }
    );
    expect(pick?.stateId).toBe("TX");
  });

  it("extraction ranks by unmet demand between states that both hold a deposit", () => {
    const pool = new Map([
      ["US", [us("extraction", "MN", 900_000), us("extraction", "WV", 100_000)]],
    ]);
    const pick = findBestMarketCandidate(
      "US",
      "WV",
      "extraction",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      // Both deposits are open. MN's room beats WV's 100k x HQ bonus 1.3.
      { extractionHeadroomOf: () => 1 }
    );
    expect(pick?.stateId).toBe("MN");
  });

  it("founds an extraction mine on a deposit only where its output is short", () => {
    const pool = new Map([["US", [us("extraction", "WY", 100_000), us("extraction", "NJ", 0)]]]);
    const pick = findBestMarketCandidate(
      "US",
      "NJ",
      "extraction",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({ oil: 1.6 }),
      true,
      1,
      { extractionHeadroomOf: (stateId) => (stateId === "WY" ? 0.9 : 0) }
    );
    expect(pick?.stateId).toBe("WY");
  });

  it("never founds a mine on a rich deposit when nothing it digs up is short", () => {
    const stats = {
      occupiedExcluded: 0,
      noRoomExcluded: 0,
      stateControlledExcluded: 0,
      depositExcluded: 0,
      saturatedExcluded: 0,
      inputStarvedExcluded: 0,
    };
    const pool = new Map([["US", [us("extraction", "WY", 0)]]]);
    const pick = findBestMarketCandidate(
      "US",
      "WY",
      "extraction",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({ oil: 1.6 }),
      true,
      1,
      { extractionHeadroomOf: () => 1 },
      undefined,
      stats
    );
    expect(pick).toBeNull();
    expect(stats.noRoomExcluded).toBe(1);
    expect(stats.depositExcluded).toBe(0);
  });

  it("returns null when every extraction candidate is depositless", () => {
    const pool = new Map([["US", [us("extraction", "NY"), us("extraction", "NJ")]]]);
    const pick = findBestMarketCandidate(
      "US",
      "NY",
      "extraction",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      { extractionHeadroomOf: () => 0 }
    );
    expect(pick).toBeNull();
  });

  it("state ratio falls back to country ratio where no state price exists", () => {
    // NY has no state price for the manufactured outputs; the country ratio says
    // shortage. PA has an explicit at-base state price. NY should inherit the
    // country shortage and beat PA plus its HQ bonus.
    const pool = new Map([["US", [us("manufacturing", "PA"), us("manufacturing", "NY")]]]);
    const pick = findBestMarketCandidate(
      "US",
      "PA",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({ steel: 2.0, vehicles: 2.0, electronics: 2.0, chemicals: 2.0 }),
      false,
      1,
      { statePriceRatioOf: (_c, stateId) => (stateId === "PA" ? 1.0 : null) }
    );
    expect(pick?.stateId).toBe("NY");
  });
});

describe("empty-market coverage treatment", () => {
  it("routes an existing entry slot to a facility-ready uncovered frontier cell", () => {
    const pool = new Map([
      ["US", [us("manufacturing", "TX", 10_000_000), us("manufacturing", "AZ", 100_000)]],
    ]);
    const activeMarketBuckets = new Set(["TX:manufacturing"]);
    const pick = findBestMarketCandidate(
      "US",
      "CA",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      true,
      1,
      { preferEmptyMarkets: true, activeMarketBuckets },
      new Set(["AZ", "TX"])
    );

    expect(pick).toMatchObject({ stateId: "AZ", sectorType: "manufacturing" });
  });

  it("does not redirect into an uncovered cell smaller than one facility", () => {
    const pool = new Map([["US", [us("manufacturing", "TX", 10_000), us("media", "AZ", 20)]]]);
    const pick = findBestMarketCandidate(
      "US",
      "CA",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      true,
      1,
      { preferEmptyMarkets: true, activeMarketBuckets: new Set(["TX:manufacturing"]) },
      new Set(["AZ", "TX"])
    );

    expect(pick).toMatchObject({ stateId: "TX", sectorType: "manufacturing" });
  });

  it("marks a founding active before the next corporation chooses", () => {
    const signals = { preferEmptyMarkets: true, activeMarketBuckets: new Set<string>() };
    markMarketsActive(signals, [us("logistics", "AZ")]);
    expect(signals.activeMarketBuckets).toContain("AZ:logistics");
  });

  it("reports which filter bound when no candidate survives", () => {
    const pool = new Map([
      ["US", [us("manufacturing", "PA", 0), us("manufacturing", "NY", 100_000)]],
    ]);
    const stats = {};
    const pick = findBestMarketCandidate(
      "US",
      "PA",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(["NY:manufacturing"]),
      ratios({}),
      false,
      1,
      undefined,
      undefined,
      stats
    );

    expect(pick).toBeNull();
    expect(stats).toMatchObject({
      occupiedExcluded: 0,
      noRoomExcluded: 1,
      stateControlledExcluded: 1,
      depositExcluded: 0,
    });
  });

  it("counts exclusions without changing the pick", () => {
    const pool = new Map([
      ["US", [us("manufacturing", "PA", 0), us("manufacturing", "NY", 100_000)]],
    ]);
    const stats = {};
    const pick = findBestMarketCandidate(
      "US",
      "PA",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      undefined,
      undefined,
      stats
    );

    expect(pick).toMatchObject({ stateId: "NY", sectorType: "manufacturing" });
    expect(stats).toMatchObject({
      occupiedExcluded: 0,
      noRoomExcluded: 1,
      stateControlledExcluded: 0,
      depositExcluded: 0,
    });
  });
});

describe("physical saturation gate (live turn 250 incident)", () => {
  it("skips a cell whose incumbents the throttle holds at the floor, whatever the price", () => {
    const pool = new Map([
      ["US", [us("logistics", "TN", 10_000_000), us("logistics", "KY", 100_000)]],
    ]);
    const stats = {};
    const pick = findBestMarketCandidate(
      "US",
      "TN",
      "logistics",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      { marketSaturationOf: (cell) => (cell.stateId === "TN" ? 0.1 : null) },
      undefined,
      stats
    );
    expect(pick?.stateId).toBe("KY");
    expect(stats).toMatchObject({ saturatedExcluded: 1 });
  });

  it("finds nothing when every cell is saturated", () => {
    const pool = new Map([["US", [us("logistics", "TN")]]]);
    const pick = findBestMarketCandidate(
      "US",
      "TN",
      "logistics",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      { marketSaturationOf: () => 0.2 }
    );
    expect(pick).toBeNull();
  });
});

describe("founding type discipline (live turn 262)", () => {
  const find = (
    pool: Map<string, MarketCandidate[]>,
    signals?: Parameters<typeof findBestMarketCandidate>[10],
    healthcarePrice = 3
  ) =>
    findBestMarketCandidate(
      "US",
      "NY",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({ healthcare_services: healthcarePrice }),
      false,
      1,
      signals
    );

  it("does not found outside the corp's types on an ordinary slot", () => {
    // Price at base: no critical shortage, so no cross-type founding.
    expect(find(new Map([["US", [us("healthcare", "NY")]]]), undefined, 1)).toBeNull();
  });

  it("crosses types for a critical shortage only with measured unmet demand", () => {
    const pool = new Map([["US", [us("healthcare", "NY")]]]);
    expect(find(pool, { unmetDemandUnitsOf: () => 0 })).toBeNull();
    expect(find(pool, { unmetDemandUnitsOf: () => 500 })?.sectorType).toBe("healthcare");
  });
});

describe("type discipline with the coverage treatment", () => {
  it("an uncovered wrong-type market never hides a covered in-type one", () => {
    const pool = new Map([
      ["US", [us("manufacturing", "TX", 100_000), us("media", "AZ", 100_000)]],
    ]);
    const pick = findBestMarketCandidate(
      "US",
      "TX",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      { preferEmptyMarkets: true, activeMarketBuckets: new Set(["TX:manufacturing"]) }
    );
    expect(pick?.sectorType).toBe("manufacturing");
  });

  it("the room-to-invest check still sees open markets of any type", () => {
    const pool = new Map([["US", [us("media", "AZ", 100_000)]]]);
    const args = [
      "US",
      "TX",
      "manufacturing",
      null,
      new Set<string>(),
      pool,
      new Set<string>(),
      ratios({}),
      false,
      1,
      undefined,
      undefined,
      undefined,
      null,
    ] as const;
    expect(findBestMarketCandidate(...args)).toBeNull();
    expect(findBestMarketCandidate(...args, true)?.sectorType).toBe("media");
  });
});

describe("cross-type founding needs a readable shortage", () => {
  it("an unreadable gap is not a shortage once the signal is wired", () => {
    const pool = new Map([["US", [us("healthcare", "NY")]]]);
    const pick = findBestMarketCandidate(
      "US",
      "NY",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({ healthcare_services: 3 }),
      false,
      1,
      { unmetDemandUnitsOf: () => null }
    );
    expect(pick).toBeNull();
  });
});

describe("essential-shortage valve only where no same-type builder exists", () => {
  const pool = new Map([["US", [us("manufacturing", "PA"), us("logistics", "NY")]]]);
  const pick = (hasSameType: boolean) =>
    findBestMarketCandidate(
      "US",
      "PA",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({ freight: 2 }),
      false,
      1,
      { unmetDemandUnitsOf: () => 500, hasSameTypeNppIn: () => hasSameType }
    );

  it("a manufacturing corp stays in its field when logistics builders exist", () => {
    expect(pick(true)?.sectorType).toBe("manufacturing");
  });

  it("crosses into logistics when no logistics builder exists in the country", () => {
    expect(pick(false)?.sectorType).toBe("logistics");
  });
});

describe("candidate ranking is memoized, not re-derived per comparison", () => {
  // The reference ranking recomputes a candidate's score on every comparison,
  // which is what the scan did before: market size times the state's shortage
  // score, with the HQ bonus. The memoized scan must land on the same pick.
  const referencePick = (candidates: MarketCandidate[], hqState: string) => {
    const scoreOf = (candidate: MarketCandidate) => {
      const shortage = sectorShortageScore(candidate.sectorType, "US", (commodity) =>
        candidate.stateId === "NY" ? (commodity === "freight" ? 2 : 1.4) : 1
      );
      return (
        roomOf(candidate) * shortage * (candidate.stateId === hqState ? HQ_STATE_SCORE_BONUS : 1)
      );
    };
    return [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  };

  it("picks the candidate with the highest market-weighted shortage score", () => {
    const candidates = [
      us("logistics", "PA", 90_000),
      us("logistics", "NY", 100_000),
      us("logistics", "TX", 60_000),
      us("logistics", "OH", 120_000),
    ];
    const pool = new Map([["US", candidates]]);
    const pick = findBestMarketCandidate(
      "US",
      "PA",
      "logistics",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      {
        statePriceRatioOf: (commodity, stateId) =>
          stateId === "NY" ? (commodity === "freight" ? 2 : 1.4) : 1,
      }
    );

    expect(pick).toEqual(referencePick(candidates, "PA"));
    // The starved small market beats the big base-priced one.
    expect(pick?.stateId).toBe("NY");
  });

  it("reads each candidate's state prices once, however many tiers rank it", () => {
    const candidates = Array.from({ length: 24 }, (_, index) =>
      us("logistics", `S${index}`, 10_000 + index * 1_000)
    );
    const pool = new Map([["US", candidates]]);
    const lookups = new Map<string, number>();
    findBestMarketCandidate(
      "US",
      "PA",
      "logistics",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      {
        statePriceRatioOf: (commodity, stateId) => {
          const key = `${stateId}:${commodity}`;
          lookups.set(key, (lookups.get(key) ?? 0) + 1);
          return 1 + (Number(stateId.slice(1)) % 3) * 0.25;
        },
      }
    );

    // Before the memo the sort alone re-read a candidate's prices on every
    // comparison, so a state appeared dozens of times. One per commodity is
    // what a single score pass costs.
    expect(Math.max(...lookups.values())).toBeLessThanOrEqual(2);
  });
});

describe("input-aware founding candidacy", () => {
  it("skips a cell whose inputs the state cannot deliver and takes the next one", () => {
    const pool = new Map([
      ["US", [us("manufacturing", "WI", 10_000_000), us("manufacturing", "OH", 100_000)]],
    ]);
    const stats = {};
    const pick = findBestMarketCandidate(
      "US",
      "WI",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      { foundingInputAvailabilityOf: (c) => (c.stateId === "WI" ? 0.3 : 0.9) },
      undefined,
      stats
    );
    expect(pick?.stateId).toBe("OH");
    expect(stats).toMatchObject({ inputStarvedExcluded: 1 });
  });

  it("a missing reading never blocks", () => {
    const pool = new Map([["US", [us("manufacturing", "WI")]]]);
    const pick = findBestMarketCandidate(
      "US",
      "WI",
      "manufacturing",
      null,
      new Set(),
      pool,
      new Set(),
      ratios({}),
      false,
      1,
      { foundingInputAvailabilityOf: () => null }
    );
    expect(pick?.stateId).toBe("WI");
  });
});

describe("hasEnterableHeadroom without stored markets", () => {
  const corp = {
    countryId: "US",
    headquartersState: "PA",
    type: "manufacturing",
    secondaryType: null,
  } as never;

  it("is false when the country lists no candidate bucket", () => {
    expect(hasEnterableHeadroom(corp, [], new Map(), new Set(), true, 1)).toBe(false);
  });

  it("is true when a candidate bucket still has unmet demand", () => {
    const pool = new Map([["US", [us("manufacturing", "NY", 5_000)]]]);
    expect(hasEnterableHeadroom(corp, [], pool, new Set(), true, 1, withCandidateRoom())).toBe(
      true
    );
  });

  it("is false when every candidate reads no unmet demand", () => {
    const pool = new Map([["US", [us("manufacturing", "NY", 0)]]]);
    expect(hasEnterableHeadroom(corp, [], pool, new Set(), true, 1, withCandidateRoom())).toBe(
      false
    );
  });
});
