/**
 * Whole plants: a plant is the unit players build and own, and a sector's
 * capacity is always a whole number of plants.
 *
 * Behind `gameConfig.wholePlantsStage` (0 or absent = off). With the stage on:
 *
 *   capitalStock === plantCount * size
 *   0 <= plantUnitRemainder < size   construction credit, does not produce
 *   0 <= plantWearUnits     < size   wear toward the next plant coming off
 *
 * where `size = plantSizeForSector(sector)`. Losses (depreciation, recession,
 * idle retirement, shed) fill the wear counter and a whole plant comes off when
 * it reaches one plant. Free or partial gains (R&D, grants, rescale leftovers)
 * fill the credit and a whole plant is added when it reaches one plant. The
 * last plant of a sector never wears out.
 *
 * Plain data in, plain data out. No database, clock or randomness.
 */

/** `gameConfig.wholePlantsStage` value from which whole plants are on. */
export const WHOLE_PLANTS_ON_STAGE = 1;

export function wholePlantsOn(stage: number | null | undefined): boolean {
  return typeof stage === "number" && Number.isFinite(stage) && stage >= WHOLE_PLANTS_ON_STAGE;
}

/** Float slack when testing whether a counter has reached one plant. */
const PLANT_EPSILON = 1e-9;

function finiteNonNegative(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function validSize(size: number): number {
  return Number.isFinite(size) && size > 0 ? size : 1;
}

/** Whole plants in `units`, tolerant of float noise just below a boundary. */
export function wholePlantsIn(units: number, size: number): number {
  const s = validSize(size);
  return Math.max(0, Math.floor(finiteNonNegative(units) / s + PLANT_EPSILON));
}

/**
 * Snap a stock to whole plants. The part-plant surplus is returned as credit.
 * A positive stock below one plant rounds UP to one plant with no credit: a
 * player who holds any capacity owns a plant.
 */
export function snapToPlants(
  stock: number | null | undefined,
  size: number
): { plants: number; creditUnits: number } {
  const s = validSize(size);
  const units = finiteNonNegative(stock);
  if (units <= 0) return { plants: 0, creditUnits: 0 };
  const plants = wholePlantsIn(units, s);
  if (plants === 0) return { plants: 1, creditUnits: 0 };
  return { plants, creditUnits: Math.max(0, units - plants * s) };
}

export interface WholePlantLedger {
  capitalStock: number;
  plantCount: number;
  plantUnitRemainder: number;
  plantWearUnits: number;
}

export interface PlantChange {
  /** Capacity units of credit toward new plants (free or partial gains). */
  gainUnits?: number;
  /** Capacity units of wear toward plants coming off. */
  lossUnits?: number;
  /**
   * Keep the last plant (default true). Wear can take a sector down to one
   * plant, never to zero.
   */
  protectLastPlant?: boolean;
}

export interface PlantChangeResult extends WholePlantLedger {
  plantsAdded: number;
  plantsRemoved: number;
  /**
   * Share of the opening plants (after the snap and any credit conversion)
   * that is still owned. The paid basis scales by this, so the per-plant book
   * stays flat when a plant wears out, exactly as depreciation does today.
   */
  bookRetention: number;
}

/**
 * Apply gains and losses to a sector's whole-plant ledger.
 *
 * A stock that is not a multiple of the plant size (written by a path that
 * does not know about whole plants yet) is snapped first and the surplus
 * becomes credit, so nothing is lost.
 */
export function applyPlantChange(
  ledger: {
    capitalStock: number | null | undefined;
    plantUnitRemainder?: number | null;
    plantWearUnits?: number | null;
  },
  size: number,
  change: PlantChange = {}
): PlantChangeResult {
  const s = validSize(size);
  const snapped = snapToPlants(ledger.capitalStock, s);
  let plants = snapped.plants;
  let credit =
    finiteNonNegative(ledger.plantUnitRemainder) +
    snapped.creditUnits +
    finiteNonNegative(change.gainUnits);
  const plantsAdded = wholePlantsIn(credit, s);
  plants += plantsAdded;
  credit = Math.max(0, credit - plantsAdded * s);

  let wear = plants > 0 ? finiteNonNegative(ledger.plantWearUnits) : 0;
  wear += plants > 0 ? finiteNonNegative(change.lossUnits) : 0;
  const due = wholePlantsIn(wear, s);
  const removable = change.protectLastPlant === false ? plants : Math.max(0, plants - 1);
  const plantsRemoved = Math.min(due, removable);
  const plantsBefore = plants;
  plants -= plantsRemoved;
  wear = Math.max(0, wear - plantsRemoved * s);
  // The last plant does not wear out: wear it could not take is dropped, so a
  // second plant built later does not come off the turn it lands.
  if (plants === 0 || wear >= s - PLANT_EPSILON * s) wear = 0;
  if (credit >= s - PLANT_EPSILON * s) credit = 0;

  return {
    capitalStock: plants * s,
    plantCount: plants,
    plantUnitRemainder: credit,
    plantWearUnits: wear,
    plantsAdded,
    plantsRemoved,
    bookRetention: plantsBefore > 0 ? plants / plantsBefore : 1,
  };
}

/**
 * Plant steps for a build order. An order stamped with `plantUnits` delivers
 * whole plants: plant k of p lands on the first turn the linear ramp passes
 * k/p, the last on `onlineTurn`. Returns the stepped delivered fraction.
 */
export function steppedDeliveredFraction(
  linearFraction: number,
  unitsOrdered: number,
  plantUnits: number
): number {
  if (!(plantUnits > 0) || !(unitsOrdered > 0)) return linearFraction;
  const plants = Math.max(1, Math.round(unitsOrdered / plantUnits));
  if (linearFraction >= 1) return 1;
  if (linearFraction <= 0) return 0;
  return Math.floor(plants * linearFraction + PLANT_EPSILON) / plants;
}

/** Largest whole-plant order not above `units`; 0 when below one plant. */
export function floorUnitsToPlants(units: number, size: number): number {
  const s = validSize(size);
  return wholePlantsIn(units, s) * s;
}

/** True when `units` is a positive whole number of plants. */
export function isWholePlantOrder(units: number, size: number): boolean {
  const s = validSize(size);
  if (!(units > 0)) return false;
  const plants = Math.round(units / s);
  return plants >= 1 && Math.abs(plants * s - units) <= PLANT_EPSILON * s;
}

// ─── One-time conversion ───────────────────────────────────────────────────

export interface ConversionSectorInput {
  capitalStock: number | null | undefined;
  capacityBookAnchor: number | null | undefined;
  /** Fallback per-unit list price when the sector has no recorded basis. */
  listPricePerUnitAnchor: number;
  size: number;
}

export interface ConversionSectorResult {
  plants: number;
  capitalStock: number;
  /** Part-plant units recounted away (credited as money). */
  remainderUnits: number;
  /** Book value of those units, refunded to the owner (anchor). */
  creditAnchor: number;
  capacityBookAnchor: number;
  /** True when the sector held less than one plant and rounded up for free. */
  roundedUp: boolean;
}

/**
 * Recount one sector to whole plants. The part-plant remainder is credited at
 * book cost; a sector below one plant rounds up to one plant at no charge.
 */
export function convertSectorToWholePlants(
  input: ConversionSectorInput
): ConversionSectorResult | null {
  const stock = finiteNonNegative(input.capitalStock);
  if (stock <= 0) return null;
  const size = validSize(input.size);
  const book =
    typeof input.capacityBookAnchor === "number" &&
    Number.isFinite(input.capacityBookAnchor) &&
    input.capacityBookAnchor >= 0
      ? input.capacityBookAnchor
      : stock * finiteNonNegative(input.listPricePerUnitAnchor);
  const perUnit = book / stock;
  const floored = wholePlantsIn(stock, size);
  if (floored === 0) {
    return {
      plants: 1,
      capitalStock: size,
      remainderUnits: 0,
      creditAnchor: 0,
      capacityBookAnchor: book,
      roundedUp: true,
    };
  }
  const remainderUnits = Math.max(0, stock - floored * size);
  const creditAnchor = remainderUnits * perUnit;
  return {
    plants: floored,
    capitalStock: floored * size,
    remainderUnits,
    creditAnchor,
    capacityBookAnchor: Math.max(0, book - creditAnchor),
    roundedUp: false,
  };
}

export interface ConversionOrderInput {
  undeliveredUnits: number;
  undeliveredCost: number;
  onlineTurn: number;
}

export type ConversionOrderResult =
  | {
      kind: "rewrite";
      unitsOrdered: number;
      costPaidAnchor: number;
      startTurn: number;
    }
  | { kind: "cancel" };

export interface ConversionQueueResult {
  /** One entry per input order, in input order. */
  orders: ConversionOrderResult[];
  /** Paid cost of the part-plant left over across the sector's orders. */
  refundAnchor: number;
  plants: number;
  /** True when a sector with no plant got its first plant for free. */
  roundedUp: boolean;
}

/**
 * Recount a sector's in-flight cash orders to whole plants.
 *
 * The orders are pooled in online-turn order: plant k lands with the order at
 * which the running total of undelivered units first reaches k plants, so
 * small orders that add up to plants keep them. Each kept plant costs the
 * pool's average paid cost per unit, and the part-plant left over is refunded
 * at that cost. Remaining plants ramp from now to each order's unchanged
 * online turn. A sector that owns no plant and whose orders add up to less
 * than one plant gets one plant at no extra charge.
 */
export function convertQueueToWholePlants(
  orders: readonly ConversionOrderInput[],
  input: { size: number; currentTurn: number; sectorHasPlants: boolean }
): ConversionQueueResult {
  const size = validSize(input.size);
  const rows = orders.map((o, index) => ({
    index,
    u: finiteNonNegative(o.undeliveredUnits),
    c: finiteNonNegative(o.undeliveredCost),
    onlineTurn: o.onlineTurn,
  }));
  const totalUnits = rows.reduce((sum, r) => sum + r.u, 0);
  const totalCost = rows.reduce((sum, r) => sum + r.c, 0);
  const result: ConversionOrderResult[] = rows.map(() => ({ kind: "cancel" }));
  if (rows.length === 0 || totalUnits <= 0) {
    return { orders: result, refundAnchor: totalCost, plants: 0, roundedUp: false };
  }
  const perUnit = totalCost / totalUnits;
  const plants = wholePlantsIn(totalUnits, size);
  const byOnline = [...rows].sort((a, b) => a.onlineTurn - b.onlineTurn || a.index - b.index);

  if (plants === 0) {
    if (input.sectorHasPlants)
      return { orders: result, refundAnchor: totalCost, plants: 0, roundedUp: false };
    const first = byOnline[0];
    result[first.index] = {
      kind: "rewrite",
      unitsOrdered: size,
      costPaidAnchor: totalCost,
      startTurn: Math.min(input.currentTurn, first.onlineTurn),
    };
    return { orders: result, refundAnchor: 0, plants: 1, roundedUp: true };
  }

  let cumulative = 0;
  let assigned = 0;
  for (const row of byOnline) {
    cumulative += row.u;
    const due = Math.min(plants, wholePlantsIn(cumulative, size)) - assigned;
    if (due <= 0) continue;
    assigned += due;
    result[row.index] = {
      kind: "rewrite",
      unitsOrdered: due * size,
      costPaidAnchor: due * size * perUnit,
      startTurn: Math.min(input.currentTurn, row.onlineTurn),
    };
  }
  return {
    orders: result,
    refundAnchor: Math.max(0, totalCost - plants * size * perUnit),
    plants,
    roundedUp: false,
  };
}

/** Invariant check: the stock is a whole number of plants. */
export function isWholePlantStock(stock: number | null | undefined, size: number): boolean {
  const units = finiteNonNegative(stock);
  if (units === 0) return true;
  return isWholePlantOrder(units, size);
}
