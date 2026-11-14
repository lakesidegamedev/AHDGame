import { expect, it } from "vitest";
import { selectNppOppositionLeader as select } from "./nppOpposition";
it("respects governing exclusions, live actors, seat weights and an existing larger chair or coalition", () => {
  const input = {
    members: [
      { nppId: "a", party: "1", seats: 169 },
      { nppId: "b", party: "2", seats: 52 },
      { nppId: "c", party: "2", seats: 40 },
    ],
    seatsByParty: { "1": 169, "2": 144 },
    eligiblePartyIds: new Set(["2"]),
    liveNppIds: new Set(["a", "b", "c"]),
    competingLeaderSeats: 0,
  };
  expect(select(input)).toEqual({ nppId: "b", party: "2" });
  expect(select({ ...input, liveNppIds: new Set(["a", "c"]) })).toEqual({ nppId: "c", party: "2" });
  expect(select({ ...input, competingLeaderSeats: 150 })).toBeNull();
  expect(select({ ...input, eligiblePartyIds: new Set<string>() })).toBeNull();
});
