/** Preserve bottleneck priority while giving equal research targets a fair tie-break. */
export function extractionRdTargetIndex(
  utilizations: readonly (number | undefined)[],
  rng: () => number
): number | null {
  let highest = -Infinity;
  let candidates: number[] = [];
  for (let index = 0; index < utilizations.length; index++) {
    const observed = utilizations[index];
    const utilization = observed !== undefined && Number.isFinite(observed) ? observed : 1;
    if (utilization > highest) {
      highest = utilization;
      candidates = [index];
    } else if (utilization === highest) {
      candidates.push(index);
    }
  }
  if (candidates.length === 0) return null;
  // A unique winner consumes no extra draw, preserving the magnitude stream.
  if (candidates.length === 1) return candidates[0];
  return candidates[Math.floor(rng() * candidates.length)];
}
