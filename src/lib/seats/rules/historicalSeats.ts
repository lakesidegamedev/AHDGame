/** Pure rules for historicalSeats; the tables they read live in historicalSeatsTables. */
import type { CountryId } from "@/lib/constants/countries";
import { missingPresetEntry } from "@/lib/seeds/contract/seedContractError";
import { isBackgroundInPreset } from "@/lib/world/eraRoster";
import {
  CN_GOVERNORS_2020,
  CN_NPC_2020,
  CN_PEOPLES_CONGRESS_2020,
  DE_BUNDESTAG_2021,
  DE_MINISTERPRAESIDENTEN_2020,
  JP_GOVERNORS_2020,
  JP_REGIONAL_COUNCIL_2020,
  JP_SANGIIN_2020,
  JP_SHUGIIN_2020,
  RESET_PRESETS,
  SEAT_GROUPS_1953,
  SEAT_GROUPS_1979,
  SEAT_GROUPS_1992,
  SEAT_GROUPS_2019,
  SEAT_GROUPS_2020,
  SEAT_GROUPS_2027,
  UK_COMMONS_2020,
  UK_FIRST_MINISTERS_2020,
  UK_REGIONAL_COUNCIL_2020,
  US_GOVERNORS_2020,
  US_HOUSE_2020,
  US_SENATE_2020,
  US_STATE_SENATE_2020,
  splitCNNPCDelegates,
  type HistoricalSeat,
  type ResetPreset,
  type SeatGroups,
} from "@/lib/constants/historicalSeatsTables";

/**
 * Get all historical seats for a country as of February 2020
 * @deprecated Use getPresetSeats with a preset ID instead
 */
export function getHistoricalSeats(countryId: CountryId): HistoricalSeat[] {
  switch (countryId) {
    case "US":
      return [...US_HOUSE_2020, ...US_SENATE_2020, ...US_STATE_SENATE_2020, ...US_GOVERNORS_2020];
    case "UK":
      return [...UK_COMMONS_2020, ...UK_REGIONAL_COUNCIL_2020, ...UK_FIRST_MINISTERS_2020];
    case "JP":
      return [
        ...JP_SHUGIIN_2020,
        ...JP_SANGIIN_2020,
        ...JP_GOVERNORS_2020,
        ...JP_REGIONAL_COUNCIL_2020,
      ];
    case "DE":
      return [...DE_BUNDESTAG_2021, ...DE_MINISTERPRAESIDENTEN_2020];
    case "CN":
      return [
        ...splitCNNPCDelegates(CN_NPC_2020),
        ...splitCNNPCDelegates(CN_PEOPLES_CONGRESS_2020),
        ...CN_GOVERNORS_2020,
      ];
    default:
      return [];
  }
}

/**
 * The seat groups authored for a preset. A preset without its own roster has no
 * seats to seed and throws `SeedContractError`; the 2020 roster is never lent.
 * `2019-no-parties` is the 2019 world without starting parties and seats the
 * 2020 roster it has always used.
 */
export function seatGroupsFor(presetId: string): SeatGroups {
  switch (presetId) {
    case "2019-default":
      return SEAT_GROUPS_2019;
    case "1991-default":
      return SEAT_GROUPS_1992;
    case "1953-default":
      return SEAT_GROUPS_1953;
    case "1979-default":
      return SEAT_GROUPS_1979;
    case "2027-default":
      return SEAT_GROUPS_2027;
    case "empty":
      return {};
    case "2019-no-parties":
      return SEAT_GROUPS_2020;
    default:
      throw missingPresetEntry(presetId, "historicalSeats:seatGroups");
  }
}

/**
 * Every seat a preset seeds, in one flat array.
 *
 * Derived from `seatGroupsFor` so the grouping and the flat view cannot drift:
 * the groups are the source, this is the projection. Callers that need to know
 * WHICH country a seat belongs to must use `seatsForCountry` / `seatCountFor`
 * in `presetSeatGroups.ts`, because `officeType` alone cannot tell them.
 *
 * Throws `SeedContractError` for a preset with no authored roster.
 */
export function getPresetSeats(presetId: string): HistoricalSeat[] {
  // Background countries seat no NPP politicians: they stay in the
  // seat table as authored data, but the seeding path never sees them.
  return Object.entries(seatGroupsFor(presetId))
    .filter(([countryId]) => !isBackgroundInPreset(presetId, countryId))
    .flatMap(([, seats]) => seats ?? []);
}

/**
 * Get a preset by ID
 */
export function getPresetById(presetId: string): ResetPreset | undefined {
  return RESET_PRESETS.find((p) => p.id === presetId);
}
