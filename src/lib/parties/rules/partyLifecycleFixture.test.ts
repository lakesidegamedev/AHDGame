import { describe, expect, it } from "vitest";
import {
  electorateCentre,
  capIncumbentSeatShares,
  ideologyAnchors,
  ideologyGaps,
  planPartyRenewal,
  type RenewalCycleSnapshot,
  type RenewalNpp,
  type RenewalParty,
} from "./partyRenewal";
import {
  leaderRetirementChancePerTurn,
  nppAgeAtYear,
  nppDiesThisTurn,
} from "@/lib/npp/rules/mortality";
import { NPP_TURNOVER_CONFIG as CONFIG } from "@/lib/npp/turnoverData";

const TURNS_PER_YEAR = 48;
const CYCLE_YEARS = 2;
const SEATS = 200;
const START_YEAR = 2027;

const voters = [
  { economic: 1, social: 1, weight: 30 },
  { economic: 2, social: 1, weight: 20 },
  { economic: 0, social: 0, weight: 20 },
  { economic: 2.5, social: 2.5, weight: 15 },
  { economic: -2, social: -1, weight: 15 },
];

const party = (id: string, economic: number, social: number, name: string): RenewalParty => ({
  partyId: id,
  economic,
  social,
  name,
  abbreviation: `P${id}`,
  color: "#000000",
  renewable: true,
});

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

function elect(parties: RenewalParty[], priorSeats: Map<string, number>) {
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
  const won = new Map(parties.map((p) => [p.partyId, 0]));
  for (let s = 0; s < SEATS; s++) {
    const best = parties
      .map((p) => ({ id: p.partyId, q: votes.get(p.partyId)! / (won.get(p.partyId)! + 1) }))
      .sort((a, b) => b.q - a.q || a.id.localeCompare(b.id))[0];
    won.set(best.id, won.get(best.id)! + 1);
  }
  return { votes, seats: new Map([...won].map(([k, n]) => [k, n / SEATS])) };
}

interface Leader {
  nppId: string;
  birthYear: number;
}

/**
 * One fixture across several election cycles: the dominant party's elderly
 * leader retires or dies and is replaced from its bench, while the party
 * splinters and a new party takes the field, and every party's seat share stays
 * within reach of its vote share throughout.
 */
describe("party lifecycle fixture", () => {
  it("replaces a leader and splits a party while seats track votes", () => {
    const rng = seededRng(7);
    let parties = [
      party("1", 1.5, 1.2, "National Unity Party"),
      party("2", -2, -1, "Labour Party"),
    ];
    const bench = new Map<string, RenewalNpp[]>([
      [
        "1",
        Array.from({ length: 16 }, (_, i) => ({
          nppId: `n${String(i).padStart(2, "0")}`,
          homeState: i % 2 === 0 ? "R1" : "R2",
          economic: 0.5 + i * 0.25,
          social: 1.2,
          protected: false,
        })),
      ],
    ]);
    const bench1 = bench.get("1")!;
    let leader: Leader = { nppId: "leader-0", birthYear: START_YEAR - 84 };
    const leaderHistory: Array<{ cycle: number; cause: "death" | "retirement"; nppId: string }> =
      [];
    let priorSeats = new Map<string, number>();
    let previous: RenewalCycleSnapshot | null = null;
    let splinteredAt: number | null = null;
    let nextPartyId = 3;
    let successorsSeated = 0;

    for (let cycle = 1; cycle <= 8; cycle++) {
      const year0 = START_YEAR + (cycle - 1) * CYCLE_YEARS;
      // The party leader faces the death and retirement rolls every turn.
      for (let turn = 0; turn < CYCLE_YEARS * TURNS_PER_YEAR; turn++) {
        const year = year0 + Math.floor(turn / TURNS_PER_YEAR);
        const age = nppAgeAtYear(leader, year)!;
        const dies = nppDiesThisTurn(age, rng, TURNS_PER_YEAR, CONFIG.death);
        const retires =
          !dies &&
          rng() <
            leaderRetirementChancePerTurn(
              age,
              null,
              TURNS_PER_YEAR,
              CONFIG.retirement,
              CONFIG.leaders
            );
        if (dies || retires) {
          leaderHistory.push({ cycle, cause: dies ? "death" : "retirement", nppId: leader.nppId });
          const successor = bench1.shift();
          if (successor) {
            leader = { nppId: successor.nppId, birthYear: year - 52 };
            successorsSeated++;
          }
        }
      }

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
          const moved = new Set(plan.splinter.nppIds);
          bench.set(
            "1",
            bench.get("1")!.filter((n) => !moved.has(n.nppId))
          );
          parties = [
            ...parties,
            party(
              String(nextPartyId++),
              plan.splinter.position.economic,
              plan.splinter.position.social,
              plan.splinter.name
            ),
          ];
        }
        const folded = new Set(plan.folds.map((f) => f.partyId));
        parties = parties.filter((p) => !folded.has(p.partyId));
      }
      priorSeats = seats;
      previous = latest;
    }

    expect(leaderHistory.length).toBeGreaterThanOrEqual(1);
    expect(successorsSeated).toBe(leaderHistory.length);
    expect(leader.nppId).not.toBe("leader-0");
    expect(splinteredAt).not.toBeNull();
    expect(parties.length).toBeGreaterThanOrEqual(3);
    const final = elect(parties, priorSeats);
    for (const p of parties) {
      expect(
        Math.abs((final.seats.get(p.partyId) ?? 0) - (final.votes.get(p.partyId) ?? 0))
      ).toBeLessThan(0.05);
    }
  });
});
