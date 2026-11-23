import { describe, expect, it } from "vitest";
import { CREDIT_RATING_WEIGHTS, calculateCreditScore } from "@/lib/constants/bonds";
import { resolveCreditStanding, weightedComponentComposite } from "./creditStanding";

describe("resolveCreditStanding", () => {
  it("prefers the live rating and composite so every screen agrees with the Credit tab", () => {
    expect(
      resolveCreditStanding(
        { creditRatingSnapshot: "AAA", creditCompositeSnapshot: 98 },
        { rating: "AA", compositeScore: 98 }
      )
    ).toEqual({ rating: "AA", composite: 98 });
  });

  it("falls back to the snapshot when the live calculation is missing", () => {
    expect(
      resolveCreditStanding({ creditRatingSnapshot: "A", creditCompositeSnapshot: 70 }, null)
    ).toEqual({ rating: "A", composite: 70 });
    expect(resolveCreditStanding({}, undefined)).toEqual({ rating: null, composite: null });
  });
});

describe("weightedComponentComposite", () => {
  it("matches the raw composite the scorer produces before smoothing", () => {
    const score = calculateCreditScore(5_000_000, 10_000_000, 4_000_000, 700_000, 60_000_000);
    expect(weightedComponentComposite(score.components, CREDIT_RATING_WEIGHTS)).toBeGreaterThan(0);
    expect(
      Math.abs(
        weightedComponentComposite(score.components, CREDIT_RATING_WEIGHTS) - score.compositeScore
      )
    ).toBeLessThanOrEqual(1);
  });

  it("is the baseline the what-if reproduces at zero change", () => {
    const args = [5_000_000, 10_000_000, 4_000_000, 700_000, 60_000_000] as const;
    const whatIf = calculateCreditScore(...args);
    const live = calculateCreditScore(...args, { persistedCompositeScore: 98 });
    expect(whatIf.components).toEqual(live.components);
    expect(weightedComponentComposite(live.components, CREDIT_RATING_WEIGHTS)).toBe(
      whatIf.compositeScore
    );
  });

  it("applies the same ownership notch in the what-if as on the Credit tab", () => {
    const args = [5_000_000, 10_000_000, 4_000_000, 700_000, 60_000_000] as const;
    const plain = calculateCreditScore(...args);
    const notched = calculateCreditScore(...args, { insiderConcentrationPenalty: true });
    expect(notched.compositeScore).toBe(plain.compositeScore);
    expect(notched.rating).not.toBe(plain.rating === "CCC" ? "CCC" : plain.rating);
  });

  it("does not pair a live rating with a snapshot score from a different rating", () => {
    const snapshot = { creditRatingSnapshot: "AA", creditCompositeSnapshot: 88 };
    expect(resolveCreditStanding(snapshot, { rating: "AAA" })).toEqual({
      rating: "AAA",
      composite: null,
    });
    expect(resolveCreditStanding(snapshot, { rating: "AA" })).toEqual({
      rating: "AA",
      composite: 88,
    });
    expect(resolveCreditStanding(snapshot, { rating: "AAA", compositeScore: 100 })).toEqual({
      rating: "AAA",
      composite: 100,
    });
  });
});
