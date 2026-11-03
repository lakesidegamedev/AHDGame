/** Illustrative uncertainty band for a granular poll segment, in points. Not a sample-based margin of error. */
export const BASE_UNCERTAINTY_BAND = 3.0;

/** Band width for a segment holding `share` (0 to 1) of the electorate. Smaller segments read wider. */
export function segmentUncertaintyBand(share: number): number {
  return BASE_UNCERTAINTY_BAND / Math.sqrt(share);
}
