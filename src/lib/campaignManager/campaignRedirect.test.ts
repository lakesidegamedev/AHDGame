import { describe, expect, it } from "vitest";
import { campaignRedirectTarget, type CampaignRedirectRace } from "./campaignRedirect";

const race: CampaignRedirectRace = {
  id: "e1",
  countryId: "US",
  electionType: "president",
  isUpcoming: false,
};

describe("campaignRedirectTarget", () => {
  it("sends a campaign to its race page in Campaign mode", () => {
    expect(campaignRedirectTarget("c1", race, {})).toBe("/elections/e1?view=campaign&campaign=c1");
  });

  it("carries tab, region and any other query param", () => {
    expect(campaignRedirectTarget("c1", race, { tab: "field", region: "OH", cycle: "3" })).toBe(
      "/elections/e1?view=campaign&campaign=c1&tab=field&region=OH&cycle=3"
    );
  });

  it("keeps repeated params", () => {
    expect(campaignRedirectTarget("c1", race, { x: ["1", "2"] })).toBe(
      "/elections/e1?view=campaign&campaign=c1&x=1&x=2"
    );
  });

  it("does not let the old URL override the target view or campaign", () => {
    expect(campaignRedirectTarget("c1", race, { view: "race", campaign: "other" })).toBe(
      "/elections/e1?view=campaign&campaign=c1"
    );
  });

  it("keeps Russia on the old page", () => {
    expect(campaignRedirectTarget("c1", { ...race, countryId: "RU" }, {})).toBeNull();
  });

  it("keeps the Political Operations iframe on the old page", () => {
    expect(campaignRedirectTarget("c1", race, { embedded: "political-operations" })).toBeNull();
  });

  it("keeps races the race page shows no Blend view for", () => {
    expect(campaignRedirectTarget("c1", { ...race, isUpcoming: true }, {})).toBeNull();
    expect(campaignRedirectTarget("c1", { ...race, electionType: "senate" }, {})).toBeNull();
  });

  it("keeps the old page when the race is unknown", () => {
    expect(campaignRedirectTarget("c1", null, {})).toBeNull();
  });

  it("redirects a concluded race, which shows the Blend results screen", () => {
    expect(campaignRedirectTarget("c1", { ...race, isUpcoming: false }, { tab: "field" })).toBe(
      "/elections/e1?view=campaign&campaign=c1&tab=field"
    );
  });
});
