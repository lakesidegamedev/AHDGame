import { describe, expect, it } from "vitest";
import { frontierResearchByLane } from "./frontierResearch";

describe("frontierResearchByLane", () => {
  it("sums each sector type's corporations", () => {
    const totals = frontierResearchByLane([
      { type: "energy", total: 1200 },
      { type: "energy", total: 300 },
      { type: "manufacturing", total: 40 },
      { type: "media", total: 70 },
    ]);
    expect(totals.get("energy")).toBe(1500);
    expect(totals.get("manufacturing")).toBe(40);
    expect(totals.get("media")).toBe(70);
  });

  it("drops rows with no type or a non-positive total", () => {
    const totals = frontierResearchByLane([
      { type: null, total: 900 },
      { type: "energy", total: 0 },
      { type: "energy", total: Number.NaN },
    ]);
    expect(totals.size).toBe(0);
  });
});
