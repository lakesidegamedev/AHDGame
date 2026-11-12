export type LatentShortageFields = {
  demandTruncatedUnits?: number;
  latentShortageMultiple?: number;
};

/**
 * Truncated demand and latent shortage multiple for one commodity.
 *
 * `demandTruncatedUnits` is what the 1.5x caps removed this turn. The multiple
 * is uncapped demand over supply. Both are written to the price doc and
 * history; neither feeds prices, but the truncated units feed read-only build
 * signals. Omitted when nothing was truncated.
 */
export function latentShortageFields(
  bal: { supply: number; demand: number },
  truncated: number | undefined
): LatentShortageFields {
  if (!(typeof truncated === "number" && truncated > 0)) return {};
  const out: LatentShortageFields = {
    demandTruncatedUnits: Math.round(truncated * 100) / 100,
  };
  if (bal.supply > 0) {
    out.latentShortageMultiple = Math.round(((bal.demand + truncated) / bal.supply) * 1000) / 1000;
  }
  return out;
}

/** Persistence form that clears optional diagnostics omitted this turn. */
export function latentShortagePersistence(
  bal: { supply: number; demand: number },
  truncated: number | undefined
): { set: LatentShortageFields; unset: Record<string, ""> } {
  const set = latentShortageFields(bal, truncated);
  const unset: Record<string, ""> = {};
  if (set.demandTruncatedUnits === undefined) unset.demandTruncatedUnits = "";
  if (set.latentShortageMultiple === undefined) unset.latentShortageMultiple = "";
  return { set, unset };
}
