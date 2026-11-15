import { describe, expect, it } from "vitest";
import {
  annualRetirementProbability,
  leaderRetirementChancePerTurn,
  nppDiesThisTurn,
  nppRetiresThisTurn,
  randomReplacementBirthYear,
} from "./mortality";
import { parseNppTurnoverConfig } from "./turnoverConfig";
import { NPP_TURNOVER_CONFIG as CONFIG } from "../turnoverData";

const TURNS = 48;

function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("parseNppTurnoverConfig", () => {
  it("accepts the shipped table", () => {
    expect(CONFIG.retirement.startAge).toBe(70);
  });

  it("throws on a missing value instead of defaulting", () => {
    const { leaders: _leaders, ...partial } = CONFIG;
    expect(() => parseNppTurnoverConfig(partial)).toThrow(/missing leaders\.windowTurns/);
  });

  it("throws on an out-of-range or non-numeric value", () => {
    expect(() =>
      parseNppTurnoverConfig({ ...CONFIG, death: { ...CONFIG.death, maxAnnual: 2 } })
    ).toThrow(/death\.maxAnnual/);
    expect(() =>
      parseNppTurnoverConfig({ ...CONFIG, backfill: { minAge: "35", ageSpan: 36 } })
    ).toThrow(/backfill\.minAge/);
  });

  it("throws when the retirement ramp is inverted", () => {
    expect(() =>
      parseNppTurnoverConfig({
        ...CONFIG,
        retirement: { ...CONFIG.retirement, maxAge: CONFIG.retirement.startAge },
      })
    ).toThrow(/maxAge/);
  });
});

describe("leaderRetirementChancePerTurn", () => {
  const chance = (age: number, left: number | null) =>
    leaderRetirementChancePerTurn(age, left, TURNS, CONFIG.retirement, CONFIG.leaders);

  it("is zero mid-term, positive in the window, and zero once the term is over", () => {
    expect(chance(75, CONFIG.leaders.windowTurns + 1)).toBe(0);
    expect(chance(75, CONFIG.leaders.windowTurns)).toBeGreaterThan(0);
    expect(chance(75, -1)).toBe(0);
  });

  it("retires on the ordinary roll with no term end on record or past the mid-term age", () => {
    const ordinary = annualRetirementProbability(75, CONFIG.retirement) / TURNS;
    expect(chance(75, null)).toBeCloseTo(ordinary);
    expect(chance(CONFIG.leaders.midTermRetirementAge, 100)).toBeGreaterThan(0);
  });

  it("is zero for a leader below retirement age", () => {
    expect(chance(60, 3)).toBe(0);
  });
});

describe("turnover over 24 game years", () => {
  /** A leader holds four-year terms; return the ages at which they left. */
  function simulateLeaderSeat(seed: number) {
    const rng = seededRng(seed);
    const termTurns = CONFIG.leaders.termTurns;
    let year = 2027;
    let birth = year - 62;
    const exits: Array<{ turnsToTermEnd: number; died: boolean }> = [];
    for (let turn = 0; turn < 24 * TURNS; turn++) {
      year = 2027 + Math.floor(turn / TURNS);
      const age = year - birth;
      const turnsToTermEnd = termTurns - (turn % termTurns);
      const died = nppDiesThisTurn(age, rng, TURNS, CONFIG.death);
      const retired =
        !died &&
        rng() <
          leaderRetirementChancePerTurn(
            age,
            turnsToTermEnd,
            TURNS,
            CONFIG.retirement,
            CONFIG.leaders
          );
      if (died || retired) {
        exits.push({ turnsToTermEnd, died });
        birth = year - (CONFIG.replacement.minAge + Math.floor(rng() * CONFIG.replacement.ageSpan));
      }
    }
    return exits;
  }

  it("replaces leaders over the span, and retirements land between terms", () => {
    let seatsWithExit = 0;
    let retirements = 0;
    const exitCounts = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const exits = simulateLeaderSeat(seed);
      if (exits.length > 0) seatsWithExit += 1;
      exitCounts.add(exits.length);
      for (const exit of exits) {
        if (!exit.died) {
          retirements += 1;
          expect(exit.turnsToTermEnd).toBeLessThanOrEqual(CONFIG.leaders.windowTurns);
        }
      }
    }
    expect(retirements).toBeGreaterThan(0);
    expect(seatsWithExit).toBeGreaterThan(50);
    // No fixed schedule: seats differ in how many times the holder changes.
    expect(exitCounts.size).toBeGreaterThan(1);
  });

  it("an ordinary seat sees a person age out and a younger one arrive", () => {
    const rng = seededRng(7);
    let ages = [75];
    let left = 0;
    for (let turn = 0; turn < 24 * TURNS; turn++) {
      if (turn % TURNS === 0 && turn > 0) ages = ages.map((a) => a + 1);
      ages = ages.map((age) => {
        if (
          nppDiesThisTurn(age, rng, TURNS, CONFIG.death) ||
          nppRetiresThisTurn(age, rng, TURNS, CONFIG.retirement)
        ) {
          left += 1;
          return 2027 - randomReplacementBirthYear(2027, rng, CONFIG.replacement);
        }
        return age;
      });
    }
    expect(left).toBeGreaterThanOrEqual(1);
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(32);
  });
});
