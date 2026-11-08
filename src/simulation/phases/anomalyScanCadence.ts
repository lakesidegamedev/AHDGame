/**
 * How often the anti-abuse scans run in a shared world.
 *
 * Each scan looks back over a rolling window (six turns for the ledger scans,
 * three to fourteen days for alt detection), so nothing depends on running
 * every turn: a transaction stays in the window for six turns whether examined
 * once or six times. Running every turn costs ~18% of every document a turn
 * deserializes.
 *
 * Every third turn keeps every transaction inside at least one window with a
 * turn to spare. The value must not exceed the shortest window (6) or coverage
 * develops holes; the predicate clamps for that.
 *
 * `AHD_ANOMALY_SCAN_EVERY_TURNS=1` restores per-turn scanning for incidents.
 */
export const ANOMALY_SCAN_EVERY_TURNS = 3;

/** Shortest rolling window among the scans; cadence must never exceed it. */
const SHORTEST_SCAN_WINDOW_TURNS = 6;

/** Only abuse detection follows this cadence. Shared-world health runs every turn. */
export const ANTI_ABUSE_SCAN_PHASES: ReadonlySet<string> = new Set([
  "financialSuspectScan",
  "auditAnomalyScan",
  "suspiciousDetection",
]);

export function resolveAnomalyScanCadence(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.AHD_ANOMALY_SCAN_EVERY_TURNS;
  const parsed = raw === undefined || raw === "" ? ANOMALY_SCAN_EVERY_TURNS : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return ANOMALY_SCAN_EVERY_TURNS;
  return Math.min(parsed, SHORTEST_SCAN_WINDOW_TURNS);
}

/**
 * Phase predicate that lets the anti-abuse scans run only on turns that are
 * a multiple of the cadence. Undefined when the cadence is 1 (every turn),
 * so the runtime sees "no opinion" rather than a filter that always passes.
 */
export function getAnomalyScanCadencePredicate(
  currentTurn: number,
  everyTurns: number = resolveAnomalyScanCadence()
): ((phaseName: string) => boolean) | undefined {
  if (everyTurns <= 1) return undefined;
  const scanTurn = currentTurn % everyTurns === 0;
  return (phaseName: string) => scanTurn || !ANTI_ABUSE_SCAN_PHASES.has(phaseName);
}
