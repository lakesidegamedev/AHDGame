import { describe, expect, it } from "vitest";
import { frontierResearchByLane } from "./frontierResearch";

describe("frontierResearchByLane", () => {
  it("sums each lane's corporations and keeps folded lanes apart", () => {
    const totals = frontierResearchByLane([
      { type: "energy", industryModel: null, mediaDiscriminator: null, total: 1200 },
      { type: "energy", total: 300 },
      { type: "manufacturing", industryModel: "vehicles", total: 500 },
      { type: "manufacturing", industryModel: null, total: 40 },
      { type: "media", mediaDiscriminator: "entertainment", total: 70 },
    ]);
    expect(totals.get("energy")).toBe(1500);
    expect(totals.get("manufacturing_vehicles")).toBe(500);
    expect(totals.get("manufacturing")).toBe(40);
    expect(totals.get("media_entertainment")).toBe(70);
    expect(totals.has("media")).toBe(false);
  });

  it("drops rows with no type, a non-positive total or an identity no lane owns", () => {
    const totals = frontierResearchByLane([
      { type: null, total: 900 },
      { type: "energy", total: 0 },
      { type: "energy", total: Number.NaN },
      { type: "energy", mediaDiscriminator: "entertainment", total: 900 },
    ]);
    expect(totals.size).toBe(0);
  });
});
