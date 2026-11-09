import { describe, expect, it } from "vitest";
import { buildRaceIndex } from "./rules";
import { election } from "./rules/__fixtures__/election";
import {
  campaignManagerCountry,
  campaignManagerHref,
  campaignPageHref,
  raceCampaignHref,
  standaloneCampaignHref,
  primaryTierHref,
  raceHref,
  presidentialRedirect,
} from "./links";
import { parseCampaignManagerParams } from "./linkParams";
import { openingFilter } from "./openingFilter";

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
        country: "uk",
      })
    ).toEqual({
      race: "6ae803d32a6841f128efd90d:1",
      filter: { type: "senate", stage: "final", regionId: "MI", year: 1988, party: "2" },
      country: "UK",
    });
    expect(
      parseCampaignManagerParams({
        race: "../etc",
        type: "<script>",
        stage: "sometime",
        region: "Michigan",
        year: "soon",
        party: ["1", "2"],
        country: "United Kingdom",
      })
    ).toEqual({ race: null, filter: {}, country: null });
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

describe("raceHref", () => {
  it("opens a down-ballot race in Campaign Manager", () => {
    expect(raceHref({ id: "e1", electionType: "senate", seatId: "US-senate-MI-1" })).toBe(
      "/campaign-manager?race=e1"
    );
    expect(raceHref({ id: "e1", electionType: "special_commons" })).toBe(
      "/campaign-manager?race=e1"
    );
  });

  it("keeps the presidency on its own page", () => {
    expect(raceHref({ id: "e1", electionType: "president", seatId: "US-president" })).toBe(
      "/elections/US-president"
    );
    expect(raceHref({ id: "e1", electionType: "president" })).toBe("/elections/e1");
  });
});

describe("primaryTierHref", () => {
  it("opens a party's primaries of one race type in Campaign Manager", () => {
    expect(primaryTierHref("house", "2")).toBe(
      "/campaign-manager?type=house&stage=primary&party=2"
    );
    expect(primaryTierHref("president", "2")).toBe("/president/primary/2");
  });
});

describe("presidentialRedirect", () => {
  it("sends a linked presidential race to its own page", () => {
    expect(
      presidentialRedirect({ _id: "e1", electionType: "president", seatId: "US-president" })
    ).toBe("/elections/US-president");
  });

  it("keeps every other race in Campaign Manager", () => {
    expect(presidentialRedirect({ _id: "e1", electionType: "senate" })).toBeNull();
    expect(presidentialRedirect(null)).toBeNull();
  });
});

describe("openingFilter party", () => {
  it("carries the party param into the opening filter", () => {
    expect(openingFilter([], null, { type: "house", stage: "primary", party: "2" })).toMatchObject({
      type: "house",
      stage: "primary",
      party: "2",
    });
  });
});

describe("links module", () => {
  it("stays a dependency-free leaf, since the status bar and navbars import it", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/campaignManager/links.ts", "utf8");
    const valueImports = source.match(/^import (?!type )[^\n]*$/gm) ?? [];
    expect(valueImports).toEqual([]);
  });
});

describe("campaignManagerCountry", () => {
  it("opens a linked race in its own country", () => {
    expect(campaignManagerCountry("US", { countryId: "UK" }, null)).toBe("UK");
  });

  it("treats a legacy race without a country as American", () => {
    expect(campaignManagerCountry("UK", { countryId: undefined }, null)).toBe("US");
  });

  it("uses a country param when no race is linked, else the player's own country", () => {
    expect(campaignManagerCountry("US", null, "JP")).toBe("JP");
    expect(campaignManagerCountry("US", null, null)).toBe("US");
  });
});

describe("campaignManagerHref country", () => {
  it("names a country to view", () => {
    expect(campaignManagerHref({ country: "UK" })).toBe("/campaign-manager?country=UK");
    expect(campaignManagerHref({ country: "JP", type: "governor" })).toBe(
      "/campaign-manager?country=JP&type=governor"
    );
  });
});

describe("campaign page links", () => {
  const ids = { campaignId: "c1", electionId: "e1" };

  it("opens a campaign on its race page in Campaign mode", () => {
    expect(campaignPageHref({ ...ids, countryId: "US" })).toBe(
      "/elections/e1?view=campaign&campaign=c1"
    );
  });

  it("carries the rail tab and region", () => {
    expect(campaignPageHref({ ...ids, countryId: "US", tab: "field", region: "OH" })).toBe(
      "/elections/e1?view=campaign&campaign=c1&tab=field&region=OH"
    );
    expect(raceCampaignHref("e1", "c1", { tab: "field" })).toBe(
      "/elections/e1?view=campaign&campaign=c1&tab=field"
    );
  });

  it("keeps Russia on the standalone campaign page", () => {
    expect(campaignPageHref({ ...ids, countryId: "RU" })).toBe("/campaign/c1");
  });

  it("keeps the Political Operations frame on the standalone page", () => {
    expect(campaignPageHref({ ...ids, countryId: "US", embedded: true })).toBe(
      "/campaign/c1?embedded=political-operations"
    );
  });

  it("falls back to the standalone page when the race is unknown", () => {
    expect(campaignPageHref({ campaignId: "c1" })).toBe("/campaign/c1");
    expect(campaignPageHref({ campaignId: "c1", electionId: null, tab: "field" })).toBe(
      "/campaign/c1?tab=field"
    );
  });

  it("builds the standalone page with its params", () => {
    expect(standaloneCampaignHref("c1")).toBe("/campaign/c1");
    expect(standaloneCampaignHref("c1", { tab: "field", region: "OH" })).toBe(
      "/campaign/c1?tab=field&region=OH"
    );
  });
});
