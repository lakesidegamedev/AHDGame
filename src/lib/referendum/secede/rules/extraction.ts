/** No geological detail exists below the old aggregate. Keep its deposits with
 * installed extraction, using the same placement plan as the plants. Undeveloped
 * resources retain the documented GDP-weight fallback rather than being created. */
export function extractionAllocationWeights(
  fallback: Record<string, number>,
  plants: readonly { regionId: string; capacity: number; supply: Record<string, number> }[]
): Record<string, Record<string, number>> {
  const totals: Record<string, Record<string, number>> = {};
  for (const plant of plants) {
    if (
      !Object.hasOwn(fallback, plant.regionId) ||
      !Number.isFinite(plant.capacity) ||
      plant.capacity < 0
    )
      throw new Error("Invalid extraction placement");
    const totalRate = Object.values(plant.supply).reduce((sum, rate) => sum + Math.max(0, rate), 0);
    for (const [resource, rate] of Object.entries(plant.supply)) {
      if (!Number.isFinite(rate) || rate < 0) throw new Error("Invalid extraction recipe");
      if (!totalRate || !plant.capacity || !rate) continue;
      const row = (totals[resource] ??= Object.fromEntries(
        Object.keys(fallback).map((id) => [id, 0])
      ));
      row[plant.regionId] += (plant.capacity * rate) / totalRate;
    }
  }
  return Object.fromEntries(
    Object.entries(totals).map(([resource, row]) => {
      const sum = Object.values(row).reduce((a, b) => a + b, 0);
      return [
        resource,
        Object.fromEntries(Object.entries(row).map(([id, amount]) => [id, amount / sum])),
      ];
    })
  );
}
/** Capacity, depletion and offer fees divide; contractual percentage shares and rates do not. */
export function splitExtractionFields(
  doc: Record<string, unknown>,
  weight: number,
  countryId: string,
  regionId: string,
  capacity: boolean,
  resourceWeights?: Record<string, number>
): Record<string, unknown> {
  if (!(weight > 0 && weight <= 1)) throw new Error("Invalid extraction allocation");
  if (capacity)
    return {
      resources: Object.fromEntries(
        Object.entries((doc.resources ?? {}) as Record<string, number>).map(
          ([resource, amount]) => [resource, amount * (resourceWeights?.[resource] ?? weight)]
        )
      ),
      ...(doc.extractedUnits
        ? {
            extractedUnits: Object.fromEntries(
              Object.entries(doc.extractedUnits as Record<string, number>).map(
                ([resource, amount]) => [resource, amount * (resourceWeights?.[resource] ?? weight)]
              )
            ),
          }
        : {}),
    };
  return {
    ...(typeof doc.signingFeeAnchor === "number"
      ? { signingFeeAnchor: doc.signingFeeAnchor * weight }
      : {}),
    grantedBy: doc.grantedByLevel === "national" ? countryId : regionId,
  };
}
