import { describe, expect, it } from "vitest";
import { formatRaceInRegion, formatRaceRegion } from "./raceLocationLabel";

describe("raceLocationLabel", () => {
  it("names the race type and US state instead of raw ids", () => {
    expect(formatRaceInRegion("stateSenate", "OH")).toBe("State Senate race in Ohio");
  });

  it("falls back to the id for an unknown US region", () => {
    expect(formatRaceRegion("ZZ")).toBe("ZZ");
  });

  it("leaves no run-together words", () => {
    expect(formatRaceInRegion("stateSenate", "OH")).not.toMatch(/inOH|StateSenateelection/);
  });
});
