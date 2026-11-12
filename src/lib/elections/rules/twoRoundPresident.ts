/**
 * Two-round rule for a special presidential election: a first round winner needs
 * more than half the votes cast, otherwise the top two meet in a runoff.
 * Plain data in, plain data out.
 */

import type { CountryId } from "@/lib/constants/countriesCore";

/** Countries whose directly elected presidency is decided over two rounds. */
const TWO_ROUND_PRESIDENCIES: ReadonlySet<string> = new Set<CountryId>(["FR", "RO", "RU"]);

/** Turns the runoff stays open once the first round fails to produce a majority winner. */
export const SPECIAL_PRESIDENT_RUNOFF_TURNS = 24;

export function usesTwoRoundSpecialPresident(countryId: string | null | undefined): boolean {
  return countryId != null && TWO_ROUND_PRESIDENCIES.has(countryId);
}

export type TwoRoundDecision =
  | { outcome: "won"; winnerId: string }
  | { outcome: "runoff"; finalistIds: [string, string] }
  | { outcome: "no_votes" };

/** Highest votes first; equal votes fall to the lower id so the result is stable. */
function ranked(votes: Readonly<Record<string, number>>): Array<[string, number]> {
  return Object.entries(votes)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Round one: more than half of the votes cast wins outright, anything else
 * sends the top two to a runoff. Round two: the larger vote wins. A lone
 * candidate with votes wins in either round.
 */
export function decideTwoRoundPresident(
  votes: Readonly<Record<string, number>>,
  round: 1 | 2
): TwoRoundDecision {
  const order = ranked(votes);
  const top = order[0];
  if (!top) return { outcome: "no_votes" };
  const second = order[1];
  if (!second) return { outcome: "won", winnerId: top[0] };
  if (round === 2) return { outcome: "won", winnerId: top[0] };
  const total = order.reduce((sum, [, count]) => sum + count, 0);
  if (top[1] * 2 > total) return { outcome: "won", winnerId: top[0] };
  return { outcome: "runoff", finalistIds: [top[0], second[0]] };
}
