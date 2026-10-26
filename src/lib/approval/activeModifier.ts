/**
 * The shape and arithmetic of one active approval modifier, split from the
 * rule engine in `utils/approvalModifiers`.
 *
 * The engine imports the state-metric catalog, era band curves and every
 * country's threshold patches. A display component that only lists modifiers
 * and sums their effects must not pull any of that into the browser, so the
 * shared value type and the sum live here.
 */
export interface ActiveModifier {
  id: string;
  label: string;
  effect: number; // positive = boost, negative = malus
  /** Stacked profit-margin swing in percentage points (capped at turn time). */
  marginEffect?: number;
  /**
   * Where the modifier originated — metric thresholds, a governor address, or
   * the war block. The war block contributes one chip per term (effort,
   * exhaustion, alliance contribution), each declaring `marginEffect: 0`; none
   * may be treated as a metric condition by the margin fallbacks or by the chip
   * tooltips.
   */
  source?: "metric" | "address" | "war" | "banking" | "market" | "cabinet";
}

/** Sum of every modifier's approval effect, rounded to one decimal. */
export function netModifierEffect(modifiers: ActiveModifier[]): number {
  const raw = modifiers.reduce((sum, modifier) => sum + modifier.effect, 0);
  return Number.isFinite(raw) ? Math.round(raw * 10) / 10 : 0;
}
