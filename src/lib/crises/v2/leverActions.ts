/** Fewest and most action points a lever can ask of its holder. */
export const MIN_LEVER_ACTIONS = 1;
export const MAX_LEVER_ACTIONS = 3;

/**
 * Action points a lever costs its holder. A definition's `politicalCapital`
 * rating says how big the move is; the holder pays for it out of the same
 * per-turn action budget as campaigning and legislating. Scaled by intensity,
 * rounded up, so any real pull costs at least one action.
 */
export function leverActionCost(politicalCapital: number | undefined, intensity = 1): number {
  if (!politicalCapital || politicalCapital <= 0 || intensity <= 0) return 0;
  const size = politicalCapital * intensity;
  const raw = size <= 3 ? 1 : size <= 5 ? 2 : 3;
  return Math.min(MAX_LEVER_ACTIONS, Math.max(MIN_LEVER_ACTIONS, raw));
}
