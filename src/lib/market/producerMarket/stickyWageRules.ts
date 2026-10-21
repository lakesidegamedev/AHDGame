/**
 * Sticky wages for the funded producer market (gameConfig.producerStickyWageStage
 * >= 1). Real layoffs lag output: a plant that runs less does not drop its wage
 * bill to the run share in one turn. Without that, the demand plan cuts wages
 * with output, households earn less, buy less, and the loop shrinks the economy.
 *
 * While a plant is not mothballed its wage bill falls at most DECLINE_PER_TURN
 * from last turn's, and never below FLOOR_SHARE of what a full run would pay.
 * Mothballing (or retirement, which shrinks the full-run bill) releases the
 * workers fully, so an owner always has an exit. The wage is paid from the
 * corporation's own cash to households; nothing is minted.
 *
 * Pure: this turn's computed bill and last turn's paid bill in, bill out.
 */
export const STICKY_WAGE_DECLINE_PER_TURN = 0.1;
export const STICKY_WAGE_FLOOR_SHARE = 0.5;

export function stickyWageBill(input: {
  /** The bill the plant's run share implies this turn. */
  computed: number;
  /** Wages paid last turn, including arrears; undefined without a prior funded receipt. */
  previousPaid: number | undefined;
  /** What a full run of the active capacity would pay. */
  fullRunBill: number;
  mothballed: boolean;
}): number {
  const computed = Number.isFinite(input.computed) ? Math.max(0, input.computed) : 0;
  if (input.mothballed || input.previousPaid == null || !Number.isFinite(input.previousPaid))
    return computed;
  const full = Number.isFinite(input.fullRunBill) ? Math.max(0, input.fullRunBill) : 0;
  const declineLimit = input.previousPaid * (1 - STICKY_WAGE_DECLINE_PER_TURN);
  const floor = full * STICKY_WAGE_FLOOR_SHARE;
  return Math.max(computed, declineLimit, floor);
}
