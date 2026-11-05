import { describe, expect, it } from "vitest";
import type { SectorBuildOrder } from "@/lib/db/types";
import {
  costReleasedSince,
  costReleasedThisTurn,
  deliveredFraction,
  nextArrivalTurn,
  queueUndeliveredCost,
  resolveBuildSettledTurn,
  steadyUnitsPerTurn,
  undeliveredCost,
  undeliveredUnits,
  unitsDeliveredSince,
  unitsDeliveredThisTurn,
} from "@/lib/corporations/buildDelivery";

function smooth(partial: Partial<SectorBuildOrder> = {}): SectorBuildOrder {
  return {
    unitsOrdered: 100,
    costPaidAnchor: 1_000,
    startTurn: 0,
    onlineTurn: 100,
    smooth: true,
    ...partial,
  };
}

function legacy(partial: Partial<SectorBuildOrder> = {}): SectorBuildOrder {
  return { unitsOrdered: 100, costPaidAnchor: 1_000, startTurn: 0, onlineTurn: 100, ...partial };
}

describe("buildDelivery — smooth orders ramp linearly", () => {
  it("delivers a proportional slice of units every turn", () => {
    const o = smooth();
    expect(unitsDeliveredThisTurn(o, 1)).toBeCloseTo(1, 9); // 1/100 of 100
    expect(unitsDeliveredThisTurn(o, 50)).toBeCloseTo(1, 9);
    expect(unitsDeliveredThisTurn(o, 100)).toBeCloseTo(1, 9); // the final slice
  });

  it("delivers nothing before it starts and nothing after it lands", () => {
    const o = smooth({ startTurn: 10, onlineTurn: 110 });
    expect(unitsDeliveredThisTurn(o, 10)).toBe(0); // start turn: 0 so far
    expect(unitsDeliveredThisTurn(o, 200)).toBe(0); // long done
  });

  it("the per-turn slices telescope to exactly the whole order", () => {
    const o = smooth({ unitsOrdered: 100, onlineTurn: 100 });
    let sum = 0;
    for (let t = 1; t <= 100; t++) sum += unitsDeliveredThisTurn(o, t);
    expect(sum).toBeCloseTo(100, 6);
  });

  it("releases cost in lockstep with units", () => {
    const o = smooth({ costPaidAnchor: 1_000, onlineTurn: 100 });
    let sum = 0;
    for (let t = 1; t <= 100; t++) sum += costReleasedThisTurn(o, t);
    expect(sum).toBeCloseTo(1_000, 6);
  });

  it("reports the not-yet-built remainder as undelivered", () => {
    const o = smooth({ unitsOrdered: 100, costPaidAnchor: 1_000, onlineTurn: 100 });
    expect(deliveredFraction(o, 25)).toBeCloseTo(0.25, 9);
    expect(undeliveredUnits(o, 25)).toBeCloseTo(75, 9);
    expect(undeliveredCost(o, 25)).toBeCloseTo(750, 9);
    expect(undeliveredCost(o, 100)).toBeCloseTo(0, 9);
  });
});

describe("buildDelivery — legacy orders keep all-at-once landing", () => {
  it("delivers zero until the online turn, then the whole order", () => {
    const o = legacy({ onlineTurn: 100 });
    expect(unitsDeliveredThisTurn(o, 50)).toBe(0);
    expect(unitsDeliveredThisTurn(o, 100)).toBe(100);
    expect(costReleasedThisTurn(o, 100)).toBe(1_000);
  });

  it("holds full cost in CIP until it lands", () => {
    const o = legacy({ onlineTurn: 100 });
    expect(undeliveredCost(o, 99)).toBe(1_000);
    expect(undeliveredUnits(o, 99)).toBe(100);
    expect(undeliveredCost(o, 100)).toBe(0);
  });

  it("a degenerate zero-window smooth order falls back to all-at-once", () => {
    const o = smooth({ startTurn: 100, onlineTurn: 100 });
    expect(unitsDeliveredThisTurn(o, 100)).toBe(100);
  });
});

describe("buildDelivery — queueUndeliveredCost", () => {
  it("sums the undelivered cost across mixed orders", () => {
    const q = [
      smooth({ costPaidAnchor: 1_000, startTurn: 0, onlineTurn: 100 }), // 25% done → 750 left
      legacy({ costPaidAnchor: 500, onlineTurn: 200 }), // not landed → 500 left
    ];
    expect(queueUndeliveredCost(q, 25)).toBeCloseTo(750 + 500, 6);
  });
});

