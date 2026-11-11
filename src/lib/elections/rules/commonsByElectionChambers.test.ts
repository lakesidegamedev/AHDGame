import { describe, expect, it } from "vitest";
import {
  COMMONS_BY_ELECTION_CHAMBERS,
  SPECIAL_COMMONS_TYPES,
  commonsChamberForCountry,
  commonsChamberForOffice,
  commonsChamberForSpecial,
  seatMapFromHouseDistricts,
} from "./commonsByElectionChambers";
import {
  MULTI_SEAT_TYPES,
  isSpecialCommonsElection,
  officeKeyForElectionType,
} from "@/lib/utils/electionLabels";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";

describe("Commons by-election chambers", () => {
  it("names each country and special type once", () => {
    const countries = COMMONS_BY_ELECTION_CHAMBERS.map((c) => c.countryId);
    expect(new Set(countries).size).toBe(countries.length);
    expect(new Set(SPECIAL_COMMONS_TYPES).size).toBe(SPECIAL_COMMONS_TYPES.length);
  });

  it("finds a chamber by office, special type and country", () => {
    expect(commonsChamberForOffice("caCommons", "CA")?.specialType).toBe("special_caCommons");
    expect(commonsChamberForOffice("commons", "UK")?.specialType).toBe("special_commons");
    expect(commonsChamberForSpecial("special_caCommons")?.officeType).toBe("caCommons");
    expect(commonsChamberForCountry("CA")?.recallPetitions).toBe(false);
    expect(commonsChamberForCountry("UK")?.recallPetitions).toBe(true);
  });

  it("gives a row without a country id only to the chamber that claims them", () => {
    expect(commonsChamberForOffice("commons", undefined)?.countryId).toBe("UK");
    expect(commonsChamberForOffice("caCommons", undefined)).toBeNull();
  });

  it("does not match an office in the wrong country", () => {
    expect(commonsChamberForOffice("commons", "CA")).toBeNull();
    expect(commonsChamberForOffice("caCommons", "UK")).toBeNull();
    expect(commonsChamberForOffice("governor", "CA")).toBeNull();
    expect(commonsChamberForOffice(undefined, "CA")).toBeNull();
  });

  it.each(COMMONS_BY_ELECTION_CHAMBERS.map((c) => [c.countryId, c] as const))(
    "%s special and snap races seat in the regular office as a whole delegation",
    (_country, chamber) => {
      expect(isSpecialCommonsElection(chamber.specialType)).toBe(true);
      expect(officeKeyForElectionType(chamber.specialType)).toBe(chamber.officeType);
      expect(MULTI_SEAT_TYPES.has(chamber.specialType)).toBe(true);
      expect(DEFAULT_DURATIONS[chamber.specialType]).toBeDefined();
      for (const type of chamber.generalTypes) {
        expect(officeKeyForElectionType(type)).toBe(chamber.officeType);
        expect(MULTI_SEAT_TYPES.has(type)).toBe(true);
        expect(isSpecialCommonsElection(type)).toBe(false);
      }
    }
  );

  it("reads seats per region from house districts, skipping regions with none", () => {
    expect(
      seatMapFromHouseDistricts([
        { id: "CA_ON", houseDistricts: 122 },
        { id: "CA_YT", houseDistricts: 1 },
        { id: "CA_X", houseDistricts: 0 },
        { id: "CA_Y", houseDistricts: null },
        { id: "CA_Z" },
      ])
    ).toEqual({ CA_ON: 122, CA_YT: 1 });
  });
});
