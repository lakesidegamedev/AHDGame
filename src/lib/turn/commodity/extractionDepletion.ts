import type { Db } from "mongodb";
import type { ExtractableResource } from "@/lib/constants/commodities";
import { getStateResourceCapacityCollection } from "@/lib/db/collections/stateResourceCapacity";
import type { ExtractionSectorInput } from "@/lib/turn/extraction/extractionCapacity";
import { buildDepletionInc } from "@/lib/extraction/depletion";

/**
 * Book this turn's extraction against each state's deposits (plants only).
 *
 * The ground gives up exactly what the world receives: units are the rationed
 * output the multipliers resolved, summed over the state's sectors.
 *
 * ACCURACY: `revenueBasedOutput` uses `sector.revenue`, which under plants is
 * the CAPACITY NAMEPLATE, not realized output, so booking against it ignores
 * ramp lambda, throughput and revenue multiplier. When `producedUnits` exists
 * (written only under plants) scale the nameplate split by realized/nameplate:
 * mix from the nameplate split, level from realized. Below plants there is no
 * `producedUnits`, so the fallback stays byte-identical.
 *
 * One `$inc` on the monotonic counter, so concurrent phases cannot lose
 * extraction. Matched on `stateId` alone, consistent with the read side, so the
 * write lands on the same doc the rationing resolved.
 */
export async function bookExtractionDepletion(
  db: Db,
  inputs: ReadonlyArray<ExtractionSectorInput>,
  multipliers: Map<string, Partial<Record<ExtractableResource, number>>>,
  now: Date,
  /**
   * sectorId → realized ÷ nameplate output. 1 (or absent) means "no realized
   * measurement for this sector", which is the pre-plants case and keeps the
   * booking identical to the nameplate derivation.
   */
  realizedFractionBySectorId?: ReadonlyMap<string, number>
): Promise<void> {
  const producedByState = new Map<string, Partial<Record<ExtractableResource, number>>>();
  for (const input of inputs) {
    const mult = multipliers.get(input.sectorId);
    const realizedFraction = realizedFractionBySectorId?.get(input.sectorId) ?? 1;
    const acc = producedByState.get(input.stateId) ?? {};
    for (const resource of Object.keys(input.revenueBasedOutput) as ExtractableResource[]) {
      const potential = input.revenueBasedOutput[resource] ?? 0;
      if (!(potential > 0)) continue;
      const produced = potential * (mult?.[resource] ?? 1) * realizedFraction;
      if (produced > 0) acc[resource] = (acc[resource] ?? 0) + produced;
    }
    producedByState.set(input.stateId, acc);
  }
  const ops = [];
  for (const [stateId, produced] of producedByState) {
    const inc = buildDepletionInc(produced);
    if (Object.keys(inc).length === 0) continue;
    ops.push({
      updateOne: { filter: { stateId }, update: { $inc: inc, $set: { updatedAt: now } } },
    });
  }
  if (ops.length === 0) return;
  const col = await getStateResourceCapacityCollection(db);
  await col.bulkWrite(ops as Parameters<typeof col.bulkWrite>[0]);
}
