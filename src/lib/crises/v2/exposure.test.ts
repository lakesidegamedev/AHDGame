import { describe, expect, it } from "vitest";
import { filterExposedHolders, holderExposed, type CrisisReach } from "./exposure";

const regional: CrisisReach = { scope: "state", stateIds: new Set(["TX"]) };
const national: CrisisReach = { scope: "national", stateIds: new Set(["TX", "OH"]) };

describe("holderExposed", () => {
  it("blames a governor only for a regional crisis in their state", () => {
    expect(holderExposed("stateGovernor", { stateId: "TX" }, regional)).toBe(true);
    expect(holderExposed("stateGovernor", { stateId: "OH" }, regional)).toBe(false);
    expect(holderExposed("stateGovernor", undefined, regional)).toBe(false);
    expect(holderExposed("stateGovernor", { stateId: "OH" }, national)).toBe(true);
  });

  it("blames a CEO only when a corporation operates in an affected region and sector", () => {
    const holdings = [{ stateId: "TX", sectorType: "energy" }];
    expect(holderExposed("corpCeo", { holdings }, regional)).toBe(true);
    expect(holderExposed("corpCeo", { holdings }, { ...regional, sectors: ["energy"] })).toBe(true);
    expect(holderExposed("corpCeo", { holdings }, { ...regional, sectors: ["retail"] })).toBe(
      false
    );
    expect(
      holderExposed("corpCeo", { holdings: [{ stateId: "OH", sectorType: "energy" }] }, regional)
    ).toBe(false);
    expect(holderExposed("corpCeo", undefined, regional)).toBe(false);
  });

  it("holds party leaders and the legislature to national and global crises only", () => {
    for (const role of ["partyLeader", "legislature"] as const) {
      expect(holderExposed(role, undefined, regional)).toBe(false);
      expect(holderExposed(role, undefined, national)).toBe(true);
      expect(holderExposed(role, undefined, { ...national, scope: "global" })).toBe(true);
    }
  });

  it("always counts the head of state", () => {
    expect(holderExposed("headOfState", undefined, regional)).toBe(true);
  });
});

describe("filterExposedHolders", () => {
  it("drops unexposed holders and empty roles", () => {
    const footprints = new Map([
      ["g1", { stateId: "TX" }],
      ["g2", { stateId: "OH" }],
    ]);
    const kept = filterExposedHolders(
      { headOfState: ["h"], stateGovernor: ["g1", "g2"], partyLeader: ["p"] },
      footprints,
      regional
    );
    expect(kept).toEqual({ headOfState: ["h"], stateGovernor: ["g1"] });
  });
});
