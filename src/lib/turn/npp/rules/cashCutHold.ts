/**
 * Cash-cut build hold for AI-run corporations. A company whose plants could
 * not run last turn because it lacked the cash to fund them has idle capacity
 * already; another build spends the cash those plants need and adds more of
 * the same idle capacity. While any sector's latest funded run was cut by cash,
 * the AI queues no new capacity: no growth, no replacement, no new market.
 *
 * Plain data in, plain data out: no clock, rng or ambient state.
 */

/** A receipt older than this many turns no longer says anything about cash. */
export const CASH_CUT_EVIDENCE_MAX_AGE_TURNS = 2;

/** The parts of a funded settlement receipt the hold reads. */
export interface CashCutReceiptLike {
  worldEpoch?: string | null;
  turn?: number | null;
  runCutBy?: readonly string[] | null;
}

/** True when this receipt shows the plant's last funded run was cut by cash. */
export function lastRunCutByCash(
  receipt: CashCutReceiptLike | null | undefined,
  fundedWorldEpoch: string | null | undefined,
  turn: number
): boolean {
  if (!receipt || !fundedWorldEpoch || receipt.worldEpoch !== fundedWorldEpoch) return false;
  if (!receipt.runCutBy?.includes("cash")) return false;
  const receiptTurn = receipt.turn;
  return (
    typeof receiptTurn === "number" &&
    Number.isFinite(receiptTurn) &&
    turn - receiptTurn <= CASH_CUT_EVIDENCE_MAX_AGE_TURNS
  );
}

/** True when any sector's latest funded run was cut by cash. */
export function corpHeldByCashCut(
  sectors: readonly { producerSettlement?: CashCutReceiptLike | null }[],
  fundedWorldEpoch: string | null | undefined,
  turn: number
): boolean {
  return sectors.some((sector) =>
    lastRunCutByCash(sector.producerSettlement, fundedWorldEpoch, turn)
  );
}
