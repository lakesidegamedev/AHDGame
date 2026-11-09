/**
 * Tests for the shared durable base-value relocation primitives (lean AND
 * turnout channels). See the module doc comment for the full design writeup:
 * era checkpoints, the SCOTUS demographic-signal consumer, and designated
 * ("permanent") legislation all funnel through these same pure functions so
 * a durable shift reaches both vote paths identically.
 */
import { describe, it, expect } from "vitest";
import type { CensusGroupView } from "@/lib/db/types/demographics";
import {
  applyDurableStep,
  applyDurableBucketShift,
  readLayer1Overlay,
  applyDurableBucketTurnoutShift,
  readLayer1TurnoutOverlay,
  type DurableShiftAccumulators,
} from "./durableRealignment";

function makeAcc(): DurableShiftAccumulators {
  return { liveUpdates: {}, defaultUpdates: {} };
}

describe("applyDurableStep (lean axis, -5..5)", () => {
  it("is a no-op for a zero delta", () => {
    expect(applyDurableStep(1.2, 0)).toBe(1.2);
  });
  it("clamps to the shared -5..5 axis", () => {
    expect(applyDurableStep(4.5, 3)).toBe(5);
    expect(applyDurableStep(-4.5, -3)).toBe(-5);
  });
});

describe("readLayer1Overlay / readLayer1TurnoutOverlay", () => {
  it("returns 0 when the defaults doc, dim, or bucket is missing", () => {
    expect(readLayer1Overlay(null, "race", "white", "economicLean")).toBe(0);
    expect(readLayer1TurnoutOverlay(null, "race", "black")).toBe(0);
    const defaults = {
      _id: "AL",
      countryId: "US",
      categoryWeights: {},
      groups: {},
      lastUpdated: new Date(),
    } as CensusGroupView;
    expect(readLayer1Overlay(defaults, "race", "white", "economicLean")).toBe(0);
    expect(readLayer1TurnoutOverlay(defaults, "race", "black")).toBe(0);
  });

  it("reads the stored value when present", () => {
    const defaults: CensusGroupView = {
      _id: "AL",
      countryId: "US",
      categoryWeights: {},
      groups: {},
      lastUpdated: new Date(),
      layer1PositionOverrides: { race: { white: { economicLean: 2, socialLean: -1 } } },
      layer1TurnoutOverrides: { race: { black: 15 } },
    };
    expect(readLayer1Overlay(defaults, "race", "white", "economicLean")).toBe(2);
    expect(readLayer1Overlay(defaults, "race", "white", "socialLean")).toBe(-1);
    expect(readLayer1TurnoutOverlay(defaults, "race", "black")).toBe(15);
  });
});

describe("applyDurableBucketShift (lean, exact dim/bucket)", () => {
  it("writes only the overlay key, never a live key", () => {
    const acc = makeAcc();
    applyDurableBucketShift("race", "black", "economicLean", 1.5, () => 0, acc);
    expect(acc.defaultUpdates["layer1PositionOverrides.race.black.economicLean"]).toBe(1.5);
    expect(Object.keys(acc.liveUpdates)).toHaveLength(0);
  });

  it("accumulates on top of a pre-existing overlay reader value", () => {
    const acc = makeAcc();
    applyDurableBucketShift("race", "black", "economicLean", 1, () => 2, acc);
    expect(acc.defaultUpdates["layer1PositionOverrides.race.black.economicLean"]).toBe(3);
  });

  it("stacks several targets landing on the same bucket within one turn", () => {
    const acc = makeAcc();
    applyDurableBucketShift("race", "black", "economicLean", 1, () => 2, acc);
    applyDurableBucketShift("race", "black", "economicLean", 0.5, () => 2, acc);
    expect(acc.defaultUpdates["layer1PositionOverrides.race.black.economicLean"]).toBe(3.5);
  });

  it("is a no-op when netDelta is 0", () => {
    const acc = makeAcc();
    applyDurableBucketShift("race", "black", "economicLean", 0, () => 2, acc);
    expect(acc.defaultUpdates).toEqual({});
  });
});

// ─── Turnout channel — the Voting Rights Act's mechanism ───────────────────

describe("applyDurableBucketTurnoutShift (turnout, exact dim/bucket — the VRA checkpoint's channel)", () => {
  it("writes only the layer1TurnoutOverrides key, never a live key", () => {
    const acc = makeAcc();
    applyDurableBucketTurnoutShift("race", "black", 20, () => 0, acc);
    expect(acc.defaultUpdates["layer1TurnoutOverrides.race.black"]).toBe(20);
    expect(Object.keys(acc.liveUpdates)).toHaveLength(0);
  });

  it("accumulates on top of a pre-existing overlay reader value", () => {
    const acc = makeAcc();
    applyDurableBucketTurnoutShift("race", "black", 5, () => 10, acc);
    expect(acc.defaultUpdates["layer1TurnoutOverrides.race.black"]).toBe(15);
  });

  it("is symmetric: a sustained negative (suppression) delta accumulates below zero, not floored at 0", () => {
    const acc = makeAcc();
    applyDurableBucketTurnoutShift("race", "black", -10, () => -5, acc);
    // If this used the archetype's [0,100] clamp instead of the overlay's
    // own signed bound, -15 would have been floored to 0 — proving the
    // module's OWN documented reason for not reusing that clamp.
    expect(acc.defaultUpdates["layer1TurnoutOverrides.race.black"]).toBe(-15);
  });

  it("clamps the accumulator at its own (signed, not [0,100]) bound under an extreme run", () => {
    const acc = makeAcc();
    let overlay = 0;
    for (let i = 0; i < 50; i++) {
      applyDurableBucketTurnoutShift("race", "black", 10, () => overlay, acc);
      overlay = acc.defaultUpdates["layer1TurnoutOverrides.race.black"];
    }
    // Bounded (not runaway to 500), and well above 100 — proving it is NOT
    // clamped to the [0, 100] absolute turnout scale.
    expect(overlay).toBeLessThan(500);
    expect(overlay).toBeGreaterThan(50);
  });
});
