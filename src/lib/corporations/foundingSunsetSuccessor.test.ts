import { describe, expect, it } from "vitest";
import { foundingSunsetSuccessor } from "./foundingSunsetSuccessor";

const energyCorp = { type: "energy" as const, unlockedTechNodeIds: [] };

describe("foundingSunsetSuccessor", () => {
  it("keeps the lane default before its sunset", () => {
    expect(
      foundingSunsetSuccessor({
        lane: "energy",
        corporation: energyCorp,
        currentYear: 2035,
        techTreesEnabled: true,
      })
    ).toBeNull();
  });

  it("founds on the first successor this corporation can run once the default retires", () => {
    // Advanced fission needs the corporation's own 2039 node; renewables is
    // inherited from a past decade.
    expect(
      foundingSunsetSuccessor({
        lane: "energy",
        corporation: energyCorp,
        currentYear: 2041,
        techTreesEnabled: true,
      })
    ).toBe("renewables");
    expect(
      foundingSunsetSuccessor({
        lane: "energy",
        corporation: { ...energyCorp, unlockedTechNodeIds: ["energy-2039-6"] },
        currentYear: 2041,
        techTreesEnabled: true,
      })
    ).toBe("advanced_fission");
  });

  it("changes nothing with tech trees off", () => {
    expect(
      foundingSunsetSuccessor({
        lane: "energy",
        corporation: energyCorp,
        currentYear: 2041,
        techTreesEnabled: false,
      })
    ).toBeNull();
  });
});
