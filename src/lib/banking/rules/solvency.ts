/**
 * Run and contagion constants, and the failure test itself. The solvency turn
 * is the shell that reads the banks, applies these, and writes the outcome.
 */

import type { ConfidenceBand } from "@/lib/banking/rules/confidence";
import { RUN_FAILURE_COVER_FRACTION } from "@/lib/banking/rules/balanceSheet";

/**
 * Provisional - fraction of npcDeposits that flee per solvency turn by band.
 * Independent of the banking turn's normal NPC flow cap.
 */
export const FLIGHT_RATE_BY_BAND: Readonly<Record<"amber" | "red", number>> = {
  amber: 0.1,
  red: 0.3,
};

/** Provisional - panicTurns stamped onto same-currency peers on a failure. */
export const CONTAGION_PANIC_TURNS = 4;

/**
 * Turns a liquid deposit taker gets to close a balance-sheet hole before it is
 * resolved. The owner is told the deficit and the deadline the turn it opens.
 */
export const INSOLVENCY_CURE_TURNS = 3;

/**
 * A hole deeper than this share of everything the bank owes is resolved at
 * once: depositors are better served by the estate now than by a bank that
 * cannot plausibly be recapitalized in the cure window.
 */
export const INSOLVENCY_IMMEDIATE_DEFICIT_SHARE = 0.05;

export type DepositTakerVerdict =
  | { outcome: "sound" }
  | {
      outcome: "cure";
      /** Turn the current hole opened; kept across turns, cleared once equity is back. */
      insolventSinceTurn: number;
      /** The bank is resolved on this turn if equity is still negative. */
      deadlineTurn: number;
      deficit: number;
    }
  | { outcome: "fail"; reason: "run" | "insolvent" };

/**
 * Whether a deposit taker is resolved this turn.
 *
 * A run (published red and below the run line, {@link RUN_FAILURE_COVER_FRACTION}
 * of required reserves) fails at once: red was the warning. A balance-sheet hole
 * in a bank that still meets its reserve requirement gets
 * {@link INSOLVENCY_CURE_TURNS} turns to recapitalize; a deep hole, an illiquid
 * bank, or a caller that does not say what is owed is resolved at once.
 */
export function depositTakerVerdict(input: {
  turn: number;
  priorBand: ConfidenceBand | undefined;
  cashReserves: number;
  /** Marked sovereign treasuries: sellable the same turn, so they meet a run too. */
  liquidSecurities?: number;
  requiredLiquidity: number;
  /** Freshly marked assets less all cash-backed claims; absent for legacy callers. */
  netAssets?: number;
  /** Everything owed to non-shareholders: cash-backed deposits plus borrowings. */
  owed?: number;
  /** Stamp from an earlier turn of the same hole. */
  insolventSinceTurn?: number;
}): DepositTakerVerdict {
  const liquid = input.cashReserves + Math.max(0, input.liquidSecurities ?? 0);
  const required = Math.max(0, input.requiredLiquidity);
  if (input.priorBand === "red" && liquid < RUN_FAILURE_COVER_FRACTION * required) {
    return { outcome: "fail", reason: "run" };
  }
  if (input.netAssets === undefined || input.netAssets >= -0.01) return { outcome: "sound" };

  const deficit = -input.netAssets;
  const deep =
    input.owed === undefined ||
    deficit > INSOLVENCY_IMMEDIATE_DEFICIT_SHARE * Math.max(0, input.owed);
  if (deep || liquid < required) return { outcome: "fail", reason: "insolvent" };

  const since =
    typeof input.insolventSinceTurn === "number" && input.insolventSinceTurn <= input.turn
      ? input.insolventSinceTurn
      : input.turn;
  const deadlineTurn = since + INSOLVENCY_CURE_TURNS;
  if (input.turn >= deadlineTurn) return { outcome: "fail", reason: "insolvent" };
  return { outcome: "cure", insolventSinceTurn: since, deadlineTurn, deficit };
}

/** An investment bank fails when red with no equity left behind its book. */
export function propBankFails(input: { band: ConfidenceBand; equityBase: number }): boolean {
  return input.band === "red" && input.equityBase <= 0;
}

/** Deposits that flee this turn under a published band, capped at cash on hand. */
export function depositFlight(input: {
  priorBand: ConfidenceBand | undefined;
  npcDeposits: number;
  cashReserves: number;
}): number {
  if (input.priorBand !== "amber" && input.priorBand !== "red") return 0;
  const rate = FLIGHT_RATE_BY_BAND[input.priorBand];
  return Math.min(Math.max(0, input.npcDeposits) * rate, Math.max(0, input.cashReserves));
}
