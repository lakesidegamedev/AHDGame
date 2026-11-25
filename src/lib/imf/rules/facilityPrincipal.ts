/** Consolidate native bond obligations into one currency-independent IMF facility. */
export function imfFacilityPrincipalAnchor(
  rows: readonly { retainedFace: number; localPerAnchor: number }[]
): number {
  return rows.reduce((sum, row) => {
    if (!Number.isFinite(row.localPerAnchor) || row.localPerAnchor <= 0)
      throw new Error("IMF consolidation requires a valid exchange quote");
    if (!Number.isFinite(row.retainedFace) || row.retainedFace < 0)
      throw new Error("IMF consolidation requires finite retained principal");
    return sum + row.retainedFace / row.localPerAnchor;
  }, 0);
}
