/**
 * Tax loss carryforward (owner decision 2026-10-21, a soft cushion for
 * corporations): a turn's taxable loss is banked, and later profitable turns
 * offset up to LOSS_CARRYFORWARD_USE_CAP of their taxable profit with it, as
 * in real corporate tax law. No money is created; future tax is deferred.
 *
 * Pure: plain data in, plain data out.
 */

/** Share of a profitable turn's taxable profit the bank may offset. */
export const LOSS_CARRYFORWARD_USE_CAP = 0.8;

export interface LossCarryforwardState {
  /** Banked loss, anchor units. */
  anchor: number;
  /** Turn this state was written on, so a retried turn starts from `before`. */
  turn: number;
  /** Bank before that turn's update. */
  before: number;
}

/** The bank to start a turn from: a retry of the same turn starts from before it. */
export function openingCarryforward(
  state: LossCarryforwardState | undefined | null,
  turn: number
): number {
  if (!state) return 0;
  const value = state.turn === turn ? state.before : state.anchor;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Apply the bank to one turn's taxable base (profit is positive, loss is
 * negative). Returns the factor to scale this turn's tax by, the amount used,
 * and the bank afterwards.
 */
export function applyLossCarryforward(
  taxableBase: number,
  opening: number
): { taxScale: number; used: number; closing: number } {
  const bank = Number.isFinite(opening) && opening > 0 ? opening : 0;
  if (!Number.isFinite(taxableBase) || taxableBase <= 0) {
    const loss = Number.isFinite(taxableBase) ? -Math.min(0, taxableBase) : 0;
    return { taxScale: 1, used: 0, closing: bank + loss };
  }
  const used = Math.min(bank, LOSS_CARRYFORWARD_USE_CAP * taxableBase);
  return { taxScale: (taxableBase - used) / taxableBase, used, closing: bank - used };
}
