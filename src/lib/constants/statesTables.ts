/**
 * Canonical US state constants for congressional and election logic.
 * Single source of truth — import from here or @/lib/constants.
 */

import {
  HOUSE_SEATS,
  HOUSE_SEATS_1953,
  ELECTORAL_VOTES,
  ELECTORAL_VOTES_1991,
} from "@/lib/countries/us/data/usSeats";

/**
 * One electoral-vote unit: a whole state, or one leg of a ME/NE split.
 *
 * `electorateShare` is the fraction of the parent state's electorate this unit
 * draws. Without it every unit resolves its pool from the whole state, so ME
 * and NE districts double count against the state.
 *
 * The real rule is two at-large electors decided by the statewide total and
 * one per district. Scaling districts alone would still double count against
 * the at-large unit, so the at-large leg carries `derivesFromDistricts`: it is
 * not simulated, and its tally is summed from its districts at resolution.
 * Districts partition the state exactly, so each ballot is counted once and the
 * statewide winner is the one who carried the state.
 */
export interface ElectoralVoteUnit {
  unitId: string;
  ev: number;
  stateId: string;
  /** Fraction of the parent state's electorate. 0 for a derived at-large leg. */
  electorateShare: number;
  /** At-large ME/NE leg: tally is the sum of the state's districts, not simulated. */
  derivesFromDistricts?: boolean;
}

/**
 * Electoral vote allocation units for presidential elections.
 * Most states: single unit (state ID) with full EV count.
 * ME/NE: split by statewide (2 EV) + congressional districts (1 EV each).
 */
function buildSplitElectoralVoteUnits(electoralVotes: Record<string, number>): ElectoralVoteUnit[] {
  const units: ElectoralVoteUnit[] = [];
  for (const [stateId, ev] of Object.entries(electoralVotes)) {
    const districts = ME_NE_DISTRICT_COUNT[stateId];
    if (districts) {
      // At-large leg: derived from the districts, never simulated.
      units.push({
        unitId: stateId,
        ev: 2,
        stateId,
        electorateShare: 0,
        derivesFromDistricts: true,
      });
      for (let i = 1; i <= districts; i++) {
        units.push({
          unitId: `${stateId}_CD${i}`,
          ev: 1,
          stateId,
          electorateShare: 1 / districts,
        });
      }
    } else {
      units.push({ unitId: stateId, ev, stateId, electorateShare: 1 });
    }
  }
  return units;
}

/** States electing by congressional district, and how many districts each has. */
const ME_NE_DISTRICT_COUNT: Record<string, number> = { ME: 2, NE: 3 };

export const ELECTORAL_VOTE_UNITS: ElectoralVoteUnit[] =
  buildSplitElectoralVoteUnits(ELECTORAL_VOTES);

/**
 * 1990-census electoral vote allocation units. Same ME/NE split structure as
 * the 2020 bundle (only the per-unit EV values differ).
 */
export const ELECTORAL_VOTE_UNITS_1991: ElectoralVoteUnit[] =
  buildSplitElectoralVoteUnits(ELECTORAL_VOTES_1991);

/**
 * Electoral votes per state — 1950 census (House seats + 2 Senators). Total = 531,
 * the real 1952/1956 electoral map (NY 45, CA/PA 32, IL 27, OH 25, TX 24).
 * Alaska/Hawaii (territories) and DC (no electoral votes until the 23rd Amendment,
 * 1961) are absent, so the map covers the 48 contiguous states only.
 */
export const ELECTORAL_VOTES_1953: Record<string, number> = Object.fromEntries(
  Object.entries(HOUSE_SEATS_1953).map(([stateId, houseSeats]) => [stateId, houseSeats + 2])
);

/**
 * 1950-census electoral vote allocation units. In 1952 EVERY state was
 * winner-take-all (Maine did not adopt the district method until 1972, Nebraska
 * 1992), so there are no ME/NE congressional-district splits — one unit per state.
 */
export const ELECTORAL_VOTE_UNITS_1953: ElectoralVoteUnit[] = Object.entries(
  ELECTORAL_VOTES_1953
).map(([stateId, ev]) => ({ unitId: stateId, ev, stateId, electorateShare: 1 }));

