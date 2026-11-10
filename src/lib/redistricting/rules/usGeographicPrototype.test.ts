import { describe, expect, it, vi } from "vitest";
import {
  allocatePrototypeBallots,
  apportionPrototype,
  blendPrototypeEvidence,
  countPrototypeDistricts,
  changePrototypeEffects,
  dispatchPrototype,
  PROTOTYPE_VERSION,
  selectPrototype,
  transferPrototype,
  type PrototypeBinding,
} from "./usGeographicPrototype";
import { allocateSeats } from "@/lib/turn/election/seatAllocation";
import { countPrStv } from "@/lib/turn/election/rules/prStv";
import { countJapanMixedShugiin } from "@/lib/countries/jp/rules/mixedShugiinCount";
import { JP_SHUGIIN_1994_CONSTITUENCIES } from "@/lib/countries/jp/data/jpShugiinConstituencies1994";
import { JP_SHUGIIN_1994_LIST_SEATS } from "@/lib/countries/jp/rules/shugiinElectoralLaw";

const binding = {
  countryId: "US",
  electionType: "house",
  rulesVersion: PROTOTYPE_VERSION,
  planId: "US-test",
};
const spots = [
  { id: "a", countyId: "county", districtId: "one", ballots: 111, lean: -25 },
  { id: "b", countyId: "county", districtId: "two", ballots: 77, lean: 10 },
  { id: "c", countyId: "other", districtId: "two", ballots: 13, lean: 40 },
];
const parties = [
  { id: "left", position: -1, votes: 101 },
  { id: "right", position: 1, votes: 100 },
];
const input = {
  binding,
  dataPlanId: binding.planId,
  spots,
  parties,
  strength: 1,
  adapter: "continuous" as const,
};

describe("offline US geographic ballot experiment", () => {
  it("reconstructs observed two-party support when fed its original statewide counts", () => {
    const local = [
      { ...spots[0], ballots: 100, lean: -25 },
      { ...spots[1], ballots: 100, lean: 25 },
    ];
    const result = allocatePrototypeBallots({
      ...input,
      spots: local,
      parties: [
        { ...parties[0], votes: 100 },
        { ...parties[1], votes: 100 },
      ],
    });
    expect(result.ballots).toEqual([
      [75, 25],
      [25, 75],
    ]);
  });
  it("preserves integer row and party margins across fragmented fields and skewed turnout", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const local = spots.map((s, i) => ({
        ...s,
        ballots: (seed * (i + 11)) % 97,
        lean: ((seed * (i + 3)) % 101) - 50,
      }));
      const total = local.reduce((s, r) => s + r.ballots, 0);
      const votes = apportionPrototype(total, [seed % 5, 3, 7, seed % 3]);
      const result = allocatePrototypeBallots({
        ...input,
        spots: local,
        strength: seed % 4,
        parties: votes.map((v, i) => ({ id: String(i), position: i - 1, votes: v })),
      });
      expect(result.ballots.map((r) => r.reduce((s, v) => s + v, 0))).toEqual(
        result.spots.map((s) => s.ballots)
      );
      expect(result.parties.map((_, j) => result.ballots.reduce((s, r) => s + r[j], 0))).toEqual(
        votes
      );
      expect(result.ballots.flat().every((v) => Number.isSafeInteger(v) && v >= 0)).toBe(true);
    }
  });
  it("does not depend on caller ordering or mutate inputs", () => {
    const before = structuredClone(input);
    const a = allocatePrototypeBallots(input);
    const b = allocatePrototypeBallots({
      ...input,
      spots: [...spots].reverse(),
      parties: [...parties].reverse(),
    });
    expect(b).toEqual(a);
    expect(input).toEqual(before);
  });
  it("rejects mismatched totals, invalid weights and duplicate identities", () => {
    expect(() => allocatePrototypeBallots({ ...input, dataPlanId: "US-other" })).toThrow("plan");
    expect(() =>
      allocatePrototypeBallots({ ...input, parties: [{ ...parties[0], votes: 1 }] })
    ).toThrow("margins");
    expect(() => allocatePrototypeBallots({ ...input, spots: [...spots, spots[0]] })).toThrow(
      "identity"
    );
    expect(() => allocatePrototypeBallots({ ...input, strength: NaN })).toThrow();
    expect(() =>
      allocatePrototypeBallots({ ...input, spots: [{ ...spots[0], ballots: -1 }] })
    ).toThrow();
  });
  it("leaves zero-ballot districts unresolved and never lexically awards ties", () => {
    expect(countPrototypeDistricts(spots.slice(0, 1), [[0, 0]], ["a", "b"])[0].winner).toBeNull();
    expect(countPrototypeDistricts(spots.slice(0, 1), [[10, 10]], ["a", "b"])[0].winner).toBeNull();
    const zero = allocatePrototypeBallots({
      ...input,
      spots: spots.map((s) => ({ ...s, ballots: 0 })),
      parties: parties.map((p) => ({ ...p, votes: 0 })),
    });
    expect(zero.ballots.flat().every((v) => v === 0)).toBe(true);
  });
  it("exposes legitimate uniform-geography sweeps instead of imposing quotas", () => {
    const local = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      countyId: "x",
      districtId: String(i),
      ballots: 1000,
      lean: 0,
    }));
    const result = allocatePrototypeBallots({
      ...input,
      spots: local,
      parties: [
        { id: "grey", position: 0, votes: 4000 },
        { id: "left", position: -1, votes: 3000 },
        { id: "right", position: 1, votes: 3000 },
      ],
    });
    expect(
      countPrototypeDistricts(
        result.spots,
        result.ballots,
        result.parties.map((p) => p.id)
      ).every((d) => d.winner === "grey")
    ).toBe(true);
  });
  it("continuous positions differentiate parties inside the categorical grey band", () => {
    const localParties = parties.map((p) => ({ ...p, position: p.position / 2 }));
    const pooled = allocatePrototypeBallots({ ...input, parties: localParties, adapter: "pool" });
    const continuous = allocatePrototypeBallots({ ...input, parties: localParties });
    expect(continuous.ballots).not.toEqual(pooled.ballots);
  });
});

