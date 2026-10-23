/** Lower capacity fulfillment means a tighter deposit constraint; break equal ties fairly. */
export function extractionRdTargetIndex(
  utilizations: readonly (number | undefined)[],
  rng: () => number
): number | null {
  let lowest = Infinity;
  let candidates: number[] = [];
  for (let index = 0; index < utilizations.length; index++) {
    const observed = utilizations[index];
    const utilization = observed !== undefined && Number.isFinite(observed) ? observed : 1;
    if (utilization < lowest) {
      lowest = utilization;
      candidates = [index];
    } else if (utilization === lowest) {
      candidates.push(index);
    }
  }
  if (candidates.length === 0) return null;
  // A unique winner consumes no extra draw, preserving the magnitude stream.
  if (candidates.length === 1) return candidates[0];
  return candidates[Math.floor(rng() * candidates.length)];
}