describe("steadyUnitsPerTurn", () => {
  it("is the linear slice for a smooth order still ramping", () => {
    expect(steadyUnitsPerTurn(smooth(), 10)).toBeCloseTo(1, 9);
  });

  it("is zero for a legacy order and once an order has landed", () => {
    expect(steadyUnitsPerTurn(legacy(), 10)).toBe(0);
    expect(steadyUnitsPerTurn(smooth(), 100)).toBe(0);
  });

  it("is zero for a whole-plant order under one plant, which lands whole (ticket 1753)", () => {
    // About 193 units against a 250-unit mine: nothing arrives until the online turn.
    const o = smooth({ unitsOrdered: 193, plantUnits: 250, startTurn: 606, onlineTurn: 614 });
    expect(steadyUnitsPerTurn(o, 608)).toBe(0);
    expect(unitsDeliveredThisTurn(o, 609)).toBe(0);
    expect(unitsDeliveredThisTurn(o, 614)).toBeCloseTo(193, 9);
  });

  it("is zero when whole plants land less often than every turn", () => {
    const o = smooth({ unitsOrdered: 300, plantUnits: 100, startTurn: 0, onlineTurn: 10 });
    expect(steadyUnitsPerTurn(o, 1)).toBe(0);
  });

  it("keeps the rate when at least one whole plant lands every turn", () => {
    const o = smooth({ unitsOrdered: 2_000, plantUnits: 100, startTurn: 0, onlineTurn: 10 });
    expect(steadyUnitsPerTurn(o, 1)).toBeCloseTo(200, 9);
    for (let turn = 1; turn <= 10; turn++) {
      expect(unitsDeliveredThisTurn(o, turn)).toBeGreaterThanOrEqual(100);
    }
  });
});

describe("nextArrivalTurn", () => {
  it("is the online turn for a legacy order and for an order under one plant", () => {
    expect(nextArrivalTurn(legacy({ onlineTurn: 40 }), 10)).toBe(40);
    const subPlant = smooth({
      unitsOrdered: 193,
      plantUnits: 250,
      startTurn: 606,
      onlineTurn: 614,
    });
    expect(nextArrivalTurn(subPlant, 608)).toBe(614);
  });

  it("finds a mid-build plant: two plants over six turns land at the midpoint and the end", () => {
    const o = smooth({ unitsOrdered: 200, plantUnits: 100, startTurn: 0, onlineTurn: 6 });
    expect(nextArrivalTurn(o, 0)).toBe(3);
    expect(nextArrivalTurn(o, 3)).toBe(6);
  });

  it("finds the next of several plants landing on most turns", () => {
    const o = smooth({ unitsOrdered: 500, plantUnits: 100, startTurn: 0, onlineTurn: 6 });
    expect(nextArrivalTurn(o, 0)).toBe(2);
    expect(steadyUnitsPerTurn(o, 0)).toBe(0);
  });

  it("is the next turn for a linear order and null once an order has landed", () => {
    expect(nextArrivalTurn(smooth(), 10)).toBe(11);
    expect(nextArrivalTurn(smooth(), 100)).toBeNull();
  });
});

describe("buildDelivery: catching up turns the build step did not run (#5169)", () => {
  it("starts after the sector's own stamp, then the world's, then the previous turn", () => {
    expect(resolveBuildSettledTurn(130, 100, 90)).toBe(100);
    expect(resolveBuildSettledTurn(130, undefined, 90)).toBe(90);
    expect(resolveBuildSettledTurn(130, null, null)).toBe(129);
  });

  it("returns the current turn on a replay, so nothing lands twice", () => {
    expect(resolveBuildSettledTurn(130, 130, 90)).toBe(130);
  });

  it("ignores a stamp from an older world with higher turn numbers", () => {
    expect(resolveBuildSettledTurn(5, 700, 3)).toBe(3);
    expect(resolveBuildSettledTurn(5, 700, 700)).toBe(4);
    expect(resolveBuildSettledTurn(5, 2.5, undefined)).toBe(4);
  });

  it("lands an order due wholly inside a pause in full on the first turn after it", () => {
    const o = smooth({ startTurn: 10, onlineTurn: 30 });
    expect(unitsDeliveredSince(o, 5, 40)).toBeCloseTo(100, 9);
    expect(costReleasedSince(o, 5, 40)).toBeCloseTo(1_000, 9);
  });

  it("lands the paused share of an order that spans the pause", () => {
    const o = smooth({ startTurn: 0, onlineTurn: 100 });
    // Settled through turn 20, paused to turn 50: 30 turns of slices owed.
    expect(unitsDeliveredSince(o, 20, 50)).toBeCloseTo(30, 9);
    // Ran normally up to 20 and catches up past the online turn: the rest.
    expect(unitsDeliveredSince(o, 20, 120)).toBeCloseTo(80, 9);
  });

  it("delivers nothing when the span is empty", () => {
    expect(unitsDeliveredSince(smooth(), 50, 50)).toBe(0);
    expect(costReleasedSince(legacy(), 120, 120)).toBe(0);
  });

  it("matches the one-turn slices it replaces, summed over the span", () => {
    const o = smooth({ unitsOrdered: 500, plantUnits: 100, startTurn: 0, onlineTurn: 7 });
    let perTurn = 0;
    for (let t = 3; t <= 9; t++) perTurn += unitsDeliveredThisTurn(o, t);
    expect(unitsDeliveredSince(o, 2, 9)).toBeCloseTo(perTurn, 9);
  });

  it("still lands a legacy order once it has come due", () => {
    expect(unitsDeliveredSince(legacy(), 90, 130)).toBe(100);
    expect(unitsDeliveredSince(legacy(), 90, 99)).toBe(0);
  });
});
