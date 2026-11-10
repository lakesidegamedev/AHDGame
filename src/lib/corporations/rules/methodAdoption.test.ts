import { describe, expect, it } from "vitest";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategyDefinitions";
import { STRATEGY_TRANSITION_TURNS } from "@/lib/constants/sectorStrategyTypes";
import { getEffectiveStrategyRates } from "@/lib/corporations/rules/sectorStrategies";
import {
  isAwaitingBuild,
  methodAdoptionSurchargeFraction,
  methodBuildDelayTurns,
  methodTransitionStartTurn,
} from "./methodAdoption";

const withBuild = Object.entries(SECTOR_STRATEGIES).flatMap(([sector, list]) =>
  list.filter((s) => s.buildTurns != null).map((s) => ({ sector, strategy: s }))
);

describe("method adoption", () => {
  it("prices a downside for every method that records one", () => {
    expect(withBuild.length).toBeGreaterThan(0);
    for (const { strategy } of withBuild) {
      expect(methodAdoptionSurchargeFraction(strategy), strategy.id).toBeGreaterThan(0);
    }
  });

  it("charges nothing for methods without a downside", () => {
    expect(methodAdoptionSurchargeFraction({ id: "standard" })).toBe(0);
  });

  it("adds a wait only when the build outlasts the phase-in", () => {
    expect(methodBuildDelayTurns({ buildTurns: 4 * 48 })).toBe(4 * 48 - STRATEGY_TRANSITION_TURNS);
    expect(methodBuildDelayTurns({ buildTurns: 6 })).toBe(0);
    expect(methodBuildDelayTurns({})).toBe(0);
  });

  it("keeps the old method running until the build is done, then phases in", () => {
    const fission = SECTOR_STRATEGIES.energy.find((s) => s.id === "advanced_fission")!;
    const start = methodTransitionStartTurn({ currentTurn: 100, strategy: fission, headstart: 0 });
    expect(isAwaitingBuild({ currentTurn: 100, transitionStartTurn: start })).toBe(true);
    const old = SECTOR_STRATEGIES.energy[0]!;
    const rates = (turn: number) =>
      getEffectiveStrategyRates("energy", fission.id, old.id, start, turn);
    const before = rates(100 + 100);
    expect(before.supply).toEqual(old.supply);
    expect(rates(100 + fission.buildTurns!).supply).toEqual(fission.supply);
    expect(isAwaitingBuild({ currentTurn: start, transitionStartTurn: start })).toBe(false);
  });

  it("a plain method starts its phase-in at once", () => {
    expect(
      methodTransitionStartTurn({ currentTurn: 50, strategy: { buildTurns: 12 }, headstart: 0 })
    ).toBe(50);
    expect(methodTransitionStartTurn({ currentTurn: 50, strategy: {}, headstart: 6 })).toBe(44);
  });
});
