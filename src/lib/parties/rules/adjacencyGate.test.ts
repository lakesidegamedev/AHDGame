import { describe, expect, it } from "vitest";
import { partyAdjacencyEnabled, partyGrowthRegions } from "./adjacencyGate";

describe("party adjacency switch", () => {
  it.each([undefined, null, {}, { partyAdjacencyEnabled: true }])(
    "defaults enabled for %j",
    (config) => {
      expect(partyAdjacencyEnabled(config)).toBe(true);
    }
  );
  it("opens only the supplied country's regions when explicitly disabled", () => {
    expect(partyAdjacencyEnabled({ partyAdjacencyEnabled: false })).toBe(false);
    expect([...partyGrowthRegions(["NY"], ["NY", "CA"], false)]).toEqual(["NY", "CA"]);
    expect([...partyGrowthRegions(["NY"], ["NY", "CA"], true)]).toEqual(["NY"]);
  });
});
