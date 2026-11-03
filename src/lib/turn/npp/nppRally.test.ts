import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { planNppRally } from "./nppRally";
import type { NppRaceSignal } from "@/lib/npp/actionSignals";

const race = (overrides: Partial<NppRaceSignal> = {}): NppRaceSignal => ({
  candidateRowId: new ObjectId(),
  electionType: "president",
  rallyEligible: true,
  support: 50,
  lastRallyTurn: null,
  ...overrides,
});

describe("NPP engine 6.2 rally", () => {
  it("moves Support by what a player rally moves it", () => {
    // R = 10: 60% now (6), 40% over 4 turns (1 each).
    const write = planNppRally(race(), 40);
    expect(write?.updateOne.update.$set.support).toBeCloseTo(56, 6);
    expect(write?.updateOne.update.$set.lastRallyTurn).toBe(40);
    expect(write?.updateOne.update.$push.supportAccrual.turnsRemaining).toBe(4);
    expect(write?.updateOne.update.$push.supportAccrual.amountPerTurn).toBeCloseTo(1, 6);
  });

  it("does not rally outside a rally-eligible active race", () => {
    expect(planNppRally(null, 40)).toBeNull();
    expect(planNppRally(race({ rallyEligible: false }), 40)).toBeNull();
  });

  it("holds the one-rally-per-turn limit players have", () => {
    expect(planNppRally(race({ lastRallyTurn: 40 }), 40)).toBeNull();
    expect(planNppRally(race({ lastRallyTurn: 39 }), 40)).not.toBeNull();
  });

  it("clamps Support at 100", () => {
    expect(planNppRally(race({ support: 99.5 }), 40)?.updateOne.update.$set.support).toBe(100);
  });
});
