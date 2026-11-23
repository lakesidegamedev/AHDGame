/**
 * Shared air quality index for seeded regions, from annual PM2.5 in ug/m3.
 *
 * 100 at a clean background of 2 ug/m3, minus 6 points per ug/m3 above it, so
 * the WHO guideline (5) reads 82 and the North American standard (8.8) reads
 * about 59. Every country seed uses this one scale so equal air reads equal.
 */
export function airQualityIndexFromPm25(pm25: number): number {
  if (!Number.isFinite(pm25)) throw new Error("PM2.5 must be finite");
  return Math.round(Math.max(0, Math.min(100, 100 - 6 * (pm25 - 2))) * 10) / 10;
}