describe("simultaneous future-batch effects", () => {
  it("shares county and district caps, discounts split counties, and cancels opposite actions", () => {
    const action = {
      spots,
      effects: {},
      actorParty: "left",
      targetParty: "right",
      kind: "boost" as const,
      points: 0.4,
      cap: 3,
      countyFactor: 0.6,
    };
    const county = changePrototypeEffects({ ...action, target: { countyId: "county" } });
    expect(county).toEqual({ a: { right: 0.24 }, b: { right: 0.24 } });
    const district = changePrototypeEffects({
      ...action,
      effects: county,
      target: { districtId: "two" },
    });
    expect(district.b.right).toBeCloseTo(0.64);
    expect(district.c.right).toBeCloseTo(0.4);
    expect(county.b.right).toBe(0.24);
    const capped = changePrototypeEffects({
      ...action,
      effects: district,
      points: 100,
      target: { districtId: "two" },
    });
    expect(capped.b.right).toBe(3);
    const canceled = changePrototypeEffects({
      ...action,
      effects: capped,
      points: 3,
      kind: "attack",
      target: { districtId: "two" },
    });
    expect(canceled.b.right).toBe(0);
    expect(() =>
      changePrototypeEffects({
        ...action,
        targetParty: "left",
        kind: "attack",
        target: { countyId: "county" },
      })
    ).toThrow();
  });
  it("conserves votes and caps actual gains and losses under coordinated actions", () => {
    for (let i = 0; i < 60; i++) {
      const base = [i * 17, 1000, 500, i % 3 ? 0 : 50];
      const next = transferPrototype(base, [100, -100, i % 2 ? 100 : -100, 100]);
      const total = base.reduce((s, v) => s + v, 0);
      expect(next.reduce((s, v) => s + v, 0)).toBe(total);
      expect(
        next.every(
          (v, j) => Number.isSafeInteger(v) && v >= 0 && Math.abs(v - base[j]) <= total * 0.03 + 1
        )
      ).toBe(true);
    }
  });
  it("does not change an earlier batch, including when later effects expire", () => {
    const early = [510, 490];
    const late = transferPrototype([510, 490], [0, 3]);
    expect(early).toEqual([510, 490]);
    expect(late).toEqual([480, 520]);
    expect(transferPrototype([510, 490], [0, 0])).toEqual(early);
  });
  it("handles canceled effects and zero turnout; eligible zero-support parties can gain", () => {
    expect(transferPrototype([300, 700], [0, 0])).toEqual([300, 700]);
    expect(transferPrototype([0, 0], [3, -3])).toEqual([0, 0]);
    expect(transferPrototype([1000, 0], [-3, 3])).toEqual([970, 30]);
    expect(transferPrototype([1000], [-3])).toEqual([1000]);
    expect(() => transferPrototype([10, 0], [NaN, 0])).toThrow();
  });
});

