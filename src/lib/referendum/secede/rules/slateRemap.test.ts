import { describe, expect, it } from "vitest";
import { groupRemappedSlates, groupSlateCandidates } from "./slateRemap";

describe("conversion slate consolidation", () => {
  it("merges only identical final country, party and election keys deterministically", () => {
    const rows = [
      { id: "b", countryId: "WAL", partyId: "independent", electionId: "e1" },
      { id: "a", countryId: "WAL", partyId: "independent", electionId: "e1" },
      { id: "c", countryId: "WAL", partyId: "independent", electionId: "e2" },
      { id: "d", countryId: "SCO", partyId: "independent", electionId: "e1" },
      { id: "e", countryId: "WAL", partyId: "1", electionId: "e1" },
    ];
    expect(groupRemappedSlates(rows).map((group) => group.map((row) => row.id))).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
      ["e"],
    ]);
  });
  it("retains the furthest progressed candidate when planning rows collide", () => {
    const rows = ["invited", "withdrawn", "accepted", "filed"].map((status, index) => ({
      id: String(index),
      candidateId: "person",
      status,
    }));
    expect(groupSlateCandidates(rows)[0].map((row) => row.status)).toEqual([
      "filed",
      "accepted",
      "invited",
      "withdrawn",
    ]);
  });
});
