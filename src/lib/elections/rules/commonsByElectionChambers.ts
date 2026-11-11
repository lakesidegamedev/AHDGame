/**
 * Westminster-style lower chambers that fill mid-term vacancies with a
 * by-election instead of leaving the seat empty until the next general.
 *
 * One entry per chamber. The watcher, the vacancy hooks (retirement,
 * resignation), the fill guarantee and the resolver all read this table, so a
 * new Commons-style chamber joins by adding a row, not by copying the UK code.
 */

import type { CountryId } from "@/lib/constants/countriesCore";

export type CommonsSeatSource =
  /** Seats per region from the era preset's authored Commons table. */
  | "presetCommonsTable"
  /** Seats per region from each region document's `houseDistricts`. */
  | "regionHouseDistricts";

export interface CommonsByElectionChamber {
  countryId: CountryId;
  /** Office key stored on the chamber's elected-official rows. */
  officeType: string;
  /** Full general elections, regular and snap, that re-elect a whole region. */
  generalTypes: readonly string[];
  /** The off-calendar race that contests only vacated seats. */
  specialType: string;
  /** Rows written before country ids existed belong to this chamber. */
  claimsUnscopedRows: boolean;
  /** Recall petitions can force a vacancy. */
  recallPetitions: boolean;
  seatSource: CommonsSeatSource;
}

export const COMMONS_BY_ELECTION_CHAMBERS: readonly CommonsByElectionChamber[] = [
  {
    countryId: "UK",
    officeType: "commons",
    generalTypes: ["commons", "snap_commons"],
    specialType: "special_commons",
    claimsUnscopedRows: true,
    recallPetitions: true,
    seatSource: "presetCommonsTable",
  },
  {
    // Canada has no federal recall law, so no petitions.
    countryId: "CA",
    officeType: "caCommons",
    generalTypes: ["caCommons", "snap_caCommons"],
    specialType: "special_caCommons",
    claimsUnscopedRows: false,
    recallPetitions: false,
    seatSource: "regionHouseDistricts",
  },
];

/** Every by-election type that fills a Commons-style chamber. */
export const SPECIAL_COMMONS_TYPES: readonly string[] = COMMONS_BY_ELECTION_CHAMBERS.map(
  (c) => c.specialType
);

/**
 * The chamber a seat row belongs to. A row with no country id counts only for
 * a chamber that claims unscoped rows.
 */
export function commonsChamberForOffice(
  officeType: string | undefined,
  countryId: string | undefined
): CommonsByElectionChamber | null {
  if (!officeType) return null;
  return (
    COMMONS_BY_ELECTION_CHAMBERS.find(
      (c) =>
        c.officeType === officeType &&
        (countryId === undefined ? c.claimsUnscopedRows : c.countryId === countryId)
    ) ?? null
  );
}

export function commonsChamberForSpecial(electionType: string): CommonsByElectionChamber | null {
  return COMMONS_BY_ELECTION_CHAMBERS.find((c) => c.specialType === electionType) ?? null;
}

export function commonsChamberForCountry(countryId: CountryId): CommonsByElectionChamber | null {
  return COMMONS_BY_ELECTION_CHAMBERS.find((c) => c.countryId === countryId) ?? null;
}

/** Seats per region from region documents, skipping rows with no seat count. */
export function seatMapFromHouseDistricts(
  regions: ReadonlyArray<{ id: string; houseDistricts?: number | null }>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of regions) {
    if (typeof r.houseDistricts === "number" && r.houseDistricts > 0) {
      map[r.id] = r.houseDistricts;
    }
  }
  return map;
}
