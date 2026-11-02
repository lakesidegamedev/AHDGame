import { describe, expect, it } from "vitest";
import { buildRaceIndex } from "./rules";
import { election } from "./rules/__fixtures__/election";
import { campaignManagerHref, openingFilter, parseCampaignManagerParams } from "./links";

describe("campaignManagerHref", () => {
  it("builds a race link", () => {
    expect(campaignManagerHref({ race: "6ae803d32a6841f128efd90d" })).toBe(
      "/campaign-manager?race=6ae803d32a6841f128efd90d"
    );
    expect(campaignManagerHref({ race: "6ae803d32a6841f128efd90d:1" })).toBe(
      "/campaign-manager?race=6ae803d32a6841f128efd90d%3A1"
    );
  });

  it("builds a filter link", () => {
    expect(campaignManagerHref({ type: "house", stage: "primary", party: "2" })).toBe(
      "/campaign-manager?type=house&stage=primary&party=2"
    );
    expect(campaignManagerHref({ type: "senate", stage: "final", region: "MI", year: 1988 })).toBe(
      "/campaign-manager?type=senate&stage=final&region=MI&year=1988"
    );
    expect(campaignManagerHref({})).toBe("/campaign-manager");
  });
});

describe("parseCampaignManagerParams", () => {
  it("keeps valid params and drops junk", () => {
    expect(
      parseCampaignManagerParams({
        race: "6ae803d32a6841f128efd90d:1",
        type: "senate",
        stage: "final",
        region: "mi",
        year: "1988",
        party: "2",
      })
    ).toEqual({
      race: "6ae803d32a6841f128efd90d:1",
      filter: { type: "senate", stage: "final", regionId: "MI", year: 1988, party: "2" },
    });
    expect(
      parseCampaignManagerParams({
        race: "../etc",
        type: "<script>",
        stage: "sometime",
        region: "Michigan",
        year: "soon",
        party: ["1", "2"],
      })
    ).toEqual({ race: null, filter: {} });
  });
});

describe("openingFilter", () => {
  const races = buildRaceIndex(
    [
      election({
        id: "aaaaaaaaaaaaaaaaaaaaaaaa",
        state: "OH",
        cands: [{ id: "a", name: "A", party: "1", share: 50 }],
      }),
      election({
        id: "bbbbbbbbbbbbbbbbbbbbbbbb",
        electionType: "governor",
        state: "PA",
        cands: [{ id: "b", name: "B", party: "1", share: 50, isYou: true }],
      }),
    ],
    { currentTurn: 10, nationalChamberKeys: ["senate"] }
  );

  it("opens on the linked race", () => {
    expect(openingFilter(races, "aaaaaaaaaaaaaaaaaaaaaaaa", {})).toMatchObject({
      type: "senate",
      stage: "all",
      regionId: "OH",
    });
  });

  it("opens on the default when the linked race is unknown", () => {
    // Missing, presidential or another country's race: none is in the index.
    expect(openingFilter(races, "cccccccccccccccccccccccc", {})).toMatchObject({
      type: "governor",
      stage: "all",
      regionId: "PA",
    });
  });

  it("applies filter params over the default", () => {
    expect(
      openingFilter(races, null, { type: "senate", stage: "general", regionId: "OH" })
    ).toMatchObject({
      type: "senate",
      stage: "general",
      regionId: "OH",
    });
  });

  it("has nothing to open on an empty country", () => {
    expect(openingFilter([], null, {})).toBeNull();
  });
});
