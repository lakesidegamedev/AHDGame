import { describe, it, expect } from "vitest";
import {
  campaignMapIsEntry,
  canvassStateFromEligibility,
  presenceLevelsFor,
  presenceSubject,
  stateActionSections,
  type StateActionInput,
} from "./mapActions";

const base: StateActionInput = {
  stateId: "OH",
  accessLevel: "owner",
  hasStatePresence: true,
  hasOperations: true,
  canManage: true,
  canvassStateId: "OH",
};

describe("campaignMapIsEntry", () => {
  it("is the US map only", () => {
    expect(campaignMapIsEntry("US")).toBe(true);
    expect(campaignMapIsEntry("RU")).toBe(false);
    expect(campaignMapIsEntry("FR")).toBe(false);
    expect(campaignMapIsEntry(undefined)).toBe(false);
  });
});

describe("stateActionSections", () => {
  it("gives the candidate everything in the state canvassing is open in", () => {
    expect(stateActionSections(base)).toEqual({
      movement: true,
      operations: true,
      canvass: true,
      presenceBlock: true,
    });
  });

  it("offers canvassing only in the state it is open in", () => {
    expect(stateActionSections({ ...base, stateId: "TX" }).canvass).toBe(false);
    expect(stateActionSections({ ...base, canvassStateId: null }).canvass).toBe(false);
  });

  it("gives a manager the presence block and canvassing but no travel or operations", () => {
    const s = stateActionSections({ ...base, hasStatePresence: false, hasOperations: false });
    expect(s).toEqual({ movement: false, operations: false, canvass: true, presenceBlock: true });
  });

  it("gives a running mate the presence block but no canvassing", () => {
    const s = stateActionSections({
      ...base,
      hasStatePresence: false,
      hasOperations: false,
      canManage: false,
    });
    expect(s).toEqual({ movement: false, operations: false, canvass: false, presenceBlock: true });
  });

  it("shows a rival or party viewer none of it, even with data present", () => {
    for (const accessLevel of ["party", "public"] as const) {
      expect(stateActionSections({ ...base, accessLevel })).toEqual({
        movement: false,
        operations: false,
        canvass: false,
        presenceBlock: false,
      });
    }
  });
});

describe("canvassStateFromEligibility", () => {
  it("reads the state of an open canvass", () => {
    expect(canvassStateFromEligibility({ ok: true, stateId: "OH", source: "home" })).toBe("OH");
  });
  it("is null when blocked or malformed", () => {
    expect(canvassStateFromEligibility({ ok: false, reason: "needs_travel" })).toBeNull();
    expect(canvassStateFromEligibility({ ok: true })).toBeNull();
    expect(canvassStateFromEligibility(null)).toBeNull();
    expect(canvassStateFromEligibility("OH")).toBeNull();
  });
});

describe("presenceLevelsFor", () => {
  const race = [
    { characterId: "a", levelsByState: { OH: 3 } },
    { characterId: "b", levelsByState: { TX: 1 } },
  ];
  it("picks the named candidate", () => {
    expect(presenceLevelsFor(race, "a")).toEqual({ OH: 3 });
  });
  it("is empty for an unknown candidate or missing list", () => {
    expect(presenceLevelsFor(race, "z")).toEqual({});
    expect(presenceLevelsFor(undefined, "a")).toEqual({});
    expect(presenceLevelsFor(race, null)).toEqual({});
  });
});

describe("presenceSubject", () => {
  const candidates = [
    {
      characterId: "cand1",
      isYou: false,
      campaignId: "camp1",
      campaignColor: "#111111",
      partyColor: "#222222",
    },
    { characterId: "cand2", isYou: true, campaignId: "camp2", partyColor: "#333333" },
    { characterId: "cand3", isNPP: true, nppId: "npp3", isYou: false, campaignId: "camp3" },
  ];

  it("follows the campaign for a manager who is not the candidate", () => {
    expect(presenceSubject(candidates, "camp1")).toEqual({
      candidateId: "cand1",
      viewerIsCandidate: false,
      color: "#111111",
    });
  });
  it("marks the candidate's own campaign", () => {
    expect(presenceSubject(candidates, "camp2")).toEqual({
      candidateId: "cand2",
      viewerIsCandidate: true,
      color: "#333333",
    });
  });
  it("falls back to the viewer's own candidacy with no campaign id", () => {
    expect(presenceSubject(candidates, null)?.candidateId).toBe("cand2");
  });
  it("keys a party ticket by its party id and uses the default colour when none is set", () => {
    expect(presenceSubject(candidates, "camp3")).toEqual({
      candidateId: "npp3",
      viewerIsCandidate: false,
      color: "#4F8EF7",
    });
  });
  it("is null when the viewer is on no ticket here", () => {
    expect(presenceSubject([candidates[0]], null)).toBeNull();
  });
});
