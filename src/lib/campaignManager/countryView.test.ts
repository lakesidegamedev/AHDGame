import { describe, expect, it } from "vitest";
import { getCountryConfig, getCountryConfigForRuntime } from "@/lib/constants/countries";
import { campaignManagerCountryView } from "./countryView";

describe("campaignManagerCountryView", () => {
  it("groups a 1991 Russia's races by the chambers it has now", () => {
    const state = { ruFederalAssemblySinceTurn: 40 };
    const runtime = getCountryConfigForRuntime("RU", "1991-default", state);
    const base = getCountryConfig("RU", "1991-default");
    const keys = (c: typeof base) =>
      [c.legislature?.lowerChamber?.key, c.legislature?.upperChamber?.key].filter(Boolean);
    expect(keys(runtime)).not.toEqual(keys(base));
    const view = campaignManagerCountryView("RU", "1991-default", state, {});
    expect(view.nationalChamberKeys).toEqual(keys(runtime));
  });

  it("names the country for its era, and a saved rename wins", () => {
    expect(campaignManagerCountryView("RU", "1991-default", null, {}).countryName).toBe(
      "Soviet Union"
    );
    expect(campaignManagerCountryView("RU", "1991-default", null, { RU: "Rus" }).countryName).toBe(
      "Rus"
    );
  });
});
