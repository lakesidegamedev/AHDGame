/** Per-turn pool caps. Turnout itself comes from the census cells. */

/**
 * Cap a turn's released vote slice so the whole window cannot exceed the
 * electorate.
 *
 * Deliberately scales the SLICE only. The distributors normalise each group's
 * contribution by the totalPool they are handed and then multiply by the
 * slice, so "capping" by shrinking both the slice and the pool cancels to the
 * ballot and caps nothing (live-verified via the registered-voter gate's
 * first, broken placement). The caller must keep passing the truthful,
 * uncapped pool as the normalisation base.
 */
export function capTurnSliceToElectorate(
  slice: number,
  totalPool: number,
  electorate: number
): number {
  if (totalPool > electorate && electorate > 0) return slice * (electorate / totalPool);
  return slice;
}

/**
 * Scale a general-election vote pool down to the REGISTERED electorate.
 *
 * The resolved pool spans the whole electorate, but unregistered voters cannot
 * cast a general ballot; scaling keeps the general consistent with the primary
 * (which only draws registered slices).
 *
 * Shares are invariant to pool magnitude, so only ballot counts and turnout
 * percentages change, never outcomes.
 *
 * Missing or non-finite `unregisteredPct` leaves the pool untouched.
 */
export { scalePoolToRegistered } from "@/lib/elections/rules/registration";

/**
 * Hard ceiling on CUMULATIVE ballots: this turn's slice can release at most
 * the electorate that has not voted yet. The per-turn cap and registered
 * gate above bound the slice, but the office-strength/approval multiplier
 * is applied after them, so the closing surge could still push a race past
 * 100% turnout (a DD governor race certified 102.1%). Shrinking the slice
 * before distribution keeps shares invariant; only the final slice(s) lose
 * magnitude. A non-positive electorate (no state doc) leaves the slice alone.
 */
export function capTurnSliceToRemainingElectorate(
  slice: number,
  alreadyCast: number,
  electorate: number
): number {
  if (!(electorate > 0)) return slice;
  return Math.max(0, Math.min(slice, electorate - alreadyCast));
}
