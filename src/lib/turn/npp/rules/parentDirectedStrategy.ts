import type { CorporateSector } from "@/lib/db/types";

/**
 * True while a strategy the controlling parent's CEO chose for this sector is
 * shielded from the subsidiary's AI manager. The AI neither retools nor
 * reverts the sector until the stamped `untilTurn`.
 */
export function isParentDirectedStrategyProtected(
  sector: Pick<CorporateSector, "parentDirectedStrategy">,
  turn: number
): boolean {
  const untilTurn = sector.parentDirectedStrategy?.untilTurn;
  return typeof untilTurn === "number" && turn < untilTurn;
}
