import { describe, expect, it } from "vitest";
import {
  FOLD_VOTE_SHARE,
  RATCHET_SEAT_SHARE_CAP,
  capIncumbentSeatShares,
  chamberSeatShares,
  electorateCentre,
  foundingPartyName,
  ideologyAnchors,
  ideologyGaps,
  nationalVoteShares,
  pickSplinterNpps,
  planFolds,
  planPartyRenewal,
  recordHeldRegions,
  reentryRegions,
  renewalAbbreviation,
  renewalNewsPost,
  splinterConditions,
  splinterPartyName,
  splinterPosition,
  type RenewalCycleSnapshot,
  type RenewalNpp,
  type RenewalParty,
} from "./partyRenewal";

const party = (
  partyId: string,
  economic: number,
  social: number,
  extra: Partial<RenewalParty> = {}
): RenewalParty => ({
  partyId,
  economic,
  social,
  name: `Party ${partyId}`,
  abbreviation: `P${partyId}`,
  color: "#000000",
  renewable: true,
  ...extra,
});

const snap = (
  cycle: number,
  results: Record<string, [vote: number, seat: number]>,
  extra: Partial<RenewalCycleSnapshot> = {}
): RenewalCycleSnapshot => ({
  cycle,
  governingPartyId: null,
  approval: null,
  parties: Object.entries(results).map(([partyId, [voteShare, seatShare]]) => ({
    partyId,
    voteShare,
    seatShare,
  })),
  gaps: [],
  ...extra,
});

const npps = (count: number, economic = 0, social = 0): RenewalNpp[] =>
  Array.from({ length: count }, (_, i) => ({
    nppId: `n${String(i).padStart(2, "0")}`,
    homeState: i % 2 === 0 ? "R1" : "R2",
    economic: economic + i * 0.25,
    social,
    protected: false,
  }));

const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("shares", () => {
  it("aggregates national vote share across every race of the cycle", () => {
    const shares = nationalVoteShares([
      { totalVotes: { a: 60, b: 40 }, candidateParties: { a: "1", b: "2" } },
      { totalVotes: { c: 30, d: 70 }, candidateParties: { c: "1", d: "2" } },
    ]);
    expect(shares.get("1")).toBeCloseTo(0.45);
    expect(shares.get("2")).toBeCloseTo(0.55);
  });

  it("counts multi-seat officials by seats held, vacant seats in the denominator", () => {
    const shares = chamberSeatShares([{ party: "1", seats: 3 }, { party: "2" }, { party: null }]);
    expect(shares.get("1")).toBeCloseTo(0.6);
    expect(shares.get("2")).toBeCloseTo(0.2);
  });
});

describe("ratchet cap", () => {
  it("stops the seat-share shield growing past half the seats", () => {
    const capped = capIncumbentSeatShares(
      new Map([
        ["1", 0.8],
        ["2", 0.2],
      ])
    );
    expect(capped.get("1")).toBe(RATCHET_SEAT_SHARE_CAP);
    expect(capped.get("2")).toBe(0.2);
  });
});