describe("provisional evidence blending", () => {
  const rows = [
    { id: "a", baselineShare: 0.4, observedShare: 0.3, weight: 100 },
    { id: "b", baselineShare: 0.6, observedShare: 0.5, weight: 100 },
    { id: "missing", baselineShare: 0.8, observedShare: null, weight: 200 },
  ];
  it("removes a uniform election wave and preserves missing observations", () => {
    const result = blendPrototypeEvidence(rows, 0.25);
    expect(result.wavePoints).toBeCloseTo(-10);
    result.rows.forEach((r) => expect(r.blendedShare).toBeCloseTo(r.baselineShare));
  });
  it("clips outliers before weighting and never treats missing evidence as zero", () => {
    const result = blendPrototypeEvidence(
      [{ ...rows[0], observedShare: 1 }, rows[1], rows[2]],
      0.25
    );
    result.rows.forEach((r) =>
      expect(Math.abs(r.blendedShare - r.baselineShare)).toBeLessThanOrEqual(0.025000001)
    );
    expect(result.rows[2].blendedShare).toBe(0.8);
    expect(() => blendPrototypeEvidence(rows, 2)).toThrow();
  });
});

describe("prototype host country isolation (not production integration)", () => {
  const legacyCases = [
    ["US", "house", 5],
    ["US", "president", 1],
    ["US", "senate", 1],
    ["US", "governor", 1],
    ["US", "stateSenate", 1],
    ["UK", "commons", 5],
    ["UK", "snap_commons", 5],
    ["UK", "special_commons", 1],
    ["IE", "dail", 5],
    ["IE", "localCouncil", 5],
    ["JP", "shugiin", 5],
    ["JP", "snap_shugiin", 5],
    ["DE", "bundestag", 5],
  ] as const;
  it.each(legacyCases)(
    "preserves existing %s %s allocator output without loading spots",
    (countryId, electionType, seats) => {
      const legacy = () =>
        allocateSeats(
          electionType,
          "fixture",
          seats,
          [
            { id: "a", votes: 600, party: "A" },
            { id: "b", votes: 400, party: "B" },
          ],
          1000,
          undefined,
          undefined,
          undefined,
          countryId,
          "pr_hareQuota"
        );
      const prototype = vi.fn(() => {
        throw new Error("Unexpected geographic read");
      });
      // US rollout intent does not bind any existing/non-US race.
      for (const gate of [false, true]) {
        const race: PrototypeBinding = {
          countryId,
          electionType,
          planId: gate ? "US-test" : undefined,
        };
        expect(dispatchPrototype(race, legacy, prototype)).toEqual(legacy());
      }
      expect(prototype).not.toHaveBeenCalled();
    }
  );
  it("preserves an actual ranked Irish count through its existing callback", () => {
    const legacy = () =>
      countPrStv(["a", "b", "c"], 2, [
        { weight: 60, preferences: ["a", "b", "c"] },
        { weight: 40, preferences: ["c", "b", "a"] },
      ]);
    const prototype = vi.fn(legacy);
    expect(dispatchPrototype({ countryId: "IE", electionType: "dail" }, legacy, prototype)).toEqual(
      legacy()
    );
    expect(prototype).not.toHaveBeenCalled();
  });
  it("preserves Japan's actual separate district/list count without US geographic reads", () => {
    const ballots = {
      districtVotes: Object.fromEntries(
        JP_SHUGIIN_1994_CONSTITUENCIES.map((d) => [
          d.id,
          [{ candidateId: d.id, partyId: "A", votes: 100 }],
        ])
      ),
      listVotesByRegion: Object.fromEntries(
        Object.keys(JP_SHUGIIN_1994_LIST_SEATS).map((id) => [id, { A: 100 }])
      ),
      regionalLists: Object.fromEntries(
        Object.entries(JP_SHUGIIN_1994_LIST_SEATS).map(([id, seats]) => [
          id,
          Array.from({ length: seats }, (_, i) => ({
            candidateId: `${id}-list-${i}`,
            partyId: "A",
            listOrder: i + 1,
          })),
        ])
      ),
    };
    const legacy = () => countJapanMixedShugiin(ballots);
    const prototype = vi.fn(legacy);
    const result = dispatchPrototype(
      { countryId: "JP", electionType: "shugiin" },
      legacy,
      prototype
    );
    expect(result).toEqual(legacy());
    expect(Object.values(result.seatsByCandidate).reduce((a, b) => a + b, 0)).toBe(500);
    expect(prototype).not.toHaveBeenCalled();
  });
  it.each([undefined, "UK", "IE", "JP", "DE"])(
    "rejects a US binding with country %s",
    (countryId) => {
      expect(() => selectPrototype({ ...binding, countryId })).toThrow("binding");
    }
  );
  it("rejects unsupported offices, foreign plans and versions; honors already-bound US races", () => {
    for (const electionType of ["senate", "president", "commons", "governor"])
      expect(() => selectPrototype({ ...binding, electionType })).toThrow();
    expect(() => selectPrototype({ ...binding, planId: "UK-test" })).toThrow();
    expect(() => selectPrototype({ ...binding, rulesVersion: "unknown" })).toThrow();
    expect(
      dispatchPrototype(
        binding,
        () => "legacy",
        () => "prototype"
      )
    ).toBe("prototype");
  });
});
