import { STRANDED_LOW_FILL_THRESHOLD, STRANDED_WARN_TURNS } from "@/lib/corporations/strandedPlant";

/**
 * Whether the plant page warns that a plant is not selling its output, and on
 * what evidence.
 *
 * A plant with a funded sale record is judged only on that record: it warns
 * when less than half of what the plant offered on its latest settled turn
 * found a taker (sold, or delivered to the company's own sites). The settlement
 * keeps no count of consecutive low turns, so `turnsInRow` stays null and the
 * page states the latest turn only. Once the settlement records such a count,
 * pass it as `settledLowSaleTurns` and it is reported and required to reach
 * `STRANDED_WARN_TURNS`.
 *
 * A plant with no funded record (an older world, single player, a world's first
 * turn) keeps the legacy market estimate: the consecutive low-fill count from
 * the legacy pass.
 *
 * Pure: plain data in, the warning (or null) out.
 */

export type StrandedWarning =
  | {
      basis: "settlement";
      /** Share of the latest settled offer that found a taker, 0 to 1. */
      takenShare: number;
      /** Consecutive settled turns under half; null when the record keeps no count. */
      turnsInRow: number | null;
    }
  | {
      basis: "estimate";
      /** Last turn's sold share, 0 to 1, null when not recorded. */
      soldShare: number | null;
      /** Consecutive turns the legacy market estimate put under half. */
      turnsInRow: number;
    };

export interface StrandedWarningInput {
  /** Latest funded settlement totals; null when the plant has no funded sale record. */
  settled: { offered: number; taken: number } | null;
  /** Consecutive settled turns under half, once the settlement records it. */
  settledLowSaleTurns?: number | null;
  /** Legacy `lowFillTurns`; read only when there is no funded sale record. */
  legacyLowFillTurns: number | null;
  /** Last turn's sold share as the page shows it, for the estimate wording. */
  soldShare: number | null;
}

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function strandedWarning(input: StrandedWarningInput): StrandedWarning | null {
  if (input.settled) {
    const { offered, taken } = input.settled;
    if (!finite(offered) || !(offered > 0)) return null;
    const takenShare = Math.max(0, Math.min(1, (finite(taken) ? taken : 0) / offered));
    if (takenShare >= STRANDED_LOW_FILL_THRESHOLD) return null;
    const turnsInRow = finite(input.settledLowSaleTurns) ? input.settledLowSaleTurns : null;
    if (turnsInRow != null && turnsInRow < STRANDED_WARN_TURNS) return null;
    return { basis: "settlement", takenShare, turnsInRow };
  }
  const turns = finite(input.legacyLowFillTurns) ? input.legacyLowFillTurns : 0;
  if (turns < STRANDED_WARN_TURNS) return null;
  return { basis: "estimate", soldShare: input.soldShare, turnsInRow: turns };
}
