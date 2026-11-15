import { describe, expect, it } from "vitest";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import { BACKGROUND_CONSTITUTIONS } from "./backgroundConstitution";
import {
  advanceNationalPolitics,
  allocateNationalSeats,
  approvalTarget,
  AUSTERITY_APPROVAL_MULTIPLIER,
  austerityPenalty,
  formGovernment,
  initNationalPolitics,
  LEADER_RETIREMENT_AGE,
  runNationalElection,
  SNAP_LOW_APPROVAL_TICKS,
  type NationalPoliticsState,
  type NationalPoliticsTickInput,
  type SeedParty,
} from "./nationalPolitics";

const TPY = 48;
const pool = { firstNames: ["Ana", "Luis", "Marta"], surnames: ["Garcia", "Lopez", "Ruiz"] };
const expectations = { trendGrowth: 0.02, naturalUnemployment: 6 };
const ES = BACKGROUND_CONSTITUTIONS.ES;

const seedParties: SeedParty[] = [
  {
    partyId: "left",
    name: "Workers Party",
    abbreviation: "WP",
    color: "#f00",
    economic: -3,
    social: -2,
    strength: 34,
  },
  {
    partyId: "right",
    name: "People's Party",
    abbreviation: "PP",
    color: "#00f",
    economic: 3,
    social: 2,
    strength: 33,
  },
  {
    partyId: "centre",
    name: "Citizens Party",
    abbreviation: "CP",
    color: "#fa0",
    economic: 0.5,
    social: -1,
    strength: 18,
  },
  {
    partyId: "green",
    name: "Green Party",
    abbreviation: "GP",
    color: "#0a0",
    economic: -2,
    social: -4,
    strength: 15,
  },
];

function start(seed = "s"): NationalPoliticsState {
  const state = initNationalPolitics({
    constitution: ES,
    parties: seedParties,
    turn: 1,
    year: 2027,
    turnsPerYear: TPY,
    output: 1000,
    inflation: 2,
    expectations,
    namePool: pool,
    rng: makeSeededRng(seed),
  });
  if (!state) throw new Error("no state");
  return state;
}

function tick(
  state: NationalPoliticsState,
  overrides: Partial<NationalPoliticsTickInput> = {}
): ReturnType<typeof advanceNationalPolitics> {
  const turn = overrides.turn ?? state.economy.turn + 6;
  return advanceNationalPolitics(state, {
    countryId: "ES",
    constitution: ES,
    turn,
    year: 2027 + Math.floor(turn / TPY),
    turnsPerYear: TPY,
    output: state.economy.output * 1.02 ** (6 / TPY),
    inflation: 2,
    expectations,
    austerity: null,
    namePool: pool,
    rng: makeSeededRng(`tick:${turn}`),
    ...overrides,
  });
}

describe("allocateNationalSeats", () => {
  const shares = [
    { partyId: "a", voteShare: 0.4 },
    { partyId: "b", voteShare: 0.35 },
    { partyId: "c", voteShare: 0.22 },
    { partyId: "d", voteShare: 0.03 },
  ];

  it.each(["pr_hareQuota", "pr_dhondt", "pr_sainteLague", "fptp", "mixed"] as const)(
    "%s fills the chamber exactly",
    (method) => {
      const seats = allocateNationalSeats(shares, { seats: 350, method, threshold: 0.05 });
      expect(Object.values(seats).reduce((a, b) => a + b, 0)).toBe(350);
    }
  );

  it("keeps a party under the legal threshold out of proportional seats", () => {
    const seats = allocateNationalSeats(shares, {
      seats: 350,
      method: "pr_dhondt",
      threshold: 0.05,
    });
    expect(seats.d).toBe(0);
    expect(seats.a).toBeGreaterThan(seats.b);
  });

  it("gives the leader a winner's bonus under single-member districts", () => {
    const seats = allocateNationalSeats(shares, { seats: 577, method: "fptp", threshold: 0 });
    expect(seats.a / 577).toBeGreaterThan(0.4);
    const pr = allocateNationalSeats(shares, { seats: 577, method: "pr_hareQuota", threshold: 0 });
    expect(seats.a).toBeGreaterThan(pr.a);
  });
});

