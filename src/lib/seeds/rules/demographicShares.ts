/** Round one demographic share table while conserving exactly 10,000 basis points. */
import { largestRemainderAllocate } from "@/lib/redistricting/budget";

export function roundedDemographicShares(
  weights: Readonly<Record<string, number>>
): Record<string, number> {
  const ids = Object.keys(weights).sort();
  if (
    !ids.length ||
    ids.some((id) => !Number.isFinite(weights[id]) || weights[id] < 0) ||
    ids.reduce((sum, id) => sum + weights[id], 0) <= 0
  )
    throw new Error("Invalid demographic share weights");
  const points = largestRemainderAllocate(
    10_000,
    ids.map((id) => weights[id])
  );
  return Object.fromEntries(ids.map((id, index) => [id, points[index] / 100]));
}
