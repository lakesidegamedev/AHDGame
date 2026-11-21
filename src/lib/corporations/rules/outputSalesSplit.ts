/**
 * Which of a multi-output site's products sold and which sat unsold.
 *
 * Sector-wide warnings blend every output into one sold share, so a campus
 * selling all its electronics and none of its software read "this plant cannot
 * sell its output". This names the products instead.
 */
export interface OutputSale {
  label: string;
  /** Share of this output that sold last turn, 0-1; undefined when not measured. */
  soldFraction?: number;
}

export interface OutputSalesSplit {
  /** Products that sold at least SELLING_SHARE of their output. */
  selling: { label: string; pct: number }[];
  /** Products that sold under STUCK_SHARE of their output. */
  stuck: { label: string; pct: number }[];
}

export const SELLING_SHARE = 0.9;
export const STUCK_SHARE = 0.5;

/** Null unless the site makes more than one measured product and they split. */
export function outputSalesSplit(
  outputs: readonly OutputSale[] | undefined
): OutputSalesSplit | null {
  const measured = (outputs ?? []).filter(
    (o): o is Required<OutputSale> =>
      typeof o.soldFraction === "number" && Number.isFinite(o.soldFraction)
  );
  if (measured.length < 2) return null;
  const pct = (o: Required<OutputSale>) =>
    Math.round(Math.max(0, Math.min(1, o.soldFraction)) * 100);
  const selling = measured
    .filter((o) => o.soldFraction >= SELLING_SHARE)
    .map((o) => ({ label: o.label, pct: pct(o) }));
  const stuck = measured
    .filter((o) => o.soldFraction < STUCK_SHARE)
    .map((o) => ({ label: o.label, pct: pct(o) }));
  return selling.length > 0 && stuck.length > 0 ? { selling, stuck } : null;
}

/** "Software (12% sold)" or "Software (12% sold) and Steel (0% sold)". */
export function listOutputs(items: readonly { label: string; pct: number }[]): string {
  const parts = items.map((i) => `${i.label} (${i.pct}% sold)`);
  return parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
