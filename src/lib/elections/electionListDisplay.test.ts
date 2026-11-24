import { describe, expect, it } from "vitest";
import type { ElectionResponse } from "@/lib/elections/resolveElection";
import { toElectionListDisplay } from "./electionDisplay";

describe("toElectionListDisplay", () => {
  it("drops fields the elections list never renders and keeps the rest", () => {
    const response = {
      id: "e1",
      electionType: "governor",
      state: "AK",
      cycle: 1,
      status: "active",
      candidates: [
        {
          id: "c1",
          characterId: "ch1",
          characterName: "A",
          avatarUrl: "/a.png",
          party: "1",
          partyName: "Party",
          partyColor: "#fff",
          isNPP: false,
          endorsements: [{ type: "npp", nppId: "n", nppName: "N" }],
        },
      ],
      polling: {
        leaderId: "c1",
        leaderName: "A",
        leaderParty: "1",
        sharesPct: { c1: 100 },
        candidateNames: { c1: "A" },
        candidateParties: { c1: "1" },
        source: "general",
      },
      primaryVotes: { c1: 3 },
    } as unknown as ElectionResponse;

    const out = toElectionListDisplay(response);
    expect(out.candidates[0]).toEqual({
      id: "c1",
      characterId: "ch1",
      characterName: "A",
      party: "1",
      partyName: "Party",
      partyColor: "#fff",
      isNPP: false,
    });
    expect(out.primaryVotes).toBeUndefined();
    expect(out.polling?.candidateNames).toEqual({});
    expect(out.polling?.leaderId).toBe("c1");
    expect(out.polling?.sharesPct).toEqual({ c1: 100 });
  });
});
