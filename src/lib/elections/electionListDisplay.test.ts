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
      characterName: "",
      party: "",
    });
    expect(out.primaryVotes).toBeUndefined();
    expect(out.polling?.candidateNames).toEqual({});
    expect(out.polling?.leaderId).toBe("c1");
    expect(out.polling?.sharesPct).toEqual({ c1: 100 });
  });

  const race = (electionType: string) =>
    ({
      id: "e2",
      electionType,
      state: "UK",
      cycle: 1,
      status: "active",
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-01-02T00:00:00.000Z",
      primaryEndTime: "2026-01-01T12:00:00.000Z",
      candidates: [
        {
          id: "c1",
          characterId: "ch1",
          characterName: "A",
          party: "1",
          partyName: "P1",
          partyColor: "#111",
          isNPP: false,
        },
        {
          id: "c2",
          characterId: "npp-owner",
          characterName: "B",
          party: "2",
          partyName: "P2",
          partyColor: "#222",
          isNPP: true,
        },
      ],
      polling: {
        leaderId: "c2",
        leaderName: "B",
        leaderParty: "2",
        sharesPct: { c1: 40, c2: 60 },
        candidateNames: { c1: "A", c2: "B" },
        candidateParties: { c1: "1", c2: "2" },
        candidatePartyNames: { c1: "P1", c2: "P2" },
        candidatePartyColors: { c1: "#111", c2: "#222" },
        source: "general",
      },
    }) as unknown as ElectionResponse;

  it("keeps only the leader's party entries and the viewer's own-race key", () => {
    const out = toElectionListDisplay(race("senate"));
    expect(out.polling?.candidateParties).toEqual({ c2: "2" });
    expect(out.polling?.candidatePartyNames).toEqual({ c2: "P2" });
    expect(out.polling?.candidatePartyColors).toEqual({ c2: "#222" });
    expect(out.polling?.sharesPct).toEqual({ c1: 40, c2: 60 });
    expect(out.candidates.map((c) => c.characterId)).toEqual(["ch1", ""]);
    expect(out.startTime).toBeUndefined();
    expect(out.endTime).toBeUndefined();
    expect(out.primaryEndTime).toBe("2026-01-01T12:00:00.000Z");
  });

  it("keeps Commons party data for the seat carve-up", () => {
    const out = toElectionListDisplay(race("commons"));
    expect(out.polling?.candidatePartyColors).toEqual({ c1: "#111", c2: "#222" });
    expect(out.candidates[1]).toMatchObject({ partyName: "P2", partyColor: "#222" });
  });
});
