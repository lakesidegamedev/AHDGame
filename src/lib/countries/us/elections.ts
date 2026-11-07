import type { MajorDefaultParty } from "@/lib/seeds/defaultPartyTiers";
import type { CountryElections } from "../contract";
import {
  ELECTORAL_VOTES,
  HOUSE_SEATS,
  SENATE_CLASSES_BY_STATE,
  STATE_SENATE_SEATS,
  TOTAL_ELECTORAL_VOTES,
  TOTAL_HOUSE_SEATS,
  TOTAL_SENATE_SEATS,
} from "@/lib/constants/states";
import { ensurePresidentialElection } from "@/lib/turn/perpetualElections/shared";

/**
 * The United States' elections.
 *
 * ⚠️ SERVER ONLY. `ensurePresidentialElection` reaches `getDb`, so importing
 * this module from a client component pulls the database driver into the
 * browser bundle. Not re-exported from the folder barrel for browser use.
 *
 * ⚠️ THE SEAT TABLES ARE IMPORTED, NOT DECLARED. Duplicating them by value
 * creates a silently divergent second source; importing means there is
 * nothing to diverge.
 *
 * ⚠️ THE TABLES THEMSELVES STAY IN `constants/states.ts` because:
 *
 *   - that file is still multi-country (UK_COMMONS_SEATS, CN_NPC_SEATS,
 *     DE_WAHLKREIS_SEATS, NG_REGIONAL_COUNCIL_SEATS, RU_REGION_NAMES), so it
 *     is not the United States' file to take; and
 *   - the US block is entangled with values DERIVED from it in place.
 *     `STATE_IDS` is `Object.keys(HOUSE_SEATS)`, `STATE_ID_SET` is built from
 *     that, and `ELECTORAL_VOTES_1953` / `ELECTORAL_VOTE_UNITS_1953` are
 *     computed from the modern tables. Relocating the literals without the
 *     derivations would split one computation across two files.
 *
 * If `constants/states.ts` is ever split per country, these follow; until
 * then, one definition is the property that matters and it already holds.
 */

/**
 * Federal Senate seats per state, derived from class assignments.
 *
 * Not STATE_SENATE_SEATS: that table is each state's own upper chamber (~1,972 total). This is two per state (100 total).
 * Derive from tuple length, not the literal 2, so class assignments stay the only source.
 */
const federalSenateSeats: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(SENATE_CLASSES_BY_STATE).map(([state, classes]) => [state, classes.length])
);

/**
 * ⚠️ `byChamber` IS KEYED BY STATE, NOT BY REGION-WITH-ONE-SEAT. The House table
 * gives each state its delegation size (California 52, Wyoming 1). A country
 * whose chambers are regional -- Japan's eight -- has the same shape and means
 * something different.
 */
/** Default parties that seed as Major; every other default party seeds Minor. */
const majorDefaultParties: MajorDefaultParty[] = [{ abbr: "DEM" }, { abbr: "REP" }];

export const US_ELECTIONS: CountryElections = {
  majorDefaultParties: majorDefaultParties,
  spawn: ensurePresidentialElection,
  seats: {
    byChamber: {
      house: HOUSE_SEATS,
      senate: federalSenateSeats,
      stateSenate: STATE_SENATE_SEATS,
      electoralCollege: ELECTORAL_VOTES,
    },
    totals: {
      house: TOTAL_HOUSE_SEATS,
      senate: TOTAL_SENATE_SEATS,
      electoralCollege: TOTAL_ELECTORAL_VOTES,
    },
  },
};

/**
 * ⚠️ NO `electionPhases` AND NO `billPhases`, AND BOTH ABSENCES ARE REAL.
 * `COUNTRY_ELECTION_PHASES` and `COUNTRY_BILL_PHASES` are
 * `Partial<Record<CountryId, ...>>` with no US key; the US runs off the global
 * game state rather than a per-country phase table, and
 * `countryReadinessContract` reads both through `?.`. Authoring either here
 * would turn a deliberate fallback into an authored value.
 */
