import { describe, expect, it } from "vitest";
import { getPresetSeats } from "@/lib/constants/historicalSeats";
import { seatsForCountry } from "@/lib/constants/presetSeatGroups";
import { backgroundCountriesFor } from "@/lib/world/eraRoster";
import { getPresetEnablementTier, getPresetEnablementCountries } from "./seedCountryGameStates";

/** Bootstrap gating for the 2027 background tier (#5702), at unit level. */
describe("2027 background countries at bootstrap", () => {
  it("seats no politicians for background countries, and every seat elsewhere", () => {
    const seats = getPresetSeats("2027-default");
    // Brazil and Ireland are the background countries with authored 2027 rows.
    for (const countryId of ["BR", "IE"] as const) {
      const authored = seatsForCountry("2027-default", countryId);
      expect(authored.length, countryId).toBeGreaterThan(0);
      for (const seat of authored) expect(seats).not.toContain(seat);
    }
    const full = ["US", "UK", "JP", "DE", "CN"] as const;
    const expected = full.reduce((n, id) => n + seatsForCountry("2027-default", id).length, 0);
    expect(seats).toHaveLength(expected);
  });

  it("keeps background countries registered and seeded as countries", () => {
    const countries = getPresetEnablementCountries("2027-default") ?? [];
    for (const countryId of backgroundCountriesFor("2027-default")) {
      expect(countries, countryId).toContain(countryId);
      expect(getPresetEnablementTier("2027-default", countryId)).toEqual({
        enabledForPlayers: false,
        economyPreview: false,
        status: "beta",
      });
    }
  });

  it("does not change seating for a preset without background countries", () => {
    const seats = getPresetSeats("2019-default");
    expect(seats.length).toBeGreaterThan(0);
    for (const countryId of ["US", "UK", "JP"] as const) {
      for (const seat of seatsForCountry("2019-default", countryId)) expect(seats).toContain(seat);
    }
  });
});
