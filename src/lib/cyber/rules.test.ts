import { describe, expect, it } from "vitest";
import {
  CYBER_MANDATE_BONUS,
  CYBER_MANDATE_NEUTRAL_INDEX,
  cyberMandateBonus,
  cyberResilienceScore,
  technologyReadiness,
} from "./rules";
import { cyberAnnualProbability } from "@/lib/livingConflict/rules/futureConflicts";

const base = { utilities: 60, rdIntensity: 2.5, mandateOptionIndex: null };

describe("cyberResilienceScore", () => {
  it("stays inside 0..1 at every extreme", () => {
    for (const utilities of [0, 50, 100, 400]) {
      for (const rdIntensity of [null, 0, 2, 10]) {
        for (const mandateOptionIndex of [null, 0, 3, 6]) {
          const score = cyberResilienceScore({ utilities, rdIntensity, mandateOptionIndex })!;
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("is null for a country with no regional board", () => {
    expect(cyberResilienceScore({ ...base, utilities: null })).toBeNull();
  });

  it("rises with a stronger mandate and falls when duties are withdrawn", () => {
    const at = (mandateOptionIndex: number) => cyberResilienceScore({ ...base, mandateOptionIndex })!;
    expect(at(0)).toBeGreaterThan(at(1));
    expect(at(1)).toBeGreaterThan(at(2));
    expect(at(2)).toBeGreaterThan(at(CYBER_MANDATE_NEUTRAL_INDEX));
    expect(at(6)).toBeLessThan(at(CYBER_MANDATE_NEUTRAL_INDEX));
    expect(at(CYBER_MANDATE_NEUTRAL_INDEX)).toBe(cyberResilienceScore(base));
  });

  it("rises with technology readiness and utilities", () => {
    expect(cyberResilienceScore({ ...base, rdIntensity: 3.5 })!).toBeGreaterThan(
      cyberResilienceScore({ ...base, rdIntensity: 1 })!
    );
    expect(cyberResilienceScore({ ...base, utilities: 80 })!).toBeGreaterThan(
      cyberResilienceScore({ ...base, utilities: 30 })!
    );
  });

  it("makes a funded mandate lower the yearly cyberattack chance", () => {
    const none = cyberResilienceScore(base);
    const command = cyberResilienceScore({ ...base, mandateOptionIndex: 0 });
    expect(cyberAnnualProbability(60, { countryId: "DE", resilience: command })).toBeLessThan(
      cyberAnnualProbability(60, { countryId: "DE", resilience: none })
    );
  });
});

describe("inputs", () => {
  it("has one bonus per mandate option with a neutral centre", () => {
    expect(CYBER_MANDATE_BONUS).toHaveLength(7);
    expect(cyberMandateBonus(CYBER_MANDATE_NEUTRAL_INDEX)).toBe(0);
    expect(cyberMandateBonus(null)).toBe(0);
    expect(cyberMandateBonus(99)).toBe(0);
  });

  it("caps technology readiness and defaults it when unrecorded", () => {
    expect(technologyReadiness(8)).toBe(1);
    expect(technologyReadiness(0)).toBe(0);
    expect(technologyReadiness(null)).toBeGreaterThan(0);
  });
});
