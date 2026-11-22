/**
 * Whole-plant build progress. The sector build panel, the Operations table
 * and the build dialog all count plants through this one function, so
 * "N of M built" reads the same everywhere. A plant counts as built only when
 * all of it has arrived; a plant a third done is still being built.
 */
export interface PlantBuildOrderUnits {
  /** Capacity units on this order. */
  unitsOrdered: number;
  /** Capacity units delivered as of the last settled turn. */
  unitsDelivered: number;
}

export interface PlantBuildProgress {
  ordered: number;
  built: number;
  building: number;
}

const EPSILON = 1e-9;

/** Whole plants one order buys: at least one when anything is ordered. */
function orderedPlants(unitsOrdered: number, unitsPerPlant: number): number {
  if (!Number.isFinite(unitsOrdered) || unitsOrdered <= 0) return 0;
  return Math.max(1, Math.floor(unitsOrdered / unitsPerPlant + EPSILON));
}

export function plantBuildProgress(
  orders: readonly PlantBuildOrderUnits[],
  unitsPerPlant: number
): PlantBuildProgress {
  const size = Math.max(1, unitsPerPlant);
  let ordered = 0;
  let built = 0;
  for (const order of orders) {
    const plants = orderedPlants(order.unitsOrdered, size);
    if (plants <= 0) continue;
    const arrived = Math.max(0, Number.isFinite(order.unitsDelivered) ? order.unitsDelivered : 0);
    ordered += plants;
    built += Math.min(plants, Math.floor(arrived / size + EPSILON));
  }
  return { ordered, built, building: ordered - built };
}
