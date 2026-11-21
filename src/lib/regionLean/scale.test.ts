import { describe, expect, it } from "vitest";
import { countryLeanScale, regionLeanDisplay } from "./scale";

const canada = [
  {
    id: "16",
    name: "Liberal Party of Canada",
    economicPosition: -1,
    socialPosition: -2,
    isDefault: true,
  },
  {
    id: "17",
    name: "Conservative Party of Canada",
    economicPosition: 3,
    socialPosition: 1,
    isDefault: true,
  },
  {
    id: "18",
    name: "New Democratic Party",
    economicPosition: -3,
    socialPosition: -3,
    isDefault: true,
  },
];
const us = [
  {
    id: "1",
    name: "Democratic Party",
    economicPosition: -2,
    socialPosition: -2,
    isDefault: true,
    memberCount: 10,
  },
  {
    id: "2",
    name: "Republican Party",
    economicPosition: 2,
    socialPosition: 2,
    isDefault: true,
    memberCount: 9,
  },
];

describe("countryLeanScale", () => {
  it("centres each axis on the two main parties it labels against", () => {
    const scale = countryLeanScale(us);
    expect(scale.center.economicLean).toBe(0);
    expect(scale.center.socialLean).toBe(0);
  });

  it("uses the same pair as the party-lean label", () => {
    const scale = countryLeanScale(canada);
    const ids = [scale.main?.low.id, scale.main?.high.id].sort();
    const low = canada.find((p) => p.id === scale.main?.low.id)!;
    const high = canada.find((p) => p.id === scale.main?.high.id)!;
    expect(ids).toHaveLength(2);
    expect(scale.center.economicLean).toBeCloseTo(
      (low.economicPosition + high.economicPosition) / 2
    );
    expect(scale.center.socialLean).toBeCloseTo((low.socialPosition + high.socialPosition) / 2);
    expect(scale.center.displayLean).toBeCloseTo(scale.main!.evenSplit);
  });

  it("falls back to a zero centre without two usable parties", () => {
    const scale = countryLeanScale([]);
    expect(scale.main).toBeNull();
    expect(scale.center).toEqual({ economicLean: 0, socialLean: 0, displayLean: 0 });
  });
});

describe("regionLeanDisplay", () => {
  it("returns tones relative to the centre and the party-lean label", () => {
    const shown = regionLeanDisplay(countryLeanScale(us), 1.52, 1.42);
    expect(shown.economicTone).toBeCloseTo(1.52);
    expect(shown.label).toMatch(/Republican/);
    const swing = regionLeanDisplay(countryLeanScale(us), 0.05, 0.04);
    expect(swing.label).toBe("Swing");
  });
});
