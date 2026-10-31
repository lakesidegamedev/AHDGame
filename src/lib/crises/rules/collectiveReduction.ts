/**
 * Duration cut a crisis earns from a shared aid tally. Pure so the wiki chart and
 * the interaction engine read the same formula.
 */

/** Share of a crisis's base duration that full funding of the collective target removes. */
export const COLLECTIVE_MAX_DURATION_CUT = 0.5;

/** Turns removed from a crisis given funding progress. Zero without a positive target. */
export function collectiveDurationReduction(
  collectiveCurrent: number,
  collectiveTarget: number | null | undefined,
  baseDuration: number
): number {
  if (!collectiveTarget || collectiveTarget <= 0) return 0;
  const ratio = Math.min(1, collectiveCurrent / collectiveTarget);
  return Math.floor(baseDuration * ratio * COLLECTIVE_MAX_DURATION_CUT);
}
