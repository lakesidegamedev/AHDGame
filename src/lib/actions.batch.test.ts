import { describe, it, expect } from "vitest";
import { getActionPointCost, getBatchAffordability, simulateActionBatch } from "./actions";
import { makeCharacter } from "@/lib/test-utils/factories";
import type { State } from "@/lib/db/types";
import type { CharacterStats } from "@/lib/stats/statsConstants";

// Neutral 5.5 in every stat yields exactly a 1.0x multiplier, so these
// campaign fixtures price at the unscaled historical numbers. Campaign now
// requires allocated stats (Game1724 slice 2): the rules reject missing stats
// instead of substituting the neutral fallback.
const NEUTRAL_STATS: CharacterStats = {
  charisma: 5.5,
  debate: 5.5,
  energy: 5.5,
  fundraising: 5.5,
  businessAcumen: 5.5,
  statecraft: 5.5,
  intellect: 5.5,
};

const testState: State = {
  _id: "CA",
  countryId: "US",
  name: "California",
  population: 1_000_000,
  gdp: 65_000,
  houseDistricts: 53,
  stateSenateSeats: 40,
  region: "West",
};

describe("simulateActionBatch", () => {
  it("rejects fundraise without donor base", () => {
    const c = makeCharacter({ donorBaseLevel: 0, actions: 100, funds: 1_000_000 });
    const r = simulateActionBatch(c, undefined, "fundraise", 5);
    expect(r.ok).toBe(false);
  });

  it("staggers campaign costs and PI across multiple runs", () => {
    const c = makeCharacter({
      politicalInfluence: 0,
      actions: 50,
      funds: 10_000_000,
      stats: NEUTRAL_STATS,
    });
    const r = simulateActionBatch(c, testState, "campaign", 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totalActionPoints).toBe(5);
      expect(r.finalCharacter.politicalInfluence).toBe(5);
      expect(typeof r.netFundsChange).toBe("number");
    }
  });

  it("fails when action points run out mid-batch", () => {
    const c = makeCharacter({
      politicalInfluence: 0,
      actions: 2,
      funds: 10_000_000,
      stats: NEUTRAL_STATS,
    });
    const r = simulateActionBatch(c, testState, "campaign", 5);
    expect(r.ok).toBe(false);
  });
});

it.each([0.03673, 0.35808, 1.28579])(
  "batch quotes charge the same era price %s on every action",
  (priceLevel) => {
    const c = makeCharacter({
      politicalInfluence: 0,
      actions: 50,
      funds: 10_000_000,
      stats: NEUTRAL_STATS,
    });
    const modern = simulateActionBatch(c, testState, "campaign", 5);
    const era = simulateActionBatch(c, testState, "campaign", 5, false, undefined, { priceLevel });
    expect(modern.ok && era.ok).toBe(true);
    if (modern.ok && era.ok) {
      expect(era.totalActionPoints).toBe(modern.totalActionPoints);
      expect(Math.abs(era.netFundsChange - modern.netFundsChange * priceLevel)).toBeLessThanOrEqual(
        2.5
      );
      expect(era.finalCharacter.politicalInfluence).toBe(modern.finalCharacter.politicalInfluence);
    }
  }
);

describe("getBatchAffordability", () => {
  it("does not throw when Campaign projection reaches the influence cap", () => {
    const c = makeCharacter({
      politicalInfluence: 99.5,
      actions: 1,
      funds: 10_000_000,
      stats: NEUTRAL_STATS,
    });
    for (const n of [5, 10]) {
      const r = getBatchAffordability(c, testState, "campaign", n);
      expect(r.canRunAll).toBe(false);
      expect(typeof r.title).toBe("string");
    }
  });

  it("reports all runs affordable when the batch fits", () => {
    const c = makeCharacter({ donorBaseLevel: 5, actions: 100, funds: 1_000_000 });
    const r = getBatchAffordability(c, undefined, "fundraise", 5);
    expect(r).toEqual({ affordableRuns: 5, canRunAll: true });
  });

  it("counts how many runs action points allow and explains the limit", () => {
    const base = makeCharacter({ donorBaseLevel: 5, actions: 100, funds: 1_000_000 });
    const cost = getActionPointCost(base, "fundraise");
    const c = { ...base, actions: cost * 3 + 1 };
    const r = getBatchAffordability(c, undefined, "fundraise", 5);
    expect(r.canRunAll).toBe(false);
    expect(r.affordableRuns).toBe(3);
    expect(r.title).toContain("you can afford 3");
  });

  it("reports zero when not even one run is possible", () => {
    const c = makeCharacter({ donorBaseLevel: 0, actions: 100, funds: 1_000_000 });
    const r = getBatchAffordability(c, undefined, "fundraise", 10);
    expect(r.affordableRuns).toBe(0);
    expect(r.title).toMatch(/^Cannot run this action/);
  });

  it("states whole-batch action point totals, not the failing run's cost", () => {
    const base = makeCharacter({ donorBaseLevel: 5, actions: 100, funds: 1_000_000 });
    const cost = getActionPointCost(base, "fundraise");
    const c = { ...base, actions: cost * 3 + 1 };
    const r = getBatchAffordability(c, undefined, "fundraise", 5);
    expect(r.title).toContain(`you have ${cost * 3 + 1}`);
    expect(r.title).toMatch(/All 5 runs cost \d+ action points/);
    expect(r.title).not.toContain("Required:");
  });

  it("states whole-batch fund totals against the starting balance", () => {
    const c = makeCharacter({
      donorBaseLevel: 5,
      actions: 100,
      funds: 1_000_000,
      stats: NEUTRAL_STATS,
      favorability: 50,
    });
    const one = simulateActionBatch(c, testState, "advertise", 1);
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const perRun = -one.netFundsChange;
    const poor = { ...c, funds: Math.round(perRun * 2.5) };
    const r = getBatchAffordability(poor, testState, "advertise", 5);
    expect(r.canRunAll).toBe(false);
    expect(r.title).toMatch(/All 5 runs cost/);
    expect(r.title).toContain("you have");
    expect(r.title).not.toContain("Available:");
  });
});