describe("splinter", () => {
  it("qualifies an unpopular government over two terms", () => {
    const prev = snap(1, { "1": [0.5, 0.5] }, { governingPartyId: "1", approval: 35 });
    const latest = snap(2, { "1": [0.5, 0.5] }, { governingPartyId: "1", approval: 38 });
    expect(splinterConditions(prev, latest, "1")).toEqual({
      unpopularGovernment: true,
      dominantChamber: false,
    });
  });

  it("does not qualify a government popular in either term", () => {
    const prev = snap(1, { "1": [0.5, 0.5] }, { governingPartyId: "1", approval: 45 });
    const latest = snap(2, { "1": [0.5, 0.5] }, { governingPartyId: "1", approval: 30 });
    expect(splinterConditions(prev, latest, "1").unpopularGovernment).toBe(false);
  });

  it("qualifies a party over 55% of the chamber for two terms, not one", () => {
    const prev = snap(1, { "1": [0.5, 0.6] });
    const latest = snap(2, { "1": [0.5, 0.58] });
    expect(splinterConditions(prev, latest, "1").dominantChamber).toBe(true);
    expect(splinterConditions(snap(1, { "1": [0.5, 0.5] }), latest, "1").dominantChamber).toBe(
      false
    );
  });

  it("sits next to the parent on the side with the most room", () => {
    const pos = splinterPosition(party("1", 0, 0), [party("1", 0, 0), party("2", -3, 0)]);
    expect(pos).toEqual({ economic: 1.5, social: 0 });
  });

  it("takes the parent's NPPs nearest the splinter and never protected ones", () => {
    const bench = npps(8);
    bench[7].protected = true;
    const picked = pickSplinterNpps(bench, { economic: 5, social: 0 });
    // Seven movable, a quarter rounded up: the two nearest economic +5.
    expect(picked.map((n) => n.nppId)).toEqual(["n06", "n05"]);
    expect(pickSplinterNpps(npps(3), { economic: 1, social: 0 })).toEqual([]);
  });

  const dominant = {
    previous: snap(1, { "1": [0.62, 0.7], "2": [0.38, 0.3] }),
    latest: snap(2, { "1": [0.6, 0.68], "2": [0.4, 0.32] }),
    parties: [party("1", 1, 1, { name: "Liberal Democratic Party" }), party("2", -2, -1)],
    nppsByParty: new Map([["1", npps(12, 1, 1)]]),
  };

  it("splinters on a winning roll and not on a losing one", () => {
    const plan = planPartyRenewal(dominant, fixed(0.1, 0.99));
    expect(plan.splinter?.parentPartyId).toBe("1");
    expect(plan.splinter?.nppIds).toHaveLength(3);
    expect(plan.splinter?.name).toBe("Liberal Democratic Reform Party");
    expect(plan.splinter?.baseRegions.length).toBeGreaterThan(0);
    expect(planPartyRenewal(dominant, fixed(0.9, 0.99)).splinter).toBeNull();
  });

  it("is deterministic for the same rng", () => {
    expect(planPartyRenewal(dominant, fixed(0.2, 0.3))).toEqual(
      planPartyRenewal(dominant, fixed(0.2, 0.3))
    );
  });

  it("splinters at most one party per cycle, the largest", () => {
    const input = {
      previous: snap(1, { "1": [0.3, 0.6] }, { governingPartyId: "2", approval: 20 }),
      latest: snap(
        2,
        { "1": [0.3, 0.6], "2": [0.3, 0.3] },
        { governingPartyId: "2", approval: 20 }
      ),
      parties: [party("1", 1, 1), party("2", -2, -1)],
      nppsByParty: new Map([
        ["1", npps(8, 1, 1)],
        ["2", npps(8, -2, -1)],
      ]),
    };
    const plan = planPartyRenewal(input, fixed(0.01, 0.99));
    expect(plan.splinter?.parentPartyId).toBe("1");
  });

  it("never splinters a player-created party", () => {
    const plan = planPartyRenewal(
      {
        ...dominant,
        parties: [party("1", 1, 1, { renewable: false }), party("2", -2, -1)],
      },
      fixed(0.01, 0.99)
    );
    expect(plan.splinter).toBeNull();
  });
});

describe("fold", () => {
  const parties = [party("1", 0, 0), party("2", 3, 3), party("3", 2.5, 2), party("4", -3, -3)];

  it("folds a party under 2% in both elections into its nearest neighbour", () => {
    const folds = planFolds(
      snap(1, { "1": [0.5, 0.5], "2": [0.01, 0], "3": [0.3, 0.3], "4": [0.19, 0.2] }),
      snap(2, { "1": [0.5, 0.5], "2": [0.015, 0], "3": [0.3, 0.3], "4": [0.185, 0.2] }),
      parties
    );
    expect(folds).toEqual([{ partyId: "2", targetPartyId: "3" }]);
  });

  it("spares a party under 2% only once, or that did not contest both", () => {
    const latest = snap(2, { "1": [0.5, 0.5], "2": [0.01, 0], "3": [0.3, 0.3], "4": [0.19, 0.2] });
    expect(
      planFolds(snap(1, { "1": [0.5, 0.5], "2": [0.05, 0], "3": [0.3, 0.3] }), latest, parties)
    ).toEqual([]);
    expect(planFolds(snap(1, { "1": [0.5, 0.5], "3": [0.5, 0.5] }), latest, parties)).toEqual([]);
  });

  it("never folds a player-created party or into one, nor below two parties", () => {
    const weak = { "1": [0.99, 1], "2": [0.005, 0], "3": [0.005, 0] } as Record<
      string,
      [number, number]
    >;
    expect(
      planFolds(snap(1, weak), snap(2, weak), [
        party("1", 0, 0),
        party("2", 3, 3, { renewable: false }),
        party("3", 2.5, 2),
      ])
    ).toEqual([{ partyId: "3", targetPartyId: "1" }]);
    expect(
      planFolds(
        snap(1, { "1": [0.99, 1], "2": [0.01, 0] }),
        snap(2, { "1": [0.99, 1], "2": [0.01, 0] }),
        [party("1", 0, 0), party("2", 3, 3)]
      )
    ).toEqual([]);
    expect(FOLD_VOTE_SHARE).toBe(0.02);
  });
});

