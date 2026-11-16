import { describe, expect, it } from "vitest";
import { SOVEREIGNTY_REGIONS } from "@/lib/referendum/rules/sovereigntyRegions";
import { buildApportionment } from "@/lib/elections/apportionment";
import { liveSingleTierChamber } from "./liveChamber";
import {
  departedRegions,
  departedStateIds,
  upperChamberSeatsAfterDepartures,
} from "./departedRegions";

const texas = SOVEREIGNTY_REGIONS.find((entry) => entry.regionId === "TX")!;
const actuating = [{ ...texas, actuates: true }];

describe("departedRegions", () => {
  it("counts a region whose successor country now holds regions", () => {
    expect(departedRegions(actuating, "US", new Set(["RTX"]))).toHaveLength(1);
  });
  it("ignores a region whose successor holds nothing, and a latent entry", () => {
    expect(departedRegions(actuating, "US", new Set())).toEqual([]);
    expect(departedRegions(actuating, "US", new Set(["RCA"]))).toEqual([]);
    expect(departedRegions([{ ...texas, actuates: false }], "US", new Set(["RTX"]))).toEqual([]);
  });
});

describe("a US state leaving", () => {
  it("takes two seats off the Senate", () => {
    expect(upperChamberSeatsAfterDepartures(100, actuating)).toBe(98);
    expect(upperChamberSeatsAfterDepartures(100, [])).toBe(100);
  });

  it("shrinks the House by the state's seats", () => {
    const surviving = 435 - 38;
    expect(liveSingleTierChamber("US", surviving, 435, new Set(["US"]))).toBe(397);
    expect(liveSingleTierChamber("US", surviving, 435, new Set())).toBe(435);
  });

  it("removes the state's electors from the college", () => {
    const before = buildApportionment({}, "2027-default", 2027);
    const after = buildApportionment({}, "2027-default", 2027, undefined, ["TX"]);
    const texasElectors = before.electoralVotes.TX;
    expect(texasElectors).toBe(before.houseSeats.TX + 2);
    expect(after.electoralVotes.TX).toBeUndefined();
    expect(after.houseSeats.TX).toBeUndefined();
    const sum = (ev: Record<string, number>) => Object.values(ev).reduce((a, b) => a + b, 0);
    expect(sum(before.electoralVotes) - sum(after.electoralVotes)).toBe(texasElectors);
    expect(after.electoralVoteUnits.some((unit) => unit.stateId === "TX")).toBe(false);
  });
});

describe("the live registry once Texas can leave", () => {
  it("takes two senators off once the Republic of Texas holds regions", () => {
    const departed = departedRegions(SOVEREIGNTY_REGIONS, "US", new Set(["RTX"]));
    expect(departed.map((entry) => entry.regionId)).toEqual(["TX"]);
    expect(upperChamberSeatsAfterDepartures(100, departed)).toBe(98);
  });

  it("takes twelve senators off once New England holds regions", () => {
    const departed = departedRegions(SOVEREIGNTY_REGIONS, "US", new Set(["NEN"]));
    expect(departed.map((entry) => entry.regionId)).toEqual(["NE_BLOC"]);
    expect(departedStateIds(departed)).toEqual(["ME", "NH", "VT", "MA", "RI", "CT"]);
    expect(upperChamberSeatsAfterDepartures(100, departed)).toBe(88);
  });

  it("treats a partly seeded world as whole: missing states are not departures", () => {
    expect(departedRegions(SOVEREIGNTY_REGIONS, "US", new Set())).toEqual([]);
  });

  it("shrinks the House for the US once Texas can actuate", () => {
    expect(liveSingleTierChamber("US", 435 - 38, 435)).toBe(397);
  });
});
