import { describe, expect, it } from "vitest";
import { parseCampaignParam, raceModeSwitchQuery, resolveRaceMode } from "./raceMode";

const MINE = "6ae803d32a6841f128efd90d";
const RIVAL = "6ae803d32a6841f128efd90e";

describe("resolveRaceMode", () => {
  it("opens Campaign mode for a viewer on a campaign in the race", () => {
    expect(resolveRaceMode({ view: null, campaign: null, myCampaignId: MINE })).toEqual({
      mode: "campaign",
      campaignId: MINE,
      canSwitch: true,
    });
  });

  it("opens Race mode for everyone else, with no switch", () => {
    expect(resolveRaceMode({ view: null, campaign: null, myCampaignId: null })).toEqual({
      mode: "race",
      campaignId: null,
      canSwitch: false,
    });
  });

  it("lets an explicit view win over the default, both ways", () => {
    expect(resolveRaceMode({ view: "race", campaign: null, myCampaignId: MINE }).mode).toBe("race");
    expect(resolveRaceMode({ view: "campaign", campaign: RIVAL, myCampaignId: null }).mode).toBe(
      "campaign"
    );
  });

  it("shows the campaign named in the URL, not the viewer's own", () => {
    const state = resolveRaceMode({ view: "campaign", campaign: RIVAL, myCampaignId: MINE });
    expect(state.campaignId).toBe(RIVAL);
  });

  it("offers a switch to a viewer with no campaign when the URL names one", () => {
    expect(resolveRaceMode({ view: null, campaign: RIVAL, myCampaignId: null })).toEqual({
      mode: "campaign",
      campaignId: RIVAL,
      canSwitch: true,
    });
    expect(resolveRaceMode({ view: "race", campaign: RIVAL, myCampaignId: null })).toEqual({
      mode: "race",
      campaignId: RIVAL,
      canSwitch: true,
    });
  });

  it("falls back to Race mode when Campaign mode has nothing to show", () => {
    expect(resolveRaceMode({ view: "campaign", campaign: null, myCampaignId: null })).toEqual({
      mode: "race",
      campaignId: null,
      canSwitch: false,
    });
  });

  it("ignores a campaign param that is not an id and an unknown view", () => {
    expect(resolveRaceMode({ view: "map", campaign: "not-an-id", myCampaignId: MINE })).toEqual({
      mode: "campaign",
      campaignId: MINE,
      canSwitch: true,
    });
  });
});

describe("parseCampaignParam", () => {
  it("accepts an ObjectId string and nothing else", () => {
    expect(parseCampaignParam(MINE)).toBe(MINE);
    expect(parseCampaignParam("abc")).toBeNull();
    expect(parseCampaignParam("")).toBeNull();
    expect(parseCampaignParam(null)).toBeNull();
  });
});

describe("raceModeSwitchQuery", () => {
  it("sets the view and keeps the other params", () => {
    const q = raceModeSwitchQuery(new URLSearchParams(`campaign=${RIVAL}&state=OH`), "campaign");
    expect(new URLSearchParams(q).get("view")).toBe("campaign");
    expect(new URLSearchParams(q).get("campaign")).toBe(RIVAL);
    expect(new URLSearchParams(q).get("state")).toBe("OH");
  });

  it("drops the campaign tab and region on the way back to the race", () => {
    const q = raceModeSwitchQuery(
      new URLSearchParams(`view=campaign&campaign=${MINE}&tab=field&region=OH`),
      "race"
    );
    const out = new URLSearchParams(q);
    expect(out.get("view")).toBe("race");
    expect(out.get("campaign")).toBe(MINE);
    expect(out.has("tab")).toBe(false);
    expect(out.has("region")).toBe(false);
  });
});
