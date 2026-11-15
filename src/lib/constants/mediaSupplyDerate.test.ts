import { describe, it, expect } from "vitest";
import { getStrategy, plannedEconomyMediaSupplyFactor } from "./sectorStrategies";

describe("planned-economy media output", () => {
  it("keeps selling advertising: there is no separate state media commodity", () => {
    expect(getStrategy("media", "standard").supply).toEqual({ advertising: 0.5 });
  });
});

describe("plannedEconomyMediaSupplyFactor", () => {
  it("derates media in both economy types, and nothing but media", () => {
    // Bloc media was seeded about 4x what a state media budget funds; market
    // media nameplate is ~20x the advertising market, so its derate is deeper.
    expect(plannedEconomyMediaSupplyFactor("media", true)).toBe(0.25);
    expect(plannedEconomyMediaSupplyFactor("media", false)).toBe(0.1);
    expect(plannedEconomyMediaSupplyFactor("agriculture", true)).toBe(1);
    expect(plannedEconomyMediaSupplyFactor("agriculture", false)).toBe(1);
  });
});
