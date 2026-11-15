import type { ConflictDoc } from "@/lib/db/types/conflict";
import type { CountryId } from "@/lib/constants/countries";
import type { Side } from "./occupation";

/**
 * Turns a victor has to name their terms before the window lapses.
 *
 * Long enough that a player who is not logged in when the front breaks still gets
 * to answer for it, short enough that a won war does not sit unresolved. Shorter
 * than `PEACE_OFFER_DURATION_TURNS` on purpose: an offer waits on another player,
 * while this waits only on the winner.
 *
 * BALANCE CONSTANT. Changing it needs an issue and a simulation report.
 */
export const DICTATE_WINDOW_TURNS = 24;

/**
 * The founding belligerent of one side, or null when the side has none.
 *
 * A guest is any country that did not start the war on this side. Two ways to be
 * one: a join stamp in `joinTurns`, or a treaty entry, because `declareWar`
 * resolves treaty defenders BEFORE `createConflict` so `joinSide` never runs for
 * them. Both must be checked; reading only `joinTurns` misclassifies
 * dragged-in allies as founders.
 *
 * The principal is used (not the whole side) so a coalition victory yields ONE
 * term instead of one per ally.
 *
 * Null in two cases the caller must handle by resolving the war outright: an
 * empty roster (generated side with no government), and every country carrying
 * a guest stamp (the founder took a separate peace; its claim must not pass to a
 * late joiner).
 */
export function principalOf(
  // A Pick rather than the whole document, so the offer validator and the offer form
  // can ask the same question without holding a fully loaded conflict.
  conflict: Pick<ConflictDoc, "sideA" | "sideB" | "joinTurns" | "treatyEntries">,
  side: Side
): CountryId | null {
  const roster = side === "A" ? conflict.sideA.countries : conflict.sideB.countries;
  if (roster.length === 0) return null;
  const guests = new Set<string>([
    ...(conflict.joinTurns ?? []).map((j) => j.countryId),
    ...(conflict.treatyEntries ?? []).map((e) => e.countryId),
  ]);
  // Roster order, which is stable: the array is only ever appended to and spliced,
  // never reordered, so a side with several founders names the same one every time.
  return roster.find((c) => !guests.has(c)) ?? null;
}
