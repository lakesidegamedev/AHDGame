/**
 * Phases a singleplayer world does not need to run.
 *
 * Singleplayer is one account on one machine, with cheat commands available in
 * the UI by design. Everything in this list exists to catch a player abusing a
 * shared world at other players' expense: collusion, scripting, alts. None of
 * those exist with one player, so the work is pure cost. The scans were
 * measured at ~18% of every document a turn deserializes, and deserialization
 * dominates singleplayer turn CPU.
 *
 * This is a DENYLIST, deliberately: a new gameplay phase added later runs in
 * singleplayer automatically. The failure mode is "singleplayer does more work
 * than needed", never "singleplayer quietly stopped simulating something".
 *
 * Scope: this covers detection, not record-keeping. `activityLogging` still
 * runs because its audit trail is read by player-facing history surfaces.
 */
export const SINGLEPLAYER_SKIP_PHASES: ReadonlySet<string> = new Set<string>([
  /** Flags trade patterns between accounts. One account, no counterparties. */
  "financialSuspectScan",
  /** Looks for scripted or anomalous action sequences in the audit trail. */
  "auditAnomalyScan",
  /** Cross-account correlation for alt detection. */
  "suspiciousDetection",
  /** Production-only forensic snapshot. Compact local metrics live on gameState. */
  "gameHealthSnapshot",
]);

/**
 * Phase predicate for a singleplayer world, or undefined when every phase
 * should run. Undefined rather than an always-true function so callers can
 * cheaply tell "no filtering" from "filter that happens to pass".
 */
export function getSingleplayerPhasePredicate(
  singleplayer: boolean
): ((phaseName: string) => boolean) | undefined {
  if (!singleplayer) return undefined;
  return (phaseName: string) => !SINGLEPLAYER_SKIP_PHASES.has(phaseName);
}

/**
 * Combine phase predicates so a phase runs only if every predicate allows it.
 * Undefined predicates mean "no opinion" and are ignored; if none has an
 * opinion the result is undefined, which the runtime reads as "run everything".
 */
export function combinePhasePredicates(
  ...predicates: (((phaseName: string) => boolean) | undefined)[]
): ((phaseName: string) => boolean) | undefined {
  const active = predicates.filter(
    (predicate): predicate is (phaseName: string) => boolean => predicate !== undefined
  );
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  return (phaseName: string) => active.every((predicate) => predicate(phaseName));
}
