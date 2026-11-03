import { plantSizeForSector, type PlantSizingSector } from "@/lib/constants/facilityQuantum";

export interface PlantLedgerState {
  plantCount: number;
  plantUnitRemainder: number;
}

interface PlantLedgerSector extends PlantSizingSector {
  plantCount?: number | null;
  plantUnitRemainder?: number | null;
}

function finiteNonNegative(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function wholeNonNegative(value: number | null | undefined): number {
  return Math.floor(finiteNonNegative(value));
}

/**
 * Seed the whole-plant ledger without changing productive capacity.
 *
 * This intentionally matches the existing player-facing facility count:
 * floor capacity by the sector facility quantum, with one small plant for any
 * positive holding below a full quantum. The remainder is construction credit
 * toward the next whole plant and never participates in PvP by itself.
 *
 * Plant size follows the sector's lane AND its strategy, so pass the strategy
 * the sector will hold after this write (the target strategy on a retool).
 */
export function seedPlantLedger(
  sector: PlantSizingSector,
  capitalStock: number | null | undefined
): PlantLedgerState {
  const stock = finiteNonNegative(capitalStock);
  if (stock <= 0) return { plantCount: 0, plantUnitRemainder: 0 };

  const quantum = plantSizeForSector(sector);
  if (stock < quantum) return { plantCount: 1, plantUnitRemainder: 0 };

  const plantCount = Math.floor(stock / quantum);
  return {
    plantCount,
    plantUnitRemainder: stock - plantCount * quantum,
  };
}

/**
 * Atomically applies a stock delta, then derives the whole-plant ledger from the resulting stock.
 * The second pipeline stage reads the value written by the first, so concurrent capacity deltas
 * cannot persist a plant count seeded from a stale application snapshot.
 */
export function plantCapacityDeltaPipeline(
  sector: PlantSizingSector,
  delta: number,
  setFields: Record<string, unknown> = {}
): Array<Record<string, unknown>> {
  const quantum = plantSizeForSector(sector);
  const stock = "$capitalStock";
  const count = { $floor: { $divide: [stock, quantum] } };
  return [
    {
      $set: {
        capitalStock: {
          $max: [0, { $add: [{ $ifNull: [stock, 0] }, Number.isFinite(delta) ? delta : 0] }],
        },
      },
    },
    {
      $set: {
        ...setFields,
        plantCount: {
          $cond: [{ $lte: [stock, 0] }, 0, { $cond: [{ $lt: [stock, quantum] }, 1, count] }],
        },
        plantUnitRemainder: {
          $cond: [
            { $lte: [stock, 0] },
            0,
            {
              $cond: [
                { $lt: [stock, quantum] },
                0,
                { $subtract: [stock, { $multiply: [count, quantum] }] },
              ],
            },
          ],
        },
      },
    },
  ];
}

/**
 * Whole-plants twin of `plantCapacityDeltaPipeline`, same call shape. Off (the
 * default) it IS that pipeline, so today's behaviour is unchanged. On, a gain
 * is construction credit: the stock is snapped to whole plants (surplus to
 * credit, a positive holding below one plant rounds up to one), the delta is
 * added to `plantUnitRemainder`, and every full plant of credit becomes a
 * plant. Negative deltas are not wear here; losses go through the turn.
 */
export function plantChangePipeline(
  sector: PlantSizingSector,
  delta: number,
  setFields: Record<string, unknown> = {},
  options: { wholePlants?: boolean } = {}
): Array<Record<string, unknown>> {
  if (!options.wholePlants) return plantCapacityDeltaPipeline(sector, delta, setFields);
  const size = plantSizeForSector(sector);
  const gain = Number.isFinite(delta) && delta > 0 ? delta : 0;
  const stock = { $max: [0, { $ifNull: ["$capitalStock", 0] }] };
  const floored = { $floor: { $add: [{ $divide: [stock, size] }, 1e-9] } };
  const basePlants = {
    $cond: [{ $lte: [stock, 0] }, 0, { $cond: [{ $lt: [floored, 1] }, 1, floored] }],
  };
  return [
    {
      $set: {
        __wpBase: basePlants,
        __wpCredit: {
          $add: [
            { $max: [0, { $ifNull: ["$plantUnitRemainder", 0] }] },
            { $max: [0, { $subtract: [stock, { $multiply: [basePlants, size] }] }] },
            gain,
          ],
        },
      },
    },
    {
      $set: {
        __wpAdded: { $floor: { $add: [{ $divide: ["$__wpCredit", size] }, 1e-9] } },
      },
    },
    {
      $set: {
        ...setFields,
        plantCount: { $add: ["$__wpBase", "$__wpAdded"] },
        capitalStock: { $multiply: [{ $add: ["$__wpBase", "$__wpAdded"] }, size] },
        plantUnitRemainder: {
          $max: [0, { $subtract: ["$__wpCredit", { $multiply: ["$__wpAdded", size] }] }],
        },
        plantWearUnits: { $max: [0, { $ifNull: ["$plantWearUnits", 0] }] },
      },
    },
    { $unset: ["__wpBase", "__wpCredit", "__wpAdded"] },
  ];
}

/**
 * Advance the construction ledger with newly delivered capacity.
 * Turn writers reconcile the persisted count from final capitalStock after
 * depreciation, so this helper is only for computations before that write.
 */
export function advancePlantLedger(input: {
  sector: PlantSizingSector;
  plantCount: number | null | undefined;
  plantUnitRemainder: number | null | undefined;
  currentCapitalStock: number | null | undefined;
  deliveredUnits: number;
}): PlantLedgerState {
  const seeded = Number.isInteger(input.plantCount)
    ? {
        plantCount: wholeNonNegative(input.plantCount),
        plantUnitRemainder: finiteNonNegative(input.plantUnitRemainder),
      }
    : seedPlantLedger(input.sector, input.currentCapitalStock);
  const quantum = plantSizeForSector(input.sector);
  const accumulated = seeded.plantUnitRemainder + finiteNonNegative(input.deliveredUnits);
  const completedPlants = Math.floor(accumulated / quantum);

  return {
    plantCount: seeded.plantCount + completedPlants,
    plantUnitRemainder: accumulated - completedPlants * quantum,
  };
}

/** Adapt a persisted sector row to the construction-ledger calculation. */
export function advanceSectorPlantLedger(
  sector: PlantLedgerSector,
  currentCapitalStock: number,
  deliveredUnits: number
): PlantLedgerState {
  return advancePlantLedger({
    sector,
    plantCount: sector.plantCount,
    plantUnitRemainder: sector.plantUnitRemainder,
    currentCapitalStock,
    deliveredUnits,
  });
}

/** Allocate a carve to whole plants while conserving the exact opening count. */
export function splitWholePlantCount(
  plantCount: number | null | undefined,
  carvedFraction: number
): { carved: number; kept: number } {
  const total = wholeNonNegative(plantCount);
  const fraction = Number.isFinite(carvedFraction) ? Math.max(0, Math.min(1, carvedFraction)) : 0;
  if (fraction <= 0 || total === 0) return { carved: 0, kept: total };
  if (fraction >= 1) return { carved: total, kept: 0 };

  const carved = Math.min(total, Math.max(1, Math.floor(total * fraction)));
  return { carved, kept: total - carved };
}