describe("formGovernment", () => {
  it("adds the nearest partners until the coalition holds a majority", () => {
    const state = start();
    const parties = state.parties.map((p) => ({ ...p }));
    const seats: Record<string, number> = { left: 140, right: 130, centre: 45, green: 35 };
    for (const p of parties) p.seats = seats[p.partyId];
    const government = formGovernment(parties, 350);
    expect(government[0]).toBe("left");
    expect(government).toContain("green");
    expect(government.reduce((sum, id) => sum + seats[id], 0) * 2).toBeGreaterThan(350);
  });
});

describe("initNationalPolitics", () => {
  it("seats the chamber, forms a government and names a head of government", () => {
    const state = start();
    expect(state.parties.reduce((sum, p) => sum + p.seats, 0)).toBe(ES.seats);
    expect(state.governmentPartyIds.length).toBeGreaterThan(0);
    expect(state.head.partyId).toBe(state.governmentPartyIds[0]);
    expect(state.head.name.split(" ")).toHaveLength(2);
    // ES votes in 2027: the first election is within the first year.
    expect(state.nextElectionTurn).toBeGreaterThan(1);
    expect(state.nextElectionTurn).toBeLessThanOrEqual(1 + TPY);
    // FR votes in 2029: mid-2029 from January 2027.
    const fr = initNationalPolitics({
      constitution: BACKGROUND_CONSTITUTIONS.FR,
      parties: seedParties,
      turn: 1,
      year: 2027,
      turnsPerYear: TPY,
      output: 1000,
      inflation: 2,
      expectations,
      namePool: pool,
      rng: makeSeededRng("fr"),
    });
    expect(fr?.nextElectionTurn).toBe(1 + 2.5 * TPY);
  });

  it("is deterministic per seed", () => {
    expect(start("same")).toEqual(start("same"));
  });

  it("returns null without parties", () => {
    expect(
      initNationalPolitics({
        constitution: ES,
        parties: [],
        turn: 1,
        year: 2027,
        turnsPerYear: TPY,
        output: 1,
        inflation: 2,
        expectations,
        namePool: pool,
        rng: makeSeededRng("x"),
      })
    ).toBeNull();
  });
});

describe("approval", () => {
  it("rises in a boom and falls in a recession", () => {
    const state = start();
    const boom = tick(state, { output: state.economy.output * 1.02 });
    const bust = tick(state, { output: state.economy.output * 0.98 });
    expect(boom.state.economy.growth).toBeGreaterThan(state.economy.growth);
    expect(boom.state.approval).toBeGreaterThan(bust.state.approval);
    expect(bust.state.approval).toBeLessThan(state.approval);
  });

  it("pays a consolidation package's approval cost at once and holds approval down for a year", () => {
    const state = { ...start(), nextElectionTurn: 10_000 };
    const plain = tick(state, { turn: 7 });
    const austerity = tick(state, { turn: 7, austerity: { approvalCost: 4, turn: 5 } });
    // Full immediate hit, plus the target held down by the fading penalty.
    expect(plain.state.approval - austerity.state.approval).toBeGreaterThan(
      4 * AUSTERITY_APPROVAL_MULTIPLIER
    );
    expect(austerity.state.austerityAppliedTurn).toBe(5);
    // Later ticks do not take the hit again, but approval stays below the plain path.
    let a = austerity.state;
    let p = plain.state;
    for (let turn = 13; turn <= 37; turn += 6) {
      a = tick(a, {
        turn,
        output: a.economy.output,
        austerity: { approvalCost: 4, turn: 5 },
      }).state;
      p = tick(p, { turn, output: p.economy.output }).state;
      expect(a.approval).toBeLessThan(p.approval);
    }
    expect(austerityPenalty(4, 0, TPY)).toBe(4 * AUSTERITY_APPROVAL_MULTIPLIER);
    expect(austerityPenalty(4, TPY, TPY)).toBe(0);
  });

  it("drifts lower the longer a government serves", () => {
    expect(approvalTarget(0, 3)).toBeLessThan(approvalTarget(0, 1));
  });
});

