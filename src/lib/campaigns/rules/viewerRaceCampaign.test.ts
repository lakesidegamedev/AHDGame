import { describe, expect, it } from "vitest";
import { pickViewerRaceCampaign, type RaceCampaignRow } from "./viewerRaceCampaign";

const row = (over: Partial<RaceCampaignRow> & { id: string; candidateId: string }) => ({
  archived: false,
  managerUserIds: [],
  ...over,
});

const base = {
  userId: "u1",
  ownedCharacterIds: new Set<string>(),
  ticketsAsRunningMate: new Set<string>(),
};

describe("pickViewerRaceCampaign", () => {
  it("finds the campaign of a candidate the viewer owns", () => {
    const campaigns = [row({ id: "a", candidateId: "x" }), row({ id: "b", candidateId: "mine" })];
    expect(
      pickViewerRaceCampaign({ ...base, campaigns, ownedCharacterIds: new Set(["mine"]) })
    ).toBe("b");
  });

  it("finds a campaign the viewer manages", () => {
    const campaigns = [row({ id: "a", candidateId: "x", managerUserIds: ["u1"] })];
    expect(pickViewerRaceCampaign({ ...base, campaigns })).toBe("a");
  });

  it("finds the ticket the viewer is running mate on", () => {
    const campaigns = [row({ id: "a", candidateId: "x" }), row({ id: "b", candidateId: "top" })];
    expect(
      pickViewerRaceCampaign({ ...base, campaigns, ticketsAsRunningMate: new Set(["top"]) })
    ).toBe("b");
  });

  it("returns null for a viewer with no part in any campaign", () => {
    const campaigns = [row({ id: "a", candidateId: "x", managerUserIds: ["u2"] })];
    expect(pickViewerRaceCampaign({ ...base, campaigns })).toBeNull();
    expect(pickViewerRaceCampaign({ ...base, campaigns: [] })).toBeNull();
  });

  it("prefers candidate over manager over running mate", () => {
    const campaigns = [
      row({ id: "mate", candidateId: "t1" }),
      row({ id: "mgr", candidateId: "t2", managerUserIds: ["u1"] }),
      row({ id: "cand", candidateId: "mine" }),
    ];
    const input = {
      ...base,
      campaigns,
      ownedCharacterIds: new Set(["mine"]),
      ticketsAsRunningMate: new Set(["t1"]),
    };
    expect(pickViewerRaceCampaign(input)).toBe("cand");
    expect(pickViewerRaceCampaign({ ...input, campaigns: campaigns.slice(0, 2) })).toBe("mgr");
  });

  it("prefers a live campaign over an archived one in a higher role", () => {
    const campaigns = [
      row({ id: "old", candidateId: "mine", archived: true }),
      row({ id: "live", candidateId: "t1", managerUserIds: ["u1"] }),
    ];
    expect(
      pickViewerRaceCampaign({ ...base, campaigns, ownedCharacterIds: new Set(["mine"]) })
    ).toBe("live");
  });

  it("still returns an archived campaign when it is the only one", () => {
    const campaigns = [row({ id: "old", candidateId: "mine", archived: true })];
    expect(
      pickViewerRaceCampaign({ ...base, campaigns, ownedCharacterIds: new Set(["mine"]) })
    ).toBe("old");
  });
});
