/**
 * Bank stress accumulates until it is worth a whole turn of panic. A fractional
 * push (a policy stance, a mild shock) never starts a panic by itself; several
 * together do. Plain data in, plain data out.
 */

/** Stress that equals one turn of panic. */
export const STRESS_PER_PANIC_TURN = 1;

export interface BankStressOutcome {
  /** Panic turns to start now; 0 when the stress is still building. */
  panicTurns: number;
  /** Stress left over for the next push. */
  carry: number;
}

export function settleBankStress(
  carry: number,
  delta: number,
  maxPanicTurns: number
): BankStressOutcome {
  const total = Math.round((Math.max(0, carry) + Math.max(0, delta)) * 1e6) / 1e6;
  const whole = Math.floor(total / STRESS_PER_PANIC_TURN);
  if (whole <= 0) return { panicTurns: 0, carry: total };
  return {
    panicTurns: Math.min(maxPanicTurns, whole),
    carry: Math.round((total - whole * STRESS_PER_PANIC_TURN) * 1e6) / 1e6,
  };
}
