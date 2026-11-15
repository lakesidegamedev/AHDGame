/** The parts of a legislation type the rate lookup reads. */
export interface PrimaryTaxLaw {
  taxSlider?: unknown;
  policyOptions?: readonly { id: string; rate?: number }[];
}

/** An enacted policy row and the law it enacts. */
export interface EnactedPrimaryTax {
  policyOptionId?: string | null;
  law?: PrimaryTaxLaw;
}

const TAX_SLIDER_ID_PREFIX = "rate:";

/** The rate (%) one enacted row sets, or undefined when it names no rate. */
export function enactedTaxRate(row: EnactedPrimaryTax | undefined): number | undefined {
  if (!row?.law || !row.policyOptionId) return undefined;
  if (row.law.taxSlider && row.policyOptionId.startsWith(TAX_SLIDER_ID_PREFIX)) {
    const rate = Number(row.policyOptionId.slice(TAX_SLIDER_ID_PREFIX.length));
    return Number.isFinite(rate) ? rate : undefined;
  }
  return row.law.policyOptions?.find((o) => o.id === row.policyOptionId)?.rate;
}

/**
 * The regional primary tax rate (%). A slider bill's row wins. Saved worlds
 * may still hold the old-book row instead. Until either exists the national
 * budget's rate applies, then the configured default.
 */
export function resolvePrimaryTaxRate(input: {
  current?: EnactedPrimaryTax;
  legacy?: EnactedPrimaryTax;
  nationalRate?: number | null;
  defaultRate: number;
}): number {
  const national =
    typeof input.nationalRate === "number" && Number.isFinite(input.nationalRate)
      ? input.nationalRate
      : undefined;
  return (
    enactedTaxRate(input.current) ?? enactedTaxRate(input.legacy) ?? national ?? input.defaultRate
  );
}