describe("insurgent founding", () => {
  // Two parties far apart leave the middle of the electorate with no one in reach.
  const parties = [party("1", -3, -2), party("2", 3, 2)];
  const centre = electorateCentre(
    parties,
    new Map([
      ["1", 0.5],
      ["2", 0.5],
    ])
  );
  const gaps = ideologyGaps(ideologyAnchors(centre), parties);

  it("finds the empty middle of a polarised map", () => {
    expect(gaps).toContainEqual({ economic: 0, social: 0 });
  });

  it("finds no gap when a party sits where the voters are", () => {
    const crowded = [party("1", 1, 1), party("2", 1.5, 0.5)];
    const c = electorateCentre(
      crowded,
      new Map([
        ["1", 0.8],
        ["2", 0.2],
      ])
    );
    expect(ideologyGaps(ideologyAnchors(c), crowded)).toEqual([]);
  });

  it("founds only after a gap persists through two elections and the roll succeeds", () => {
    const input = {
      previous: snap(1, { "1": [0.5, 0.5], "2": [0.5, 0.5] }, { gaps }),
      latest: snap(2, { "1": [0.5, 0.5], "2": [0.5, 0.5] }, { gaps }),
      parties,
      nppsByParty: new Map(),
    };
    const plan = planPartyRenewal(input, fixed(0.99, 0.1));
    expect(plan.founding?.position).toEqual({ economic: 0, social: 0 });
    expect(plan.founding!.name).toBe("Centre Party");
    expect(planPartyRenewal(input, fixed(0.99, 0.9)).founding).toBeNull();
    expect(
      planPartyRenewal({ ...input, previous: { ...input.previous, gaps: [] } }, fixed(0.99, 0.1))
        .founding
    ).toBeNull();
  });
});

describe("names", () => {
  it("builds a splinter name from the parent's pattern and avoids taken names", () => {
    expect(splinterPartyName("Social Democratic Party", [])).toBe("Social Democratic Reform Party");
    expect(splinterPartyName("Social Democratic Party", ["Social Democratic Reform Party"])).toBe(
      "New Social Democratic Party"
    );
  });

  it("founds in the country's dominant party noun", () => {
    expect(
      foundingPartyName({ economic: -3, social: 0 }, ["Christian Democratic Union", "Free Union"])
    ).toBe("Social Democratic Union");
  });

  it("makes abbreviations unique", () => {
    expect(renewalAbbreviation("Social Democratic Party", ["SDP"])).toBe("SDP2");
  });
});

describe("frontier re-entry", () => {
  it("keeps a region open for two cycles after the party last held it", () => {
    let held = recordHeldRegions({}, new Map([["1", new Set(["A", "B"])]]), 1);
    held = recordHeldRegions(held, new Map([["1", new Set(["A"])]]), 2);
    expect(reentryRegions(held["1"], 2)).toEqual(["A", "B"]);
    held = recordHeldRegions(held, new Map([["1", new Set(["A"])]]), 3);
    expect(reentryRegions(held["1"], 3)).toEqual(["A"]);
    expect(reentryRegions(undefined, 3)).toEqual([]);
  });
});

/**
 * Multi-cycle fixture: one dominant party, an unpopular government, a toy
 * electorate and proportional seats with the capped incumbency shield. The
 * dominant party splinters within a few cycles and seat shares never drift
 * far from vote shares.
 */