describe("elections", () => {
  const electionInput = (seed: string, year = 2027) => ({
    countryId: "ES",
    constitution: ES,
    turn: 30,
    year,
    turnsPerYear: TPY,
    expectations,
    namePool: pool,
    rng: makeSeededRng(seed),
    snap: false,
  });

  it("resolves with a full chamber and usually keeps a popular government", () => {
    const state = { ...start(), approval: 80, termsServed: 1 };
    const { state: next, events } = runNationalElection(state, electionInput("popular-0"));
    expect(events.some((e) => e.kind === "election")).toBe(true);
    expect(next.parties.filter((p) => p.active).reduce((s, p) => s + p.seats, 0)).toBe(ES.seats);
    expect(next.nextElectionTurn).toBe(30 + ES.termYears * TPY);
    let kept = 0;
    for (let i = 0; i < 20; i++) {
      const result = runNationalElection(state, electionInput(`popular-${i}`)).state;
      if (result.governmentPartyIds[0] === state.governmentPartyIds[0]) {
        kept++;
        expect(result.termsServed).toBe(2);
      }
    }
    expect(kept).toBeGreaterThanOrEqual(15);
  });

  it("usually throws out an unpopular, tired government and names a new head", () => {
    const state = { ...start(), approval: 12, termsServed: 3 };
    let changed = 0;
    for (let i = 0; i < 20; i++) {
      const { state: next, events } = runNationalElection(
        state,
        electionInput(`unpopular-${i}`, 2030)
      );
      // Approval under the protest ceiling lets a protest party in.
      expect(events.some((e) => e.kind === "partyFounded")).toBe(true);
      if (next.lastElection?.governmentChanged) {
        changed++;
        expect(next.termsServed).toBe(1);
        expect(next.head.partyId).toBe(next.governmentPartyIds[0]);
        expect(events.some((e) => e.kind === "leaderReplaced")).toBe(true);
      }
    }
    expect(changed).toBeGreaterThanOrEqual(15);
  });

  it("calls a snap election after sustained very low approval", () => {
    let state: NationalPoliticsState = {
      ...start(),
      approval: 10,
      lastElectionTurn: -100,
      nextElectionTurn: 10_000,
    };
    let snapped = false;
    for (let i = 0; i < SNAP_LOW_APPROVAL_TICKS + 1 && !snapped; i++) {
      const result = tick(state, { output: state.economy.output * 0.97 });
      snapped = result.events.some((e) => e.kind === "election" && e.result.snap);
      state = result.state;
    }
    expect(snapped).toBe(true);
  });

  it("folds a party under 2% for two elections into its nearest neighbour", () => {
    const base = start();
    const parties = base.parties.map((p) =>
      p.partyId === "green" ? { ...p, voteShare: 0.001 } : { ...p }
    );
    const state: NationalPoliticsState = {
      ...base,
      parties,
      lastElection: {
        turn: 0,
        year: 2023,
        snap: false,
        results: parties.map((p) => ({ partyId: p.partyId, voteShare: p.voteShare, seats: 0 })),
        governmentPartyIds: base.governmentPartyIds,
        governmentChanged: false,
      },
    };
    const { state: next, events } = runNationalElection(state, electionInput("fold"));
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "partyFolded", partyId: "green" })
    );
    expect(next.parties.find((p) => p.partyId === "green")?.active).toBe(false);
  });
});

describe("head of government", () => {
  it("retires at the retirement age and is replaced from the governing party", () => {
    const state = start();
    const old = { ...state, head: { ...state.head, birthYear: 2027 - LEADER_RETIREMENT_AGE } };
    const { state: next, events } = tick(old, { turn: 7, year: 2027 });
    expect(events.some((e) => e.kind === "leaderReplaced" && e.reason === "retired")).toBe(true);
    expect(next.head.partyId).toBe(next.governmentPartyIds[0]);
    expect(2027 - next.head.birthYear).toBeLessThan(LEADER_RETIREMENT_AGE);
  });
});
