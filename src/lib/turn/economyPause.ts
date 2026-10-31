/**
 * Timed economy-only pause for a live world.
 *
 * After an economy reset the owner can freeze the economy for a fixed number of
 * hourly turns while politics, elections, campaigns, parties, legislation and
 * everything else non-economic keeps running. The window is one turn number on
 * gameConfig (`economyPauseUntilTurn`): economy phases are skipped on every turn
 * strictly below it, and the turn numbered `economyPauseUntilTurn` runs the
 * economy normally, so the world resumes on its own with no second command.
 *
 * The skipped set is ELECTIONS_SKIP_PHASES (src/simulation/phases/
 * simTurnProfiles.ts), the same econ/political boundary the sandbox
 * "elections-only" profile uses. It is imported, never copied, so the two
 * cannot drift apart. This module stays pure: turn numbers in, decisions out,
 * no database, no clock, no environment.
 */
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
 * Phases in the skipped set that a live world (unlike a sandbox) would
 * otherwise run every turn. None of them has to run for a player action to
 * settle safely while the pause is on:
 *
 * - contractSettlement: every royalty is keyed to the turn it belongs to
 *   (`lastRoyaltyTurn >= turn` skips, `expiresTurn <= turn` expires), so a
 *   skipped turn pays nothing and nothing catches up on resume. Existing
 *   extraction contracts stop paying for the window and keep their term.
 * - savingsInterestTurn, bondTurn, lineOfCreditTurn, bankingTurn,
 *   npcBankPolicyTurn: each accrues for the turn it runs on (savings interest
 *   compounds on turn multiples, for example) and never for a turn it did not
 *   run, so balances hold and interest resumes instead of landing 24 turns of
 *   it at once.
 * - departmentProgramSettlement: per-turn programme payouts, which pause and
 *   resume; no backlog is owed for the skipped turns.
 * - ledgerBalanceSnapshot, ledgerPreForexSnapshot, ledgerReconcile: the shadow
 *   ledger (off in production seeds) is skipped as a set. reconcileTurn on the
 *   first resumed turn finds no opening snapshot at turn minus one and skips
 *   its stock-vs-flow check, instead of reading 24 frozen turns as one turn of
 *   drift. The cost is that entries player actions emit during the pause are
 *   never reconciled, and that single check is lost.
 * - financialSuspectScan: detection only, settles no money.
 *
 * fiscalYear is the exception and keeps running (LIVE_PAUSE_RUNS): it fires
 * only on the calendar boundary turn and is never replayed, and with 48 turns a
 * year a 24 turn window covers a year end about half the time. Skipping it
 * would lose that year's budget rollover outright.
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
