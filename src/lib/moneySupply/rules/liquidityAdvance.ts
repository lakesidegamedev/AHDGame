/**
 * Provisional - the most central bank advance a bank may carry, as a fraction
 * of its deposits. The committee sizes an advance from GDP, not from the banks,
 * so an uncapped deposit-weighted split once handed a bank about fifteen times
 * its deposits. A liquidity top-up is sized to the deposit base it supports.
 */
export const LIQUIDITY_ADVANCE_MAX_DEPOSIT_FRACTION = 0.1;

export interface LiquidityAdvanceRecipient {
  /** Deposits the bank holds, in the advance currency. */
  deposits: number;
  /** Advance principal the bank already carries (`cbLiquidityAdvanceDebt`). */
  outstandingAdvance?: number;
}

function nonNegative(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Room left under the per-bank cap, after advances the bank already carries. */
export function liquidityAdvanceHeadroom(bank: LiquidityAdvanceRecipient): number {
  return Math.max(
    0,
    Math.floor(
      nonNegative(bank.deposits) * LIQUIDITY_ADVANCE_MAX_DEPOSIT_FRACTION -
        nonNegative(bank.outstandingAdvance)
    )
  );
}

/**
 * Deposit-weighted whole-unit shares, each capped at the bank's headroom. What
 * the caps leave over is not delivered: the result can sum to less than the
 * requested amount, and to zero when every bank is already at its cap.
 */
export function allocateLiquidityAdvance(
  amount: number,
  banks: readonly LiquidityAdvanceRecipient[]
): number[] {
  const weights = banks.map((bank) => nonNegative(bank.deposits));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return banks.map(() => 0);
  return banks.map((bank, index) =>
    Math.min(Math.floor((amount * weights[index]) / total), liquidityAdvanceHeadroom(bank))
  );
}
