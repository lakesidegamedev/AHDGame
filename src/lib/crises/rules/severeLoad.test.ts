import { describe, expect, it } from "vitest";
import { countsAsSevereCrisis, mergeSevereLoads, severeLoadByCountry } from "./severeLoad";

describe("severe crisis stacking rules", () => {
  it("does not count opportunities, world-scoped crises or conflict response windows", () => {
    expect(countsAsSevereCrisis({ scope: "country", countryIds: ["US"] })).toBe(true);
    expect(countsAsSevereCrisis({ scope: "region", countryIds: ["US"] })).toBe(true);
    expect(countsAsSevereCrisis({ scope: "country", countryIds: ["US"], opportunity: true })).toBe(
      false
    );
    expect(countsAsSevereCrisis({ scope: "global", countryIds: [] })).toBe(false);
    expect(
      countsAsSevereCrisis({ scope: "country", countryIds: ["US"], livingConflictEventId: "x:1" })
    ).toBe(false);
  });

  it("counts crisis templates and living conflicts together, once per item per country", () => {
    const load = severeLoadByCountry(
      [
        { scope: "region", countryIds: ["US", "US"] },
        { scope: "country", countryIds: ["UK"], opportunity: true },
      ],
      [["US", "CN"], ["CN"]]
    );
    expect(load.get("US")).toBe(2);
    expect(load.get("CN")).toBe(2);
    expect(load.has("UK")).toBe(false);
  });

  it("merges two load maps without mutating either", () => {
    const a = new Map([["US", 1]]);
    const b = new Map([
      ["US", 1],
      ["JP", 1],
    ]);
    const merged = mergeSevereLoads(a, b);
    expect(merged.get("US")).toBe(2);
    expect(merged.get("JP")).toBe(1);
    expect(a.get("US")).toBe(1);
  });
});
