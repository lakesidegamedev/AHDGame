import { describe, expect, it } from "vitest";
import type { State, StateDemographics } from "@/lib/db/types";
import type { EnrichedCandidate } from "@/lib/electionEngine/types";
import { buildNationalSubstrate } from "@/lib/electionEngine/nationwideElectorate";
import type { GranularElectorateUnit, GranularSubstrate } from "./granularElectorate";
import { mergeRegionalSubstrates } from "./nationalElectorate";

const national: StateDemographics = {
  _id: "IE",
  countryId: "IE",
  categoryWeights: {},
  groups: {},
  lastUpdated: new Date(0),
};

function candidate(extra: Partial<EnrichedCandidate> = {}): EnrichedCandidate {
  return {
    candidateId: "a",
    characterId: "a",
    characterName: "Synthetic",
    party: "1",
    isNPP: false,
    charEP: 0,
    charSP: 0,
    favorability: 50,
    politicalInfluence: 50,
    nationalInfluence: 50,
    ...extra,
  };
}

function unit(
  id: string,
  share: number,
  economicLean: number,
  socialLean: number,
  turnout: number,
  bucketWeights: Record<string, number> = {}
): GranularElectorateUnit {
  return { id, share, economicLean, socialLean, turnout, bucketWeights };
}

function substrate(
  units: GranularElectorateUnit[],
  pool: number,
  enriched: EnrichedCandidate[] = [candidate()],
  favorability?: Map<string, number>
): GranularSubstrate {
  return {
    electorate: units.map((u) => ({
      id: u.id,
      populationPct: u.share * 100,
      economicLean: u.economicLean,
      socialLean: u.socialLean,
      turnout: u.turnout,
    })),
    demographics: {
      ...national,
      groups: Object.fromEntries(
        units.map((u) => [
          u.id,
          {
            population: u.share * 100,
            economicLean: u.economicLean,
            socialLean: u.socialLean,
            turnout: u.turnout,
          },
        ])
      ),
    },
    categories: [],
    liveTurnouts: Object.fromEntries(units.map((u) => [u.id, u.turnout])),
    totalPool: pool,
    enriched,
    ...(favorability ? { partyGroupFavorabilityByKey: favorability } : {}),
    units,
  };
}

describe("mergeRegionalSubstrates", () => {
  it("returns null with no regions or no electorate", () => {
    expect(mergeRegionalSubstrates([], national)).toBeNull();
    expect(
      mergeRegionalSubstrates(
        [{ regionId: "A", electorate: 0, substrate: substrate([unit("u", 1, 0, 0, 50)], 0) }],
        national
      )
    ).toBeNull();
  });

  it("weights unit shares by regional electorate and sums the pool", () => {
    const merged = mergeRegionalSubstrates(
      [
        { regionId: "A", electorate: 3000, substrate: substrate([unit("u0", 1, -2, 1, 60)], 1800) },
        { regionId: "B", electorate: 1000, substrate: substrate([unit("u0", 1, 2, -1, 40)], 400) },
      ],
      national
    )!;
    expect(merged.totalPool).toBe(2200);
    expect(merged.units.reduce((sum, u) => sum + u.share, 0)).toBeCloseTo(1, 10);
    const a = merged.units.find((u) => u.economicLean === -2)!;
    const b = merged.units.find((u) => u.economicLean === 2)!;
    expect(a.share).toBeCloseTo(0.75, 10);
    expect(b.share).toBeCloseTo(0.25, 10);
    expect(merged.demographics.groups[a.id].population).toBeCloseTo(75, 10);
    expect(merged.liveTurnouts[b.id]).toBe(40);
  });

  it("coalesces regional units with the same quantized position", () => {
    const merged = mergeRegionalSubstrates(
      [
        {
          regionId: "A",
          electorate: 1000,
          substrate: substrate([unit("u0", 1, 1.0, 1.0, 50, { "age:young": 1 })], 500),
        },
        {
          regionId: "B",
          electorate: 3000,
          substrate: substrate([unit("u7", 1, 1.1, 0.9, 52, { "age:old": 1 })], 1500),
        },
      ],
      national
    )!;
    expect(merged.units).toHaveLength(1);
    const [only] = merged.units;
    expect(only.share).toBeCloseTo(1, 10);
    expect(only.economicLean).toBeCloseTo(1.075, 10);
    expect(only.turnout).toBeCloseTo(51.5, 10);
    expect(only.bucketWeights["age:young"]).toBeCloseTo(0.25, 10);
    expect(only.bucketWeights["age:old"]).toBeCloseTo(0.75, 10);
  });

  it("carries bucket approvals, ad bonuses and favorability as share-weighted means", () => {
    const withMaps = (approval: number, bonus: number) => [
      candidate({ bucketApprovals: { u0: approval }, targetedAdBonuses: { u0: bonus } }),
    ];
    const merged = mergeRegionalSubstrates(
      [
        {
          regionId: "A",
          electorate: 1000,
          substrate: substrate(
            [unit("u0", 1, 1, 1, 50)],
            500,
            withMaps(10, 4),
            new Map([["p1:u0", 6]])
          ),
        },
        {
          regionId: "B",
          electorate: 3000,
          substrate: substrate(
            [unit("u0", 1, 1, 1, 50)],
            1500,
            withMaps(2, 0),
            new Map([["p1:u0", 2]])
          ),
        },
      ],
      national
    )!;
    const [only] = merged.units;
    expect(merged.enriched[0].bucketApprovals?.[only.id]).toBeCloseTo(4, 10);
    expect(merged.enriched[0].targetedAdBonuses?.[only.id]).toBeCloseTo(1, 10);
    expect(merged.partyGroupFavorabilityByKey?.get(`p1:${only.id}`)).toBeCloseTo(3, 10);
  });

  it("leaves candidate maps absent when no region carried any", () => {
    const merged = mergeRegionalSubstrates(
      [{ regionId: "A", electorate: 1, substrate: substrate([unit("u0", 1, 0, 0, 50)], 1) }],
      national
    )!;
    expect(merged.enriched[0].bucketApprovals).toBeUndefined();
    expect(merged.partyGroupFavorabilityByKey).toBeUndefined();
  });
});

