import { describe, expect, it } from "vitest";
import { electorateUnitsByRegion } from "./electorateWeights";

describe("electorateUnitsByRegion", () => {
  it("returns census voter units keyed by country and region", () => {
    const out = electorateUnitsByRegion([{ _id: "DUB", countryId: "IE" }], new Map(), {
      preset: "2019-default",
    });
    const units = out.get("IE:DUB")!;
    expect(units.length).toBeGreaterThan(0);
    expect(units.reduce((sum, u) => sum + u.population, 0)).toBeCloseTo(100, 6);
    for (const unit of units) {
      expect(Number.isFinite(unit.economicLean)).toBe(true);
      expect(Number.isFinite(unit.socialLean)).toBe(true);
    }
  });

  it("leaves a region without census cells out", () => {
    const out = electorateUnitsByRegion([{ _id: "NOWHERE", countryId: "IE" }], new Map(), {
      preset: "2019-default",
    });
    expect(out.has("IE:NOWHERE")).toBe(false);
  });
});
