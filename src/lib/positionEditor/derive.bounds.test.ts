import { describe, expect, it } from "vitest";
import { getUkModel } from "@/lib/countries/uk/layer1Model";
import { computeDerivedComposition, editorConfigFromCountryModel } from "./derive";

describe("regional position editor bounds", () => {
  it.each([5, -5])(
    "keeps the preview inside the lean axis when every position is pushed to %s",
    (pin) => {
      const config = editorConfigFromCountryModel(getUkModel("1991"), "LON", "1991");
      for (const entries of Object.values(config.layer1)) {
        for (const entry of Object.values(entries)) {
          entry.economicLean = pin;
          entry.socialLean = -pin;
        }
      }

      const derived = computeDerivedComposition(config);
      expect(Number.isFinite(derived.stateEconomicLean)).toBe(true);
      expect(derived.stateEconomicLean).toBeLessThanOrEqual(5);
      expect(derived.stateEconomicLean).toBeGreaterThanOrEqual(-5);
      expect(derived.stateSocialLean).toBeLessThanOrEqual(5);
      expect(derived.stateSocialLean).toBeGreaterThanOrEqual(-5);
      for (const section of derived.buckets) {
        for (const bucket of section.buckets) {
          expect(Math.abs(bucket.economicLean)).toBeLessThanOrEqual(5 + 1e-9);
          expect(Math.abs(bucket.socialLean)).toBeLessThanOrEqual(5 + 1e-9);
        }
      }
    }
  );

  it("is deterministic for the same config", () => {
    const config = editorConfigFromCountryModel(getUkModel("1991"), "LON", "1991");
    expect(computeDerivedComposition(config)).toEqual(computeDerivedComposition(config));
  });
});
