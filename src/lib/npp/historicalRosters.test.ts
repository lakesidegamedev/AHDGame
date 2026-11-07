/**
 * Contract for authored seat identities.
 *
 * Only the 2027 US executive is authored. Every authored identity is
 * fictional: the 1991 and 2019 presets used to overlay real officeholders on
 * their seated NPPs, and no preset does that any more.
 */

import { describe, expect, it } from "vitest";
import { getPresetSeats, US_EXECUTIVE_2027 } from "@/lib/constants/historicalSeats";
import { getHistoricalRosterEntry, isRosteredPreset, rosterKey } from "./historicalRosters";

describe("historicalRosters key scheme", () => {
  it("formats keys as country|office|state|party|ordinal", () => {
    expect(rosterKey("US", "governor", "CA", "democrat", 0)).toBe("US|governor|CA|democrat|0");
  });

  it("rosters only the 2027 preset", () => {
    expect(isRosteredPreset("2027-default")).toBe(true);
    for (const preset of [
      "1953-default",
      "1979-default",
      "1991-default",
      "2019-default",
      "empty",
    ]) {
      expect(isRosteredPreset(preset)).toBe(false);
    }
  });

  it("returns undefined outside rostered presets", () => {
    expect(
      getHistoricalRosterEntry("1991-default", "US", "house", "CA", "democrat", 0)
    ).toBeUndefined();
    expect(
      getHistoricalRosterEntry("2019-default", "UK", "commons", "LON", "uk_conservative", 0)
    ).toBeUndefined();
  });
});

describe("2027 US executive roster", () => {
  const executive = getPresetSeats("2027-default").filter(
    (seat) => seat.officeType === "president" || seat.officeType === "vicePresident"
  );

  it("seats the January 2027 ticket rather than the 2020 placeholder", () => {
    expect(executive).toEqual(US_EXECUTIVE_2027);
  });

  it("gives the Republican president and vice president fixed fictional identities", () => {
    const president = getHistoricalRosterEntry(
      "2027-default",
      "US",
      "president",
      "US",
      "republican",
      0
    );
    const vicePresident = getHistoricalRosterEntry(
      "2027-default",
      "US",
      "vicePresident",
      "US",
      "republican",
      0
    );
    expect(president).toMatchObject({ name: "Warren Hollister", birthYear: 1951 });
    expect(vicePresident).toMatchObject({ name: "Colin Ashby", birthYear: 1982 });
    expect(president).not.toHaveProperty("portraitId");
    expect(vicePresident).not.toHaveProperty("portraitId");
  });

  it("leaves the rest of the 2027 board to generated identities", () => {
    expect(
      getHistoricalRosterEntry("2027-default", "US", "governor", "CA", "democrat", 0)
    ).toBeUndefined();
  });
});
