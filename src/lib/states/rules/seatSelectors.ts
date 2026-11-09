/** State seat and electoral-vote selectors over the tables in constants/statesTables. */
import {
  HOUSE_SEATS,
  HOUSE_SEATS_1953,
  UK_COMMONS_SEATS,
  TOTAL_UK_COMMONS_SEATS,
  UK_COMMONS_SEATS_1953,
  TOTAL_UK_COMMONS_SEATS_1953,
  UK_COMMONS_SEATS_1991,
  TOTAL_UK_COMMONS_SEATS_1991,
  CN_NPC_SEATS,
  CN_NPC_SEATS_1953,
  CN_PEOPLES_CONGRESS_SEATS,
  CN_PEOPLES_CONGRESS_SEATS_1953,
  ELECTORAL_VOTES,
  ELECTORAL_VOTE_UNITS,
  HOUSE_SEATS_1991,
  ELECTORAL_VOTES_1991,
  ELECTORAL_VOTE_UNITS_1991,
  ELECTORAL_VOTES_1953,
  ELECTORAL_VOTE_UNITS_1953,
  STATE_ID_SET,
} from "@/lib/constants/statesTables";

/**
 * Preset-aware CN apportionment selectors. Same shape and same fall-back-to-
 * modern convention as {@link getHouseSeats} / {@link getElectoralVotes}:
 * `1953-default` → the 1st-NPC bundle; everything else (`1979-default`,
 * `1991-default`, `2019-default`, `empty`, unknown, undefined) → the modern
 * bundle, which is what those eras all authored.
 */
export function getCnNpcSeats(preset: string | undefined): Record<string, number> {
  return preset === "1953-default" ? CN_NPC_SEATS_1953 : CN_NPC_SEATS;
}

export function getCnPeoplesCongressSeats(preset: string | undefined): Record<string, number> {
  return preset === "1953-default" ? CN_PEOPLES_CONGRESS_SEATS_1953 : CN_PEOPLES_CONGRESS_SEATS;
}

/**
 * Total seats in a region's sub-national legislature: the elected chamber whose
 * composition the region legislature page renders, whose vacancies the seat
 * appointer validates against, and whose size sets state-bill majorities.
 *
 * For China this is the Provincial People's Congress
 * (`getCnPeoplesCongressSeats(preset)`), NOT the State's `stateSenateSeats`
 * field, which for CN holds the separate, appointed CPPCC allocation (~half
 * the size). Every other country's sub-national chamber is sized by
 * `stateSenateSeats`.
 *
 * Single source of truth shared by the seat appointer, public legislature API,
 * and state-bill vote math, so they cannot disagree with the election system,
 * which sizes CN People's Congress races from the same selector.
 *
 * `preset` is optional only so non-CN callers need not plumb it; ALWAYS pass
 * it when the country can be CN, or a 1953 world reads the modern chamber size.
 */
export function subNationalChamberSeats(
  countryId: string,
  state: { _id: string; stateSenateSeats?: number | null },
  preset?: string
): number {
  if (countryId === "CN") {
    return getCnPeoplesCongressSeats(preset)[state._id] ?? state.stateSenateSeats ?? 0;
  }
  return state.stateSenateSeats ?? 0;
}

/**
 * Preset-aware apportionment selectors. `1953-default` → 1950-census bundle;
 * `1991-default` → 1990-census bundle; every other preset (`2019-default`,
 * `empty`, unknown, undefined) → the 2020-census default. Mirrors the
 * fall-back-to-2019 convention in `cycleAnchorContext.ts`.
 */
export function getHouseSeats(preset: string | undefined): Record<string, number> {
  if (preset === "1953-default") return HOUSE_SEATS_1953;
  return preset === "1991-default" ? HOUSE_SEATS_1991 : HOUSE_SEATS;
}

/**
 * Preset-aware UK Commons seat map. `1953-default` → 625-seat 1950–55
 * redistribution; `1991-default` → the 650-seat 1983-boundary map; every
 * other preset → the modern 650-seat map.
 */
export function getUkCommonsSeats(preset: string | undefined): Record<string, number> {
  if (preset === "1953-default") return UK_COMMONS_SEATS_1953;
  return preset === "1991-default" ? UK_COMMONS_SEATS_1991 : UK_COMMONS_SEATS;
}

/**
 * National Commons size for the active preset (625 in 1953, 650 in 1991, else
 * 650).
 *
 * 1991 and the modern era agree on the total and disagree on the split, which
 * is exactly why the map above is per-region rather than a single number.
 */
export function getTotalUkCommonsSeats(preset: string | undefined): number {
  if (preset === "1953-default") return TOTAL_UK_COMMONS_SEATS_1953;
  return preset === "1991-default" ? TOTAL_UK_COMMONS_SEATS_1991 : TOTAL_UK_COMMONS_SEATS;
}

export function getElectoralVotes(preset: string | undefined): Record<string, number> {
  if (preset === "1953-default") return ELECTORAL_VOTES_1953;
  return preset === "1991-default" ? ELECTORAL_VOTES_1991 : ELECTORAL_VOTES;
}

export function getElectoralVoteUnits(
  preset: string | undefined
): { unitId: string; ev: number; stateId: string }[] {
  if (preset === "1953-default") return ELECTORAL_VOTE_UNITS_1953;
  return preset === "1991-default" ? ELECTORAL_VOTE_UNITS_1991 : ELECTORAL_VOTE_UNITS;
}

/**
 * True when `id` is a full US electoral state — one with congressional and
 * gubernatorial representation (the 50 `HOUSE_SEATS` states). Federal districts
 * like DC exist as economic/demographic/presidential regions (3 electoral votes)
 * but elect NO House/Senate/Governor/state-legislature seats, so they are
 * excluded. Preset-independent: `HOUSE_SEATS_1991` carries the same 50 states.
 *
 * Election generators iterate the `states` collection (which includes DC); gate
 * US House/Senate/Governor/stateSenate spawning on this to avoid fabricating
 * seats for non-electoral regions.
 */
export function isUsElectoralState(id: string): boolean {
  return STATE_ID_SET.has(id);
}

/**
 * True when `id` is a US jurisdiction that hosts a party organization.
 *
 * This is deliberately broader than {@link isUsElectoralState}. DC elects no
 * House, Senate, governor, or state-legislature seats, but it does have party
 * committees, presidential registration, and party recruitment. Public-office
 * election code must continue to use `isUsElectoralState`; party-organization
 * code uses this predicate instead.
 */
export function isUsPartyOrganizationJurisdiction(id: string): boolean {
  return isUsElectoralState(id) || id === "DC";
}

/** True when a US region cannot host a party organization. */
export function isNonPartyOrganizationUsRegion(country: string, region: string): boolean {
  return country === "US" && !isUsPartyOrganizationJurisdiction(region);
}

/**
 * Action cost for a presidential candidate to set `travelState` or
 * `primaryCampaignState` to a given state. Scales with the state's EV count
 * so large states cost more than small ones, roughly matching real-world
 * campaign-effort budgets.
 */
export function getTravelActionCost(stateId: string, preset?: string): number {
  const ev = getElectoralVotes(preset)[stateId] ?? 3;
  if (ev <= 5) return 3;
  if (ev <= 10) return 5;
  if (ev <= 20) return 7;
  return 10;
}
