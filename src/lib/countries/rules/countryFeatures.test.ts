import { describe, expect, it } from "vitest";
import { COUNTRY_FEATURES, countryHasFeature } from "./countryFeatures";

describe("countryHasFeature", () => {
  it("accepts listed countries and rejects others", () => {
    expect(countryHasFeature("ukRecall", "UK")).toBe(true);
    expect(countryHasFeature("ukRecall", "US")).toBe(false);
    expect(countryHasFeature("supremeCourtDocket", undefined)).toBe(false);
  });
  it("every feature lists at least one country", () => {
    for (const list of Object.values(COUNTRY_FEATURES)) expect(list.length).toBeGreaterThan(0);
  });
});
