import { describe, expect, it } from "vitest";
import {
  freeTransitionConversion,
  strugglingReason,
  transitionReliefEligible,
  type SectorTransition,
  TRANSITION_WINDOW_TURNS,
} from "./transitionRules";

const mismatched: SectorTransition = {
  mismatched: true,
  legacyRevenueAnchor: 100,
  fundedRevenueAnchor: 20,
  basisTurns: 5,
};

const matched: SectorTransition = { ...mismatched, mismatched: false };

describe("strugglingReason", () => {
  it("reports zero sales when nothing sold", () => {
    expect(strugglingReason({ soldUnits: 0, profit: -5 })).toBe("zeroSales");
    expect(strugglingReason({ soldUnits: 0, profit: 0 })).toBe("zeroSales");
  });

  it("reports losing when units sold at a loss", () => {
    expect(strugglingReason({ soldUnits: 12, profit: -0.01 })).toBe("losing");
  });

  it("reports nothing when the sector made money", () => {
    expect(strugglingReason({ soldUnits: 12, profit: 0 })).toBeNull();
    expect(strugglingReason({ soldUnits: 12, profit: 42 })).toBeNull();
  });
});

describe("transitionReliefEligible", () => {
  it("is eligible when the opening classification is over-built", () => {
    expect(transitionReliefEligible({ cutoverTransition: mismatched })).toBe(true);
  });

  it("is eligible when marked struggling since the switch", () => {
    expect(
      transitionReliefEligible({ cutoverStruggling: { sinceTurn: 101, reason: "losing" } })
    ).toBe(true);
  });

  it("is not eligible with neither mark", () => {
    expect(transitionReliefEligible({ cutoverTransition: matched })).toBe(false);
    expect(transitionReliefEligible({})).toBe(false);
  });
});

describe("freeTransitionConversion", () => {
  const struggling = { cutoverStruggling: { sinceTurn: 101, reason: "zeroSales" } as const };

  it("is free for a struggling sector inside the window", () => {
    expect(freeTransitionConversion(struggling, 101, 100)).toBe(true);
    expect(freeTransitionConversion(struggling, 100 + TRANSITION_WINDOW_TURNS - 1, 100)).toBe(true);
  });

  it("is not free once the sector already converted", () => {
    expect(freeTransitionConversion({ ...struggling, cutoverConvertedAtTurn: 101 }, 102, 100)).toBe(
      false
    );
  });

  it("is not free outside the window", () => {
    expect(freeTransitionConversion(struggling, 99, 100)).toBe(false);
    expect(freeTransitionConversion(struggling, 100 + TRANSITION_WINDOW_TURNS, 100)).toBe(false);
    expect(freeTransitionConversion(struggling, 101, undefined)).toBe(false);
  });
});
