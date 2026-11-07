/**
 * Authored seat identities for seated presets.
 *
 * `seedFromSeats` creates one NPP per seat row with a random fictional name.
 * A preset can pin a specific seat to an authored identity instead, for
 * example so the 2027 president opens with a fixed name, age and terms
 * already served. Every authored identity is FICTIONAL: no world seats a real
 * politician or claims a real person's identity, and no entry pairs a
 * portrait with the real person it depicts. Portraits for these seats come
 * from the generic demographic pick, the same as any generated NPP.
 *
 * KEY SCHEME
 * ----------
 * A roster key identifies one seated NPP the same way at author time and at
 * seed time: `country|officeType|state|party|ordinal`, where `ordinal` is the
 * zero-based occurrence of that exact (country, officeType, state, party)
 * tuple in `getPresetSeats(preset)` order.
 *
 * Seats with no authored entry keep generated names. The lookup is a pure
 * overlay, not a requirement.
 */

import type { NPPGender, NPPEthnicity } from "@/lib/db/types/npp";

export interface HistoricalRosterEntry {
  name: string;
  birthYear: number;
  gender: NPPGender;
  ethnicity: NPPEthnicity;
  /**
   * Executive terms this identity has already served toward the country's
   * term limit, including the term in progress at the preset start. Set only
   * where the source records it; absent = none counted.
   */
  priorExecutiveTerms?: number;
}

/** Presets with authored fictional seat identities. */
const ROSTERED_PRESETS = ["2019-default", "2027-default"] as const;
export type RosteredPreset = (typeof ROSTERED_PRESETS)[number];

export function isRosteredPreset(presetId: string): presetId is RosteredPreset {
  return (ROSTERED_PRESETS as readonly string[]).includes(presetId);
}

/** Canonical roster key for one seated NPP. */
export function rosterKey(
  countryId: string,
  officeType: string,
  state: string,
  party: string,
  ordinal: number
): string {
  return `${countryId}|${officeType}|${state}|${party}|${ordinal}`;
}

// Per-preset maps, populated from `./rosters/*` below.
import { ROSTER_2019_IE as R19_IE } from "./rosters/p2019-ie";
import { ROSTER_2027_US as R27_US } from "./rosters/p2027-us";

export type RosterMap = Record<string, HistoricalRosterEntry>;

const ROSTERS: Record<RosteredPreset, RosterMap> = {
  // 2019 names only the Irish president; the rest of the board is generated.
  "2019-default": Object.assign({}, R19_IE),
  // 2027 names only the US executive; the rest of the board is generated.
  "2027-default": Object.assign({}, R27_US),
};

/**
 * Look up the authored identity for one seated NPP. Returns undefined when
 * the preset is not rostered or the seat has no authored entry (generated
 * name applies).
 */
export function getHistoricalRosterEntry(
  presetId: string,
  countryId: string,
  officeType: string,
  state: string,
  party: string,
  ordinal: number
): HistoricalRosterEntry | undefined {
  if (!isRosteredPreset(presetId)) return undefined;
  return ROSTERS[presetId][rosterKey(countryId, officeType, state, party, ordinal)];
}
