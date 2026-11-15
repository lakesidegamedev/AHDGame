import { describe, expect, it } from "vitest";
import { planCaElectionBench } from "./electionBench";

const input = {
  preset: "2027-default",
  startingPartiesMode: "default",
  regionalRaceCount: 3,
  regions: [
    { _id: "CA_AB", countryId: "CA" },
    { _id: "CA", countryId: "US" },
  ],
  parties: [
    { sequentialId: 1, countryId: "CA", isDefault: true },
    { sequentialId: 1, countryId: "US", isDefault: true },
  ],
  orgs: [{ countryId: "CA", stateId: "CA_AB", partyId: "1", hasPresence: true }],
  actors: [],
  busyActorIds: new Set<string>(),
};
describe("Canadian regional candidate supply", () => {
  it("sizes by concurrent races and isolates country, region and party identity", () => {
    expect(planCaElectionBench(input)).toEqual([{ regionId: "CA_AB", partyId: "1", count: 3 }]);
    const actor = { id: "idle", countryId: "CA", homeState: "CA_AB", party: "1", retired: false };
    expect(
      planCaElectionBench({
        ...input,
        actors: [
          actor,
          { ...actor, id: "busy" },
          { ...actor, id: "retired", retired: true },
          { ...actor, id: "banker", isTechnocrat: true },
          { ...actor, id: "foreign", countryId: "US" },
        ],
        busyActorIds: new Set(["busy"]),
      })
    ).toEqual([{ regionId: "CA_AB", partyId: "1", count: 2 }]);
    expect(
      planCaElectionBench({
        ...input,
        actors: [actor, { ...actor, id: "two" }, { ...actor, id: "three" }],
      })
    ).toEqual([]);
  });
  it("preserves historical presets, No NPPs, No Parties and regional presence", () => {
    for (const startingPartiesMode of ["none", "no-npps"])
      expect(planCaElectionBench({ ...input, startingPartiesMode })).toEqual([]);
    expect(planCaElectionBench({ ...input, preset: "1991-default" })).toEqual([]);
    expect(
      planCaElectionBench({ ...input, orgs: [{ ...input.orgs[0], hasPresence: false }] })
    ).toEqual([]);
  });
});