describe("buildNationalSubstrate", () => {
  const region = (id: string, population: number): State =>
    ({
      _id: id,
      countryId: "IE",
      name: id,
      population,
      votingEligiblePopulation: population,
      gdp: 0,
      houseDistricts: 0,
      stateSenateSeats: 0,
      region: "Synthetic",
    }) as State;
  const demographicsFor = (id: string): StateDemographics => ({
    _id: id,
    countryId: "IE",
    categoryWeights: {},
    groups: {},
    lastUpdated: new Date(0),
  });
  const base = (stateMap: Map<string, State>, demographicsMap: Map<string, StateDemographics>) => ({
    countryId: "IE" as const,
    nationalDemographics: national,
    stateMap,
    demographicsMap,
    turnoutByState: new Map(),
    election: { campaignRulesVersion: 1 },
    currentTurn: 10,
    preset: "2019-default",
    enriched: [candidate()],
  });

  it("builds a finite national electorate from regional census cells", () => {
    const stateMap = new Map([
      ["DUB", region("DUB", 1_000_000)],
      ["COR", region("COR", 3_000_000)],
    ]);
    const demographicsMap = new Map([
      ["DUB", demographicsFor("DUB")],
      ["COR", demographicsFor("COR")],
    ]);
    const merged = buildNationalSubstrate(base(stateMap, demographicsMap));
    expect(merged.units.length).toBeGreaterThan(0);
    expect(merged.units.reduce((sum, u) => sum + u.share, 0)).toBeCloseTo(1, 6);
    expect(Number.isFinite(merged.totalPool)).toBe(true);
    expect(merged.totalPool).toBeGreaterThan(0);
    expect(merged.totalPool).toBeLessThanOrEqual(4_000_000);
    expect(Object.keys(merged.demographics.groups).length).toBe(merged.units.length);
  });

  it("errors when a region has no demographics row", () => {
    const stateMap = new Map([["DUB", region("DUB", 1_000_000)]]);
    expect(() => buildNationalSubstrate(base(stateMap, new Map()))).toThrow(
      "No census electorate for IE region DUB"
    );
  });

  it("errors when a region has no census cells", () => {
    const stateMap = new Map([["NOWHERE", region("NOWHERE", 1_000_000)]]);
    const demographicsMap = new Map([["NOWHERE", demographicsFor("NOWHERE")]]);
    expect(() => buildNationalSubstrate(base(stateMap, demographicsMap))).toThrow(
      "No census electorate for IE region NOWHERE"
    );
  });

  it("errors when the country has no regions", () => {
    expect(() => buildNationalSubstrate(base(new Map(), new Map()))).toThrow("No regions for IE");
  });
});
