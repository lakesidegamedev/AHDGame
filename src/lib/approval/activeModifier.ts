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
  source?: "metric" | "address" | "war" | "banking" | "market" | "cabinet" | "fiscal";
  /** Where this effect comes from, in plain words (the law, statement, event or rule behind it). */
  detail?: string;
  /** Turn the effect started, when the engine knows it. */
  sinceTurn?: number;
  /** First turn the effect no longer applies, when the engine knows it. */
  expiresTurn?: number;
}

/**
 * Positives are summed and capped at this value; negatives are uncapped, so a
 * crisis stack still hurts. The rule engine and the display breakdown must
 * agree on it, so it lives with the arithmetic rather than with the engine.
 */
export const POSITIVE_MODIFIER_NET_CAP = 8;

/** Sum of every modifier's approval effect, rounded to one decimal. */
export function netModifierEffect(modifiers: ActiveModifier[]): number {
  const raw = modifiers.reduce((sum, modifier) => sum + modifier.effect, 0);
  return Number.isFinite(raw) ? Math.round(raw * 10) / 10 : 0;
}

const HEADLINE_MODIFIER_CAP = 8;

/**
 * Split active modifiers into headline (largest approval impact) and remainder lists
 * for compact UIs such as the state overview conditions card.
 */
export function prioritizeModifiers(
  modifiers: ActiveModifier[],
  opts?: { max?: number }
): { headline: ActiveModifier[]; remainder: ActiveModifier[] } {
  const max = opts?.max ?? HEADLINE_MODIFIER_CAP;
  if (modifiers.length <= max) {
    return { headline: modifiers, remainder: [] };
  }
  // Rank by approval impact: the biggest effect on the rating is the biggest driver,
  // whether or not it also moves profit margins (debt and deficit costs do not).
  const sorted = [...modifiers].sort((a, b) => {
    const impact = Math.abs(b.effect) - Math.abs(a.effect);
    if (impact !== 0) return impact;
    const margin = Math.abs(b.marginEffect ?? 0) - Math.abs(a.marginEffect ?? 0);
    if (margin !== 0) return margin;
    return a.label.localeCompare(b.label);
  });
  return {
    headline: sorted.slice(0, max),
    remainder: sorted.slice(max),
  };
}
