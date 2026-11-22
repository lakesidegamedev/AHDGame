export interface TaxLineCheck {
  /** Tax base times rate, from the base stored beside the booked line. */
  computed: number | null;
  /** Booked minus computed, as a share of computed; null when not comparable. */
  gapPct: number | null;
  /** True when the booked line is within rounding of base times rate. */
  matches: boolean;
}

const MATCH_TOLERANCE_PCT = 0.5;

export function checkTaxLine(
  booked: number,
  ratePercent: number | undefined,
  base: number | undefined
): TaxLineCheck {
  if (
    ratePercent == null ||
    base == null ||
    !Number.isFinite(base) ||
    !Number.isFinite(ratePercent) ||
    base <= 0 ||
    ratePercent <= 0
  ) {
    return { computed: null, gapPct: null, matches: true };
  }
  const computed = base * (ratePercent / 100);
  const gapPct = ((booked - computed) / computed) * 100;
  return { computed, gapPct, matches: Math.abs(gapPct) <= MATCH_TOLERANCE_PCT };
}

/**
 * Lines whose sum is the stated total. Any difference between the booked total
 * and the lines the page lists is shown as its own line instead of being hidden.
 */
export function reconcileRevenueLines(revenue: object): {
  lines: Array<{ key: string; value: number }>;
  total: number;
} {
  const entries = Object.entries(revenue) as Array<[string, unknown]>;
  const lines: Array<{ key: string; value: number }> = [];
  for (const [key, value] of entries) {
    if (key !== "total" && typeof value === "number" && value !== 0) lines.push({ key, value });
  }
  const listed = lines.reduce((sum, line) => sum + line.value, 0);
  const stated = entries.find(([key]) => key === "total")?.[1];
  const total = typeof stated === "number" ? stated : listed;
  const residual = total - listed;
  if (Math.abs(residual) > Math.max(1, Math.abs(total) * 1e-6)) {
    lines.push({ key: "unitemisedRevenue", value: residual });
  }
  return { lines, total };
}
