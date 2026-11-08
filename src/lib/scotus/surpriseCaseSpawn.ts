/**
 * Surprise Docket case spawn hazard.
 *
 * A small constant per-turn probability that a procedurally-spawned,
 * non-historical Docket case fires this turn, flavor content layered on top
 * of the curated real-historical Docket. Deliberately tuned to surface flavor
 * content occasionally over a multi-decade playthrough, rarer than authored
 * Docket cases by default.
 *
 * At 0.004/turn, a fully-seated Court averages roughly one surprise case every
 * ~250 turns (~5.2 years at TURNS_PER_YEAR = 48): rare enough to read as a genuine
 * surprise, frequent enough to plausibly show up more than once in a long game.
 */
export const SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN = 0.004;

/**
 * Decide whether a surprise case spawns this turn. Pure function — the
 * caller supplies the random draw so this stays deterministic/testable; no
 * DB dependency, no game-state lookup.
 */
export function rollSurpriseCaseSpawn(
  randomDraw: number,
  probability: number = SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN
): boolean {
  return randomDraw < probability;
}
