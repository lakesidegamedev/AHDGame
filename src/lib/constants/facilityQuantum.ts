/**
 * How many capacity units one nameable FACILITY is.
 *
 * The engine's capacity unit is "one output unit per day", valued at the
 * sector's RPU, which ranges from ~₳92/day (energy) to ~₳50,000/day (autos).
 * Exposed raw, the build dialog would sell "power stations" worth ₳92/day and
 * require hundreds to matter. This table fixes the QUANTUM, not the economics:
 * one facility = `plantSizeUnits(type)` units, sized so a facility's nameplate
 * lands near {@link FACILITY_TARGET_DAILY_REVENUE_ANCHOR} of daily revenue
 * whatever the sector's mix prices at. The build dialog counts and prices in
 * facilities; the API, engine, storage and market share stay in units. Nothing
 * here is persisted or read by the turn.
 *
 * ERA-INVARIANT BY CONSTRUCTION: under `getEraUnitScale`, a 1953 world's RPU
 * and its "meaningful daily revenue" shrink by the same nominal ratio, so
 * units-per-facility, their quotient, is the same in every era. One table
 * serves all worlds; do not add an era dimension.
 *
 * VALUES ARE AUTHORED, NOT COMPUTED, so a base-price tuning pass cannot
 * silently resize every facility. `facilityQuantum.test.ts` pins each entry to
 * within tolerance of the target formula and fails when a strategy/price change
 * drifts a sector's RPU far enough that its facility size stops being honest.
 */

import type { OperatingSectorType } from "@/lib/constants/corporations";

/**
 * The daily nameplate revenue one facility should represent, in modern ₳.
 * Chosen so a first facility is a meaningful investment with a comparable
 * daily nameplate, while starter treasuries can afford entry.
 */
export const FACILITY_TARGET_DAILY_REVENUE_ANCHOR = 25_000;

/** Units per facility, per sector type. Legibly rounded, never below 1. */
const FACILITY_SIZE_UNITS: Record<OperatingSectorType, number> = {
  financial: 6,
  media: 80,
  manufacturing: 25,
  chemical_industries: 60,
  healthcare: 5,
  retail: 80,
  technology: 25,
  energy: 250,
  agriculture: 60,
  real_estate: 5,
  construction: 3,
  defense: 8,
  telecommunications: 12,
  logistics: 5,
  extraction: 250,
};

/**
 * Strategies whose recipe prices capacity far from the sector type's default
 * mix, so one plant of them holds a different number of capacity units. A
 * manufacturing sector on a vehicle recipe carries a vehicle RPU, and its
 * plants are vehicle plants. `facilityQuantum.test.ts` fails if a strategy
 * that supplies vehicles as its main output is missing here.
 */
const STRATEGY_PLANT_SIZE_UNITS: Partial<Record<string, Record<string, number>>> = {
  manufacturing: {
    vehicle_assembly: 1,
    vehicle_heavy_machinery: 1,
  },
};

/** What a sector needs to say how big one of its plants is. */
export interface PlantSizingSector {
  sectorType: string;
  /** The strategy the sector runs now. Decides the size for retooled recipes. */
  strategyId?: string | null;
}

/**
 * Capacity units in one plant of this sector. Always a positive integer.
 * Every surface that counts plants (build dialog, build queue, the persisted
 * ledger, tables) sizes them here so they can never disagree.
 */
export function plantSizeForSector(sector: PlantSizingSector): number {
  const byStrategy = sector.strategyId
    ? STRATEGY_PLANT_SIZE_UNITS[sector.sectorType]?.[sector.strategyId]
    : undefined;
  return byStrategy ?? FACILITY_SIZE_UNITS[sector.sectorType as OperatingSectorType] ?? 1;
}

/**
 * Plant size as a Mongo aggregation expression reading each document's own
 * `$strategyId`, for bulk updates that span sectors of one type on different
 * recipes. A plain number when no recipe of the type changes the size.
 */
export function plantSizeMongoExpr(
  sector: Omit<PlantSizingSector, "strategyId">
): number | Record<string, unknown> {
  const typeSize = plantSizeForSector(sector);
  const branches = Object.entries(STRATEGY_PLANT_SIZE_UNITS[sector.sectorType] ?? {})
    .map(([strategyId, size]) => ({
      case: { $eq: ["$strategyId", strategyId] },
      then: size,
    }))
    .filter((branch) => branch.then !== typeSize);
  return branches.length > 0 ? { $switch: { branches, default: typeSize } } : typeSize;
}

/**
 * Whole plants represented by `units` of this sector's capacity, floored. A
 * sector holding less than one plant's worth still shows 1 when it has any
 * capacity at all: a player owns "a small plant", not "0 plants".
 */
export function plantsFromUnitsForSector(sector: PlantSizingSector, units: number): number {
  if (!Number.isFinite(units) || units <= 0) return 0;
  return Math.max(1, Math.floor(units / plantSizeForSector(sector)));
}

/** What a surface needs to count a sector's plants the way the sector page does. */
export interface PlantReadingSector extends PlantSizingSector {
  /** Whole plants from the persisted ledger, when the payload carries it. */
  plantCount?: number | null;
  /** Capacity in output units per day. */
  capacityUnits?: number | null;
}

/**
 * Plants a sector owns, for display. The persisted ledger first; a payload
 * without it (or a ledger still at zero beside real capacity) counts the
 * capacity in plants of this sector's size. Every table counts plants here so
 * none can disagree with the sector page.
 */
export function sectorPlantCount(sector: PlantReadingSector): number {
  const fromUnits = plantsFromUnitsForSector(sector, sector.capacityUnits ?? 0);
  const ledger = sector.plantCount;
  if (typeof ledger === "number" && Number.isFinite(ledger) && ledger >= 0) {
    return ledger > 0 ? Math.round(ledger) : fromUnits;
  }
  return fromUnits;
}

/**
 * Type-only plant size, for callers that have no sector yet (a founding
 * plant, a fresh seed on the standard recipe). Prefer `plantSizeForSector`.
 */
export function plantSizeUnits(sectorType: OperatingSectorType): number {
  return plantSizeForSector({ sectorType });
}

/** Type-only plant count. Prefer `plantsFromUnitsForSector`. */
export function facilitiesFromUnits(sectorType: OperatingSectorType, units: number): number {
  return plantsFromUnitsForSector({ sectorType }, units);
}
