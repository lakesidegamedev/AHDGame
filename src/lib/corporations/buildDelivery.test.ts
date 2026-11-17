import { describe, expect, it } from "vitest";
import type { SectorBuildOrder } from "@/lib/db/types";
import {
  firstDeliveryTurn,
  costReleasedSince,
  costReleasedThisTurn,
  deliveredFraction,
  nextArrivalTurn,
  plannedArrivalTurns,
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
    deliveryBaseFraction: 0,
    ...partial,
  };
}

function legacy(partial: Partial<SectorBuildOrder> = {}): SectorBuildOrder {
  return {
    unitsOrdered: 100,
    costPaidAnchor: 1_000,
    startTurn: 0,
    onlineTurn: 100,
    deliveryBaseFraction: 0,
    ...partial,
  };
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

describe("buildDelivery — legacy orders with a window also ramp linearly", () => {
  it("delivers a slice every turn instead of waiting for the online turn", () => {
    const o = legacy({ onlineTurn: 100 });
    expect(unitsDeliveredThisTurn(o, 50)).toBeCloseTo(1, 9);
    expect(unitsDeliveredThisTurn(o, 100)).toBeCloseTo(1, 9);
    expect(costReleasedThisTurn(o, 100)).toBeCloseTo(10, 9);
  });

  it("releases CIP a slice at a time", () => {
    const o = legacy({ onlineTurn: 100 });
    expect(undeliveredCost(o, 50)).toBeCloseTo(500, 9);
    expect(undeliveredCost(o, 100)).toBe(0);
  });

  it("a degenerate zero-window order falls back to all-at-once", () => {
    const o = smooth({ startTurn: 100, onlineTurn: 100 });
    expect(unitsDeliveredThisTurn(o, 100)).toBe(100);
  });
});

describe("buildDelivery — whole-plant orders deliver every turn", () => {
  it("a one-plant order adds capacity from the first turn and telescopes to the plant", () => {
    const o = smooth({ unitsOrdered: 25, plantUnits: 25, startTurn: 0, onlineTurn: 17 });
    expect(unitsDeliveredThisTurn(o, 1)).toBeCloseTo(25 / 17, 9);
    expect(unitsDeliveredSince(o, 0, 17)).toBeCloseTo(25, 9);
    expect(costReleasedSince(o, 0, 17)).toBeCloseTo(1_000, 9);
  });

  it("a multi-plant order is no longer stepped", () => {
    const o = smooth({ unitsOrdered: 300, plantUnits: 100, startTurn: 0, onlineTurn: 6 });
    for (let t = 1; t <= 6; t++) expect(unitsDeliveredThisTurn(o, t)).toBeCloseTo(50, 9);
  });
});

describe("buildDelivery — re-anchored in-flight orders", () => {
  it("ramps the remainder from the recorded base without repeating it", () => {
    const o = smooth({ startTurn: 4, onlineTurn: 10, deliveryBaseFraction: 0.5 });
    expect(deliveredFraction(o, 4)).toBe(0.5);
    expect(deliveredFraction(o, 7)).toBeCloseTo(0.75, 9);
    expect(unitsDeliveredSince(o, 4, 10)).toBeCloseTo(50, 9);
    expect(steadyUnitsPerTurn(o, 5)).toBeCloseTo(50 / 6, 9);
  });
});

describe("buildDelivery: orders not yet stamped keep their original curve", () => {
  it("lands a whole-plant order in whole-plant steps", () => {
    const o = smooth({
      unitsOrdered: 300,
      plantUnits: 100,
      startTurn: 0,
      onlineTurn: 6,
      deliveryBaseFraction: undefined,
    });
    const perTurn = [1, 2, 3, 4, 5, 6].map((t) => unitsDeliveredThisTurn(o, t));
    perTurn.forEach((u) => expect(Math.abs(u % 100)).toBeLessThan(1e-9));
    expect(perTurn.reduce((a, b) => a + b, 0)).toBeCloseTo(300, 9);
    expect(perTurn.some((u) => u === 0)).toBe(true);
    expect(steadyUnitsPerTurn(o, 2)).toBe(0);
  });

  it("lands a non-smooth order in one lump at the online turn", () => {
    const o = legacy({ onlineTurn: 40, deliveryBaseFraction: undefined });
    expect(unitsDeliveredSince(o, 0, 39)).toBe(0);
    expect(unitsDeliveredThisTurn(o, 40)).toBe(100);
    expect(costReleasedThisTurn(o, 40)).toBe(1_000);
    expect(nextArrivalTurn(o, 10)).toBe(40);
  });

  it("ramps a smooth order without plant steps linearly", () => {
    const o = smooth({ deliveryBaseFraction: undefined });
    expect(unitsDeliveredThisTurn(o, 50)).toBeCloseTo(1, 9);
  });

  it("a migrated order telescopes to exactly the units ordered when a turn ran first", () => {
    const old = smooth({
      unitsOrdered: 300,
      plantUnits: 100,
      startTurn: 0,
      onlineTurn: 6,
      deliveryBaseFraction: undefined,
    });
    // Turn 3 runs on the new code before the migration: old curve delivers.
    const before = unitsDeliveredSince(old, 0, 3);
    // Migration then re-anchors at the settled turn 3 with the old share as base.
    const base = before / 300;
    const migrated = { ...old, startTurn: 3, deliveryBaseFraction: base };
    const after = unitsDeliveredSince(migrated, 3, 6);
    expect(before + after).toBeCloseTo(300, 9);
    expect(unitsDeliveredSince(migrated, 6, 20)).toBe(0);
  });
});

describe("buildDelivery — queueUndeliveredCost", () => {
  it("sums the undelivered cost across mixed orders", () => {
    const q = [
      smooth({ costPaidAnchor: 1_000, startTurn: 0, onlineTurn: 100 }), // 25% done → 750 left
      legacy({ costPaidAnchor: 500, onlineTurn: 200 }), // 12.5% done → 437.5 left
    ];
    expect(queueUndeliveredCost(q, 25)).toBeCloseTo(750 + 437.5, 6);
  });
});

describe("steadyUnitsPerTurn", () => {
  it("is the linear slice for an order still ramping", () => {
    expect(steadyUnitsPerTurn(smooth(), 10)).toBeCloseTo(1, 9);
    expect(steadyUnitsPerTurn(legacy(), 10)).toBeCloseTo(1, 9);
  });

  it("is zero once an order has landed", () => {
    expect(steadyUnitsPerTurn(smooth(), 100)).toBe(0);
  });

  it("is the same slice for a sub-plant or one-plant whole-plant order", () => {
    const o = smooth({ unitsOrdered: 193, plantUnits: 250, startTurn: 606, onlineTurn: 614 });
    expect(steadyUnitsPerTurn(o, 608)).toBeCloseTo(193 / 8, 9);
    expect(unitsDeliveredThisTurn(o, 609)).toBeCloseTo(193 / 8, 9);
  });
});

describe("nextArrivalTurn", () => {
  it("is the next turn for any ramping order", () => {
    expect(nextArrivalTurn(legacy({ onlineTurn: 40 }), 10)).toBe(11);
    const onePlant = smooth({
      unitsOrdered: 193,
      plantUnits: 250,
      startTurn: 606,
      onlineTurn: 614,
    });
    expect(nextArrivalTurn(onePlant, 608)).toBe(609);
    expect(nextArrivalTurn(smooth(), 10)).toBe(11);
  });

  it("is the turn after the start for an order that has not started", () => {
    expect(nextArrivalTurn(smooth({ startTurn: 20 }), 10)).toBe(21);
  });

  it("is null once an order has landed", () => {
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

  it("ramps a legacy order with a window and lands the rest after it is due", () => {
    expect(unitsDeliveredSince(legacy(), 90, 99)).toBeCloseTo(9, 9);
    expect(unitsDeliveredSince(legacy(), 90, 130)).toBeCloseTo(10, 9);
  });
});

describe("plannedArrivalTurns", () => {
  it("starts next turn even for a one-plant order", () => {
    expect(plannedArrivalTurns(100, 100, 6)).toEqual({ firstInTurns: 1, lastInTurns: 6 });
  });

  it("starts next turn for several plants too", () => {
    expect(plannedArrivalTurns(300, 100, 6)).toEqual({ firstInTurns: 1, lastInTurns: 6 });
  });

  it("agrees with the delivery the turn applies", () => {
    const plan = plannedArrivalTurns(500, 100, 7)!;
    const order = {
      unitsOrdered: 500,
      costPaidAnchor: 0,
      startTurn: 0,
      onlineTurn: 7,
      smooth: true,
      plantUnits: 100,
      deliveryBaseFraction: 0,
    } as SectorBuildOrder;
    expect(unitsDeliveredThisTurn(order, plan.firstInTurns)).toBeGreaterThan(0);
    expect(unitsDeliveredSince(order, 0, plan.firstInTurns - 1)).toBe(0);
    expect(unitsDeliveredSince(order, 0, plan.lastInTurns)).toBeCloseTo(500, 9);
  });

  it("returns null for an empty order", () => {
    expect(plannedArrivalTurns(0, 100, 6)).toBeNull();
  });
});

describe("firstDeliveryTurn", () => {
  const base = { unitsOrdered: 50, costPaidAnchor: 100, startTurn: 10, onlineTurn: 18 };

  it("is the online turn for a single whole plant", () => {
    expect(firstDeliveryTurn({ ...base, smooth: true, plantUnits: 50 })).toBe(18);
  });

  it("is the first landed plant for a multi-plant smooth order", () => {
    expect(firstDeliveryTurn({ ...base, smooth: true, plantUnits: 25 })).toBe(14);
  });

  it("is the online turn for a legacy lump order", () => {
    expect(firstDeliveryTurn(base)).toBe(18);
  });
});
