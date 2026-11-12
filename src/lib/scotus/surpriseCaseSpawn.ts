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

/**
 * Per-turn spawn probability by calendar year. The first band whose `fromYear`
 * is at or below the year wins; bands are listed latest first. From 2027 the
 * authored historical docket is empty, so surprise cases are the Court's whole
 * docket and run about three times as often (roughly one every 1.7 years).
 */
export const SURPRISE_CASE_SPAWN_BANDS: readonly {
  fromYear: number;
  probabilityPerTurn: number;
}[] = [
  { fromYear: 2027, probabilityPerTurn: 0.012 },
  { fromYear: -Infinity, probabilityPerTurn: SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN },
];

export function surpriseCaseSpawnProbabilityForYear(year: number): number {
  const band = SURPRISE_CASE_SPAWN_BANDS.find((b) => year >= b.fromYear);
  if (!band) throw new Error(`No surprise case spawn band covers year ${year}`);
  return band.probabilityPerTurn;
}

/** Years before a heard template may be drawn again once fresh ones run out. */
export const SURPRISE_CASE_REUSE_AFTER_YEARS = 12;

export interface HeardSurpriseCase {
  caseKey: string;
  decisionYear: number;
}

/**
 * Templates the Court may draw: any not yet heard, else any last heard at
 * least `SURPRISE_CASE_REUSE_AFTER_YEARS` ago. Fresh cases always win, so
 * recycling only starts once the era pool is spent.
 */
export function drawableTemplates<T extends { templateKey: string }>(
  eligible: readonly T[],
  heard: readonly HeardSurpriseCase[],
  currentYear: number
): T[] {
  const lastHeard = new Map<string, number>();
  for (const h of heard) {
    lastHeard.set(h.caseKey, Math.max(lastHeard.get(h.caseKey) ?? -Infinity, h.decisionYear));
  }
  const fresh = eligible.filter((t) => !lastHeard.has(t.templateKey));
  if (fresh.length > 0) return fresh;
  return eligible.filter(
    (t) =>
      currentYear - (lastHeard.get(t.templateKey) ?? -Infinity) >= SURPRISE_CASE_REUSE_AFTER_YEARS
  );
}

/**
 * Turns a surprise case waits on the docket between filing and its ruling
 * (48 turns a year, so roughly three to nine months). The delay is drawn
 * uniformly between the two bounds.
 */
export const SURPRISE_CASE_HEARING_DELAY_TURNS = { min: 12, max: 36 } as const;

export function surpriseCaseHearingDelayTurns(randomDraw: number): number {
  const { min, max } = SURPRISE_CASE_HEARING_DELAY_TURNS;
  return min + Math.min(max - min, Math.floor(randomDraw * (max - min + 1)));
}