describe("multi-cycle fixture", () => {
  const voters = [
    { economic: 1, social: 1, weight: 30 },
    { economic: 2, social: 1, weight: 20 },
    { economic: 0, social: 0, weight: 20 },
    { economic: 2.5, social: 2.5, weight: 15 },
    { economic: -2, social: -1, weight: 15 },
  ];
  const SEATS = 200;

  function elect(
    parties: RenewalParty[],
    priorSeats: Map<string, number>
  ): { votes: Map<string, number>; seats: Map<string, number> } {
    const shield = capIncumbentSeatShares(priorSeats);
    const raw = new Map<string, number>();
    for (const v of voters) {
      const pulls = parties.map((p) => {
        const d = Math.hypot(p.economic - v.economic, p.social - v.social);
        return (1 / (0.5 + d) ** 2) * (1 + 0.2 * (shield.get(p.partyId) ?? 0));
      });
      const total = pulls.reduce((a, b) => a + b, 0);
      parties.forEach((p, i) =>
        raw.set(p.partyId, (raw.get(p.partyId) ?? 0) + (v.weight * pulls[i]) / total)
      );
    }
    const sum = [...raw.values()].reduce((a, b) => a + b, 0);
    const votes = new Map([...raw].map(([k, x]) => [k, x / sum]));
    // D'Hondt
    const won = new Map(parties.map((p) => [p.partyId, 0]));
    for (let s = 0; s < SEATS; s++) {
      const best = parties
        .map((p) => ({ id: p.partyId, q: votes.get(p.partyId)! / (won.get(p.partyId)! + 1) }))
        .sort((a, b) => b.q - a.q || a.id.localeCompare(b.id))[0];
      won.set(best.id, won.get(best.id)! + 1);
    }
    return { votes, seats: new Map([...won].map(([k, n]) => [k, n / SEATS])) };
  }

  it("splinters the dominant party and keeps seats within reach of votes", () => {
    let parties = [
      party("1", 1.5, 1.2, { name: "National Unity Party" }),
      party("2", -2, -1, { name: "Labour Party" }),
    ];
    const bench = new Map<string, RenewalNpp[]>([["1", npps(16, 0.5, 1.2)]]);
    let priorSeats = new Map<string, number>();
    let previous: RenewalCycleSnapshot | null = null;
    let seed = 7;
    const rng = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    let splinteredAt: number | null = null;
    let next = 3;

    for (let cycle = 1; cycle <= 8; cycle++) {
      const { votes, seats } = elect(parties, priorSeats);
      for (const p of parties) {
        expect(Math.abs((seats.get(p.partyId) ?? 0) - (votes.get(p.partyId) ?? 0))).toBeLessThan(
          0.05
        );
      }
      const latest: RenewalCycleSnapshot = {
        cycle,
        governingPartyId: "1",
        approval: 35,
        parties: parties.map((p) => ({
          partyId: p.partyId,
          voteShare: votes.get(p.partyId) ?? 0,
          seatShare: seats.get(p.partyId) ?? 0,
        })),
        gaps: ideologyGaps(ideologyAnchors(electorateCentre(parties, votes)), parties),
      };
      if (previous) {
        const plan = planPartyRenewal({ previous, latest, parties, nppsByParty: bench }, rng);
        if (plan.splinter && splinteredAt == null) {
          splinteredAt = cycle;
          const id = String(next++);
          parties = [
            ...parties,
            party(id, plan.splinter.position.economic, plan.splinter.position.social, {
              name: plan.splinter.name,
            }),
          ];
          const moved = new Set(plan.splinter.nppIds);
          bench.set(
            "1",
            bench.get("1")!.filter((n) => !moved.has(n.nppId))
          );
        }
        const folded = new Set(plan.folds.map((f) => f.partyId));
        parties = parties.filter((p) => !folded.has(p.partyId));
      }
      priorSeats = seats;
      previous = latest;
    }

    expect(splinteredAt).not.toBeNull();
    expect(parties.length).toBeGreaterThanOrEqual(3);
    const { seats } = elect(parties, priorSeats);
    expect(seats.get("1")!).toBeLessThan(0.55);
  });
});

describe("renewalNewsPost", () => {
  const dash = /[\u2013\u2014]/;

  it("names both parties on a splinter and a fold", () => {
    const splinter = renewalNewsPost({
      kind: "splinter",
      countryName: "Italy",
      partyName: "Reform Movement",
      relatedPartyName: "Centre Union",
    });
    expect(splinter.title).toBe("Reform Movement splits from Centre Union");
    expect(splinter.content).toContain("Italy");
    const fold = renewalNewsPost({
      kind: "fold",
      countryName: "Italy",
      partyName: "Small Party",
      relatedPartyName: "Centre Union",
    });
    expect(fold.title).toBe("Small Party folds into Centre Union");
    expect(fold.content).toContain("joined Centre Union");
  });

  it("announces a founding in its country without dashes", () => {
    const founding = renewalNewsPost({
      kind: "founding",
      countryName: "Spain",
      partyName: "Green Future",
    });
    expect(founding.title).toBe("Green Future founded in Spain");
    for (const post of [founding]) {
      expect(dash.test(post.title + post.content)).toBe(false);
    }
  });
});
