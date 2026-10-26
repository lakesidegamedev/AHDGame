/**
 * Client-safe core of the corporation taxonomy.
 *
 * corporations.ts re-exports every name here, so server code keeps importing
 * the full constants module unchanged. Client components that only need the
 * sector lanes, their labels or the shared clock/dividend constants import this
 * module instead, which keeps the margin, dominance and pricing tables out of
 * the browser bundle.
 *
 * Nothing here may import a module that reads the database, the clock or the
 * environment. Keep it to unions, label tables and plain numbers.
 */

/**
 * Turns over which a sector growth rate is applied (compounding).
 *
 * One game year = 48 turns, so each turn applies 1/48th of the rate. This is
 * NOT a day: {@link TURNS_PER_DAY} is 24, and every money figure in the game
 * (revenue, maintenance, wages, growth cost, profit) is a *daily* rate on that
 * 24-turn clock. A game year is therefore two financial days.
 *
 * Was named `GROWTH_RATE_TURNS_PER_DAY`, which read as "48 turns per day" and
 * made the growth rate look like a daily figure in every call site and label
 * that touched it. Renamed in #3934 alongside the UI copy.
 */
export const GROWTH_RATE_TURNS_PER_YEAR = 48;

/** Turns per day, daily rates are divided by this for per-turn processing */
export const TURNS_PER_DAY = 24;

export const CORPORATION_TYPES = [
  "financial",
  "media",
  "manufacturing",
  "chemical_industries",
  "healthcare",
  "retail",
  "technology",
  "energy",
  "agriculture",
  "real_estate",
  "construction",
  "defense",
  "telecommunications",
  "logistics",
  "extraction",
] as const;

export type CorporationType = (typeof CORPORATION_TYPES)[number];

/** Specialized production models that belong to the manufacturing taxonomy. */
export type ManufacturingIndustryModel = "vehicles";

/** The entertainment operating lane inside canonical media. */
export type MediaDiscriminator = "entertainment";

/**
 * Operating lanes that carry their own economics inside a corporation type.
 * Recipes, prices, tech, plant sizes and seed weights for vehicle makers and
 * entertainment houses are keyed by these lanes. Stored rows never hold a lane
 * key: they hold the corporation type plus `industryModel` or
 * `mediaDiscriminator` (see operatingSectorIdentity).
 */
export const SPECIALIZED_OPERATING_LANES = [
  "manufacturing_vehicles",
  "media_entertainment",
] as const;

export type SpecializedOperatingLane = (typeof SPECIALIZED_OPERATING_LANES)[number];

/**
 * Every economic profile a sector can run under: a corporation type or a
 * specialized lane. The order is load-bearing: seeded state-enterprise ids,
 * specialization rotations and seeded random picks derive from a lane's
 * position, so the lanes sit where their economics always sat. Append only.
 */
export const OPERATING_SECTOR_TYPES = [
  "financial",
  "media",
  "manufacturing",
  "chemical_industries",
  "healthcare",
  "retail",
  "manufacturing_vehicles",
  "technology",
  "energy",
  "agriculture",
  "real_estate",
  "construction",
  "defense",
  "telecommunications",
  "media_entertainment",
  "logistics",
  "extraction",
] as const satisfies readonly (CorporationType | SpecializedOperatingLane)[];

export type OperatingSectorType = (typeof OPERATING_SECTOR_TYPES)[number];

export const CORPORATION_TYPE_LABELS: Record<CorporationType, string> = {
  financial: "Financial",
  media: "Media",
  manufacturing: "Manufacturing",
  chemical_industries: "Chemical Industries",
  healthcare: "Healthcare",
  retail: "Retail",
  technology: "Technology",
  energy: "Energy",
  agriculture: "Agriculture",
  real_estate: "Real Estate",
  construction: "Construction",
  defense: "Defense",
  telecommunications: "Telecommunications",
  logistics: "Logistics",
  extraction: "Extraction & Mining",
};

/** Labels for operating lanes; the specialized lanes name their line of business. */
export const OPERATING_SECTOR_TYPE_LABELS: Record<OperatingSectorType, string> = {
  ...CORPORATION_TYPE_LABELS,
  manufacturing_vehicles: "Automobiles",
  media_entertainment: "Entertainment",
};

/** The persisted identity of an operating lane. */
export interface OperatingSectorIdentity {
  sectorType: CorporationType;
  industryModel: ManufacturingIndustryModel | null;
  mediaDiscriminator: MediaDiscriminator | null;
}

export function isCorporationType(value: unknown): value is CorporationType {
  return typeof value === "string" && (CORPORATION_TYPES as readonly string[]).includes(value);
}

export function isOperatingSectorType(value: unknown): value is OperatingSectorType {
  return typeof value === "string" && (OPERATING_SECTOR_TYPES as readonly string[]).includes(value);
}

/** Resolve the operating lane a persisted sector (or corporation) runs under. */
export function operatingSectorTypeFor(
  sectorType: CorporationType,
  industryModel?: string | null,
  mediaDiscriminator?: string | null
): OperatingSectorType {
  if (sectorType === "manufacturing" && industryModel === "vehicles") {
    return "manufacturing_vehicles";
  }
  if (sectorType === "media" && mediaDiscriminator === "entertainment") {
    return "media_entertainment";
  }
  return sectorType;
}

/** The fields a row stores for an operating lane. */
export function operatingSectorIdentity(lane: OperatingSectorType): OperatingSectorIdentity {
  if (lane === "manufacturing_vehicles") {
    return { sectorType: "manufacturing", industryModel: "vehicles", mediaDiscriminator: null };
  }
  if (lane === "media_entertainment") {
    return { sectorType: "media", industryModel: null, mediaDiscriminator: "entertainment" };
  }
  return { sectorType: lane, industryModel: null, mediaDiscriminator: null };
}

/**
 * Mongo filter fields selecting exactly one operating lane's rows. A plain
 * type matches rows with no model or discriminator (null matches absent).
 * Unknown values pass through as a bare sector type.
 */
export function operatingSectorFilter(lane: OperatingSectorType): OperatingSectorIdentity;
export function operatingSectorFilter(lane: string): {
  sectorType: string;
  industryModel?: ManufacturingIndustryModel | null;
  mediaDiscriminator?: MediaDiscriminator | null;
};
export function operatingSectorFilter(lane: string): {
  sectorType: string;
  industryModel?: ManufacturingIndustryModel | null;
  mediaDiscriminator?: MediaDiscriminator | null;
} {
  if (!isOperatingSectorType(lane)) return { sectorType: lane };
  return operatingSectorIdentity(lane);
}

/** The corporation type an operating lane belongs to. */
export function corporationTypeOfLane(lane: OperatingSectorType): CorporationType {
  return operatingSectorIdentity(lane).sectorType;
}

/**
 * Maximum dividend rate (%). CEOs cannot set above this; turn processing clamps existing values.
 */
export const MAX_DIVIDEND_RATE = 25;