/**
 * Upper bound on the length of any region `_id` in the `states` collection,
 * for schema-layer shape checks.
 *
 * Region ids are NOT two-letter US codes worldwide: the longest currently
 * seeded is Nigeria's `NORTH_CENTRAL` at 13 characters. This constant exists
 * because two independent fixes for the same US-only-validation bug picked
 * different caps, and one of them (12) silently excluded that region. Import
 * this rather than hardcoding a number, so the bound moves with the seeds.
 *
 * This is a SHAPE bound only. The authoritative check is always a
 * country-scoped lookup against `states` — never a list held in code.
 */
export const MAX_REGION_ID_LENGTH = 15;

/** Valid state IDs (2-letter codes) for validation. */
export const STATE_IDS = Object.keys(HOUSE_SEATS) as string[];

/** Set form of {@link STATE_IDS} for O(1) membership checks. */
export const STATE_ID_SET: ReadonlySet<string> = new Set(STATE_IDS);

/**
 * Japan's chamber seat tables, which now live in its country folder.
 *
 * ⚠️ A FORWARDER HOLDS NO COPY. They were duplicated between this file and
 * `jp/elections.ts`; both now resolve to `jp/data/jpSeats.ts`.
 */
export {
  JP_SHUGIIN_SEATS,
  TOTAL_JP_SHUGIIN_SEATS,
  JP_SHUGIIN_SEATS_1991,
  TOTAL_JP_SHUGIIN_SEATS_1991,
  JP_SANGIIN_SEATS_1991,
  TOTAL_JP_SANGIIN_SEATS_1991,
  getJpShugiinSeats,
  getJpSangiinSeats,
  getJpSangiinClassSeats,
  getTotalJpShugiinSeats,
  getTotalJpSangiinSeats,
  JP_SANGIIN_SEATS,
  TOTAL_JP_SANGIIN_SEATS,
  JP_GOVERNOR_SEATS,
} from "@/lib/countries/jp/data/jpSeats";

export {
  HOUSE_SEATS,
  HOUSE_SEATS_1953,
  SENATE_CLASSES_BY_STATE,
  STATE_SENATE_SEATS,
  TOTAL_HOUSE_SEATS,
  TOTAL_SENATE_SEATS,
  ELECTORAL_VOTES,
  TOTAL_ELECTORAL_VOTES,
  ELECTORAL_MAJORITY,
  HOUSE_SEATS_1991,
  ELECTORAL_VOTES_1991,
  UNIT_LEAN,
} from "@/lib/countries/us/data/usSeats";

export {
  UK_COMMONS_SEATS,
  TOTAL_UK_COMMONS_SEATS,
  UK_COMMONS_SEATS_1953,
  TOTAL_UK_COMMONS_SEATS_1953,
  UK_COMMONS_SEATS_1991,
  TOTAL_UK_COMMONS_SEATS_1991,
  UK_REGION_NAMES,
  UK_REGIONAL_COUNCIL_SEATS,
} from "@/lib/countries/uk/data/ukSeats";

export { RU_REGION_NAMES } from "@/lib/countries/ru/data/ruRegionNames";

export { NG_REGIONAL_COUNCIL_SEATS } from "@/lib/countries/ng/data/ngSeats";

export {
  CN_NPC_SEATS,
  TOTAL_CN_NPC_SEATS,
  CN_NPC_SEATS_1953,
  TOTAL_CN_NPC_SEATS_1953,
  CN_PEOPLES_CONGRESS_SEATS,
  TOTAL_CN_PEOPLES_CONGRESS_SEATS,
  CN_PEOPLES_CONGRESS_SEATS_1953,
  TOTAL_CN_PEOPLES_CONGRESS_SEATS_1953,
} from "@/lib/countries/cn/data/cnSeats";

export {
  DE_WAHLKREIS_SEATS,
  TOTAL_DE_WAHLKREIS_SEATS,
  TOTAL_DE_BUNDESTAG_SEATS,
  DE_LANDTAG_SEATS,
} from "@/lib/countries/de/data/deSeats";
