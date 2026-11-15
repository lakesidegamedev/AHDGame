/* Timed economy-only pause: economy phases skip every turn strictly below
 * `economyPauseUntilTurn`; that turn runs normally so the world resumes
 * without a second command. Non-economic phases keep running. Skipped set
 * is imported from ELECTIONS_SKIP_PHASES so it cannot drift. Pure: turn
 * numbers in, decisions out. */
import { ELECTIONS_SKIP_PHASES } from "@/simulation/phases/simTurnProfiles";

export interface EconomyPauseStatus {
  /** True while the world is inside the window. */
  paused: boolean;
  /** First turn that runs the economy normally, or null when no pause is on. */
  resumesAtTurn: number | null;
  /** Turns left before the economy resumes, 0 when it is not paused. */
  turnsRemaining: number;
}

/**
 * A usable pause end, or null when the field is absent or malformed. An
 * invalid value means "no pause": a typo must not freeze a live economy.
 */
function resolveUntilTurn(untilTurn: number | null | undefined): number | null {
  if (typeof untilTurn !== "number" || !Number.isFinite(untilTurn)) return null;
  if (!Number.isInteger(untilTurn)) return null;
  return untilTurn;
}

/**
 * Phases in the skipped set a live world would otherwise run every turn. None
 * must run for a player action to settle safely while paused:
 *
 * - contractSettlement: every royalty is keyed to its turn, so a skipped turn
 *   pays nothing and nothing catches up on resume.
 * - savingsInterestTurn, bondTurn, lineOfCreditTurn, bankingTurn,
 *   npcBankPolicyTurn: each accrues for the turn it runs on, so balances hold
 *   and interest resumes instead of landing the whole window at once.
 * - departmentProgramSettlement: per-turn payouts; no backlog is owed.
 * - ledgerBalanceSnapshot, ledgerPreForexSnapshot, ledgerReconcile: skipped as
 *   a set, so the first resumed reconcile finds no opening snapshot and skips
 *   instead of reading the frozen window as drift. Cost: entries emitted during
 *   the pause are never reconciled.
 * - financialSuspectScan: detection only, settles no money.
 *
 * fiscalYear is the exception (LIVE_PAUSE_RUNS): it fires only on the calendar
 * boundary turn and is never replayed, so skipping it would lose that year's
 * budget rollover.
 */
const LIVE_PAUSE_RUNS: ReadonlySet<string> = new Set(["fiscalYear"]);

export function getEconomyPausePredicate(
  turnNumber: number,
  economyPauseUntilTurn: number | null | undefined
): ((phaseName: string) => boolean) | undefined {
  const untilTurn = resolveUntilTurn(economyPauseUntilTurn);
  if (untilTurn === null) return undefined;
  if (!Number.isInteger(turnNumber) || turnNumber >= untilTurn) return undefined;
  return (phaseName: string) =>
    LIVE_PAUSE_RUNS.has(phaseName) || !ELECTIONS_SKIP_PHASES.has(phaseName);
}

/**
 * Display half of the same window, for the turn status payload. Absent,
 * malformed and already-finished windows all read as not paused.
 */
export function economyPauseStatus(
  currentTurn: number,
  untilTurn: number | null | undefined
): EconomyPauseStatus {
  const resolved = resolveUntilTurn(untilTurn);
  if (resolved === null || !Number.isInteger(currentTurn) || currentTurn >= resolved) {
    return { paused: false, resumesAtTurn: null, turnsRemaining: 0 };
  }
  return {
    paused: true,
    resumesAtTurn: resolved,
    turnsRemaining: resolved - currentTurn,
  };
}
