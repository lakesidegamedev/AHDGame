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
  size: number;
  currentTurn: number;
  onlineTurn: number;
  /** Founding starter order of a sector that owns no plant yet. */
  starterForEmptySector: boolean;
}

export type ConversionOrderResult =
  | {
      kind: "rewrite";
      unitsOrdered: number;
      costPaidAnchor: number;
      startTurn: number;
      refundAnchor: number;
      roundedUp: boolean;
    }
  | { kind: "cancel"; refundAnchor: number };

/**
 * Rewrite an in-flight order to whole plants. Remaining plants ramp from now
 * to the unchanged `onlineTurn`; the part-plant is refunded at its paid cost.
 */
export function convertOrderToWholePlants(input: ConversionOrderInput): ConversionOrderResult {
  const size = validSize(input.size);
  const u = finiteNonNegative(input.undeliveredUnits);
  const c = finiteNonNegative(input.undeliveredCost);
  const plants = wholePlantsIn(u, size);
  if (plants === 0) {
    if (input.starterForEmptySector && u > 0) {
      return {
        kind: "rewrite",
        unitsOrdered: size,
        costPaidAnchor: c,
        startTurn: input.currentTurn,
        refundAnchor: 0,
        roundedUp: true,
      };
    }
    return { kind: "cancel", refundAnchor: c };
  }
  const units = plants * size;
  const cost = u > 0 ? (c * units) / u : 0;
  return {
    kind: "rewrite",
    unitsOrdered: units,
    costPaidAnchor: cost,
    startTurn: Math.min(input.currentTurn, input.onlineTurn),
    refundAnchor: Math.max(0, c - cost),
    roundedUp: false,
  };
}

/** Invariant check: the stock is a whole number of plants. */
export function isWholePlantStock(stock: number | null | undefined, size: number): boolean {
  const units = finiteNonNegative(stock);
  if (units === 0) return true;
  return isWholePlantOrder(units, size);
}
