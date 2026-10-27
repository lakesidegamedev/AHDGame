/**
 * Market lane keys.
 *
 * A lane is one commodity in one book (or one state, for the funded ledger).
 * These keys are used as `Map` keys inside the funded market's own passes, where
 * they are built once per order, per product and per quote level, so a
 * `JSON.stringify` array allocation on every row was a measurable share of a
 * producer turn. Plain concatenation is the same key for every real input: a
 * commodity name and a book or state id never contain the separator.
 */

const LANE_SEPARATOR = "|";

/** One commodity in one book: `state:CA`, `country:DE` or `world`. */
export function laneKeyOf(commodity: string, book: string): string {
  return commodity + LANE_SEPARATOR + book;
}

/** One commodity in one state, empty for a book that is not state scoped. */
export function commodityStateKey(commodity: string, stateId: string | null): string {
  return commodity + LANE_SEPARATOR + (stateId ?? "");
}
