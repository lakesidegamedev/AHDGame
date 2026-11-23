import { describe, expect, it } from "vitest";
import {
  QUALITY_NEUTRAL_INPUT,
  computeSectorQuality,
  estimateQualityAfterTechScore,
  isExtractionOnly,
  rollupCorpQuality,
} from "./brandQuality";

describe("isExtractionOnly", () => {
  it("true only when every output is a raw extractable", () => {
    expect(isExtractionOnly(["iron", "coal"])).toBe(true);
    expect(isExtractionOnly(["iron", "steel"])).toBe(false);
    expect(isExtractionOnly(["vehicles"])).toBe(false);
    expect(isExtractionOnly([])).toBe(false);
  });
});

describe("computeSectorQuality", () => {
  it("returns null for extraction-only sectors (no quality dimension)", () => {
    expect(
      computeSectorQuality({
        techScore: 40,
        wageLevel: 1,
        operationsStrength: 40,
        outputCommodities: ["iron"],
      })
    ).toBeNull();
  });

  it("at all-par inputs yields a mid quality", () => {
    const q = computeSectorQuality({
      techScore: 40,
      wageLevel: 1,
      operationsStrength: 40,
      inputQuality: QUALITY_NEUTRAL_INPUT,
      outputCommodities: ["vehicles"],
    })!;
    // tech=1, ops=1, wage=0.5, inputs=0.5 → geo = 1^.4·.5^.2·.5^.2·1^.2 = .5^.4 ≈ 0.758
    expect(q).toBeGreaterThan(60);
    expect(q).toBeLessThan(85);
  });

  it("higher tech raises quality; SUBSTITUTES for poor inputs (not gated)", () => {
    const poorInputs = {
      wageLevel: 1,
      operationsStrength: 40,
      inputQuality: 10,
      outputCommodities: ["vehicles"] as const,
    };
    const lowTech = computeSectorQuality({ techScore: 10, ...poorInputs })!;
    const highTech = computeSectorQuality({ techScore: 160, ...poorInputs })!;
    expect(highTech).toBeGreaterThan(lowTech);
    // Even with terrible inputs (10), high tech keeps quality well above zero — not gated.
    expect(highTech).toBeGreaterThan(30);
  });

  it("higher wages raise quality (efficiency wage)", () => {
    const base = {
      techScore: 40,
      operationsStrength: 40,
      inputQuality: 50,
      outputCommodities: ["food"] as const,
    };
    const lowWage = computeSectorQuality({ wageLevel: 0.8, ...base })!;
    const highWage = computeSectorQuality({ wageLevel: 1.4, ...base })!;
    expect(highWage).toBeGreaterThan(lowWage);
  });

  it("no single bad pillar collapses quality to zero (floor)", () => {
    const q = computeSectorQuality({
      techScore: 0,
      wageLevel: 0.5,
      operationsStrength: 0,
      inputQuality: 0,
      outputCommodities: ["electronics"],
    })!;
    expect(q).toBeGreaterThan(0);
  });
});

describe("rollupCorpQuality", () => {
  it("revenue-weights across quality-bearing sectors, skipping nulls", () => {
    const q = rollupCorpQuality([
      { quality: 80, revenueWeight: 100 },
      { quality: 40, revenueWeight: 100 },
      { quality: null, revenueWeight: 500 }, // extraction sector — ignored
    ]);
    expect(q).toBeCloseTo(60, 5);
  });
  it("returns null when the corp has no quality-bearing sectors", () => {
    expect(rollupCorpQuality([{ quality: null, revenueWeight: 100 }])).toBeNull();
    expect(rollupCorpQuality([])).toBeNull();
  });
});

describe("estimateQualityAfterTechScore", () => {
  it("drops quality by the tech pillar ratio to the tech weight", () => {
    const after = estimateQualityAfterTechScore(79, 42, 4);
    expect(after).toBeCloseTo(79 * Math.pow(0.4, 0.4), 1);
  });
  it("is unchanged when the score does not move", () => {
    expect(estimateQualityAfterTechScore(60, 10, 10)).toBe(60);
  });
  it("does not exceed the pillar floor when R&D goes to zero", () => {
    expect(estimateQualityAfterTechScore(80, 25, 0)).toBeCloseTo(80 * Math.pow(0.1, 0.4), 1);
  });
});
