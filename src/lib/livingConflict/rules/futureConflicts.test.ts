import { describe, expect, it } from "vitest";
import { TURNS_PER_YEAR } from "@/lib/constants/calendar";
import {
  AI_LABOUR_AUTOMATION_THRESHOLD,
  FUTURE_WAVE_COOLDOWN_TURNS,
  aiLabourAnnualProbability,
  automationShareFromIndex,
  cyberAnnualProbability,
  memberCountries,
  perTurnChance,
  planFutureWave,
  seededRoll,
  seededUnit,
  severeConflictLoad,
  stackingAllows,
  straitAnnualProbability,
  waveCoolingDown,
  waveMembership,
} from "./futureConflicts";

const unopened = { hasOpened: false, status: "dormant" as const, tracks: {} };

describe("seeded rolls", () => {
  it("are deterministic and bounded", () => {
    expect(seededUnit("ai_labour_shock", "US", 1300)).toBe(
      seededUnit("ai_labour_shock", "US", 1300)
    );
    expect(seededUnit("ai_labour_shock", "US", 1300)).not.toBe(
      seededUnit("ai_labour_shock", "US", 1301)
    );
    for (let turn = 0; turn < 200; turn++) {
      const value = seededUnit("x", turn);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("compound per-turn chances back to the annual probability", () => {
    const chance = perTurnChance(0.3);
    expect(1 - (1 - chance) ** TURNS_PER_YEAR).toBeCloseTo(0.3, 6);
    expect(perTurnChance(0)).toBe(0);
    expect(perTurnChance(1)).toBe(1);
    expect(seededRoll(0, "never", 1)).toBe(false);
    expect(seededRoll(1, "always", 1)).toBe(true);
  });
});

describe("stacking guard", () => {
  it("allows at most two severe living conflicts per country", () => {
    const load = severeConflictLoad(
      [
        { defKey: "a", countryIds: ["US", "CN"] },
        { defKey: "b", countryIds: ["US", "US"] },
        { defKey: "c", countryIds: ["CN"] },
      ],
      "c"
    );
    expect(load.get("US")).toBe(2);
    expect(load.get("CN")).toBe(1);
    expect(stackingAllows("US", load)).toBe(false);
    expect(stackingAllows("CN", load)).toBe(true);
  });

  it("queues a third conflict even when its roll is certain", () => {
    const plan = planFutureWave({
      defKey: "ai_labour_shock",
      state: unopened,
      phaseKey: null,
      restingPhaseKeys: ["absorbed"],
      candidates: ["US", "UK"],
      annualProbability: () => 1,
      load: new Map([["US", 2]]),
      turn: 1500,
    });
    expect(plan.members).toEqual(["UK"]);
    expect(plan.openingPressure).toBe(1);
  });
});

describe("wave membership", () => {
  it("starts a wave from this turn's hits", () => {
    const wave = waveMembership({
      state: unopened,
      phaseKey: null,
      restingPhaseKeys: ["restored"],
      hits: ["UK", "DE"],
    });
    expect(wave.members).toEqual(["DE", "UK"]);
    expect(wave.observed).toMatchObject({ "member:DE": 1, "member:UK": 1, waveSignal: 2 });
  });

  it("keeps members and admits new hits while active", () => {
    const wave = waveMembership({
      state: { hasOpened: true, status: "active", tracks: { "member:UK": 1 } },
      phaseKey: "intrusion",
      restingPhaseKeys: ["restored"],
      hits: ["JP"],
    });
    expect(wave.members).toEqual(["JP", "UK"]);
    expect(wave.observed.waveSignal).toBe(0);
    expect(wave.openingPressure).toBe(0);
  });

  it("clears members and ignores hits while resting, then reopens after the cooldown", () => {
    const resting = {
      hasOpened: true,
      status: "settled" as const,
      tracks: { "member:UK": 1, recoveryTurns: 10 },
    };
    expect(waveCoolingDown(resting, "restored", ["restored"])).toBe(true);
    const cooling = waveMembership({
      state: resting,
      phaseKey: "restored",
      restingPhaseKeys: ["restored"],
      hits: ["JP"],
    });
    expect(cooling.members).toEqual([]);
    expect(cooling.observed).toMatchObject({ "member:UK": 0, waveSignal: 0 });

    const rested = {
      ...resting,
      tracks: { recoveryTurns: FUTURE_WAVE_COOLDOWN_TURNS },
    };
    expect(waveCoolingDown(rested, "restored", ["restored"])).toBe(false);
    const fresh = waveMembership({
      state: rested,
      phaseKey: "restored",
      restingPhaseKeys: ["restored"],
      hits: ["JP"],
    });
    expect(fresh.members).toEqual(["JP"]);
    expect(fresh.observed.waveSignal).toBe(1);
    expect(memberCountries({ tracks: { "member:JP": 1, "member:UK": 0 } })).toEqual(["JP"]);
  });
});

describe("AI labour shock conditions", () => {
  const base = { countryId: "US", unemployment: 7, unemploymentTrend: 0.3 };

  it("maps the automation index onto a share of the maximum labour saving", () => {
    expect(automationShareFromIndex(1)).toBe(0);
    expect(automationShareFromIndex(0.5)).toBe(1);
    expect(automationShareFromIndex(0.925)).toBeCloseTo(AI_LABOUR_AUTOMATION_THRESHOLD, 6);
    expect(automationShareFromIndex(undefined)).toBeNull();
  });

  it("opens only with high automation and rising unemployment", () => {
    expect(aiLabourAnnualProbability({ ...base, automationShare: 0.3 })).toBeGreaterThan(0);
    expect(aiLabourAnnualProbability({ ...base, automationShare: 0.1 })).toBe(0);
    expect(
      aiLabourAnnualProbability({ ...base, automationShare: 0.3, unemploymentTrend: -0.2 })
    ).toBe(0);
    expect(aiLabourAnnualProbability({ ...base, automationShare: null })).toBe(0);
    expect(aiLabourAnnualProbability({ ...base, automationShare: 0.3, unemployment: null })).toBe(
      0
    );
  });

  it("rises with automation and unemployment but never becomes certain", () => {
    const low = aiLabourAnnualProbability({ ...base, automationShare: 0.2 });
    const high = aiLabourAnnualProbability({ ...base, automationShare: 0.6, unemployment: 12 });
    expect(high).toBeGreaterThan(low);
    expect(aiLabourAnnualProbability({ ...base, automationShare: 1, unemployment: 40 })).toBe(0.8);
  });
});

describe("strait and cyber conditions", () => {
  it("opens the strait crisis only above the tension threshold", () => {
    expect(straitAnnualProbability(30)).toBe(0);
    expect(straitAnnualProbability(50)).toBeGreaterThan(0);
    expect(straitAnnualProbability(100)).toBe(0.75);
  });

  it("scales cyberattacks up with tension and down with resilience", () => {
    const signal = { countryId: "UK", resilience: 0.5 };
    expect(cyberAnnualProbability(10, signal)).toBe(0);
    expect(cyberAnnualProbability(70, signal)).toBeGreaterThan(cyberAnnualProbability(30, signal));
    expect(cyberAnnualProbability(70, { ...signal, resilience: 0.9 })).toBeLessThan(
      cyberAnnualProbability(70, { ...signal, resilience: 0.2 })
    );
    expect(cyberAnnualProbability(70, { ...signal, resilience: null })).toBe(0);
  });
});

describe("roll spread", () => {
  it("does not starve consecutive turns of hits", () => {
    const chance = perTurnChance(0.75);
    let hits = 0;
    for (let turn = 0; turn < 10 * TURNS_PER_YEAR; turn++) {
      if (seededUnit("pacific_strait_crisis", "CN", turn) < chance) hits++;
    }
    expect(hits).toBeGreaterThan(5);
    expect(hits).toBeLessThan(25);
  });
});
