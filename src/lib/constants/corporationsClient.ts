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
 * (revenue, maintenance, wages, growth cost, profit) is a daily rate on that
 * 24-turn clock. A game year is therefore two financial days.
 */
export const GROWTH_RATE_TURNS_PER_YEAR = 48;

/** Turns per day, daily rates are divided by this for per-turn processing */
export const TURNS_PER_DAY = 24;

/** Fraction of market capitalization charged to relocate corporate headquarters */
export const RELOCATION_COST_FRACTION = 0.07;

/** Multiplier applied to base relocation cost when the HQ crosses into a new country */
export const CROSS_COUNTRY_RELOCATION_MULTIPLIER = 2;

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

/**
 * Every economic profile a sector can run under. Recipes, prices, tech, plant
 * sizes and seed weights are keyed by these. The order is load-bearing:
 * seeded state-enterprise ids, specialization rotations and seeded random
 * picks derive from a type's position.
 */
export const OPERATING_SECTOR_TYPES = CORPORATION_TYPES;

export type OperatingSectorType = CorporationType;

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

/** Labels for operating sector types. */
export const OPERATING_SECTOR_TYPE_LABELS: Record<OperatingSectorType, string> =
  CORPORATION_TYPE_LABELS;

/** Sector choices for founding and CEO settings forms. */
export const OPERATING_SECTOR_CHOICES: ReadonlyArray<{ key: OperatingSectorType; label: string }> =
  CORPORATION_TYPES.map((type) => ({ key: type, label: CORPORATION_TYPE_LABELS[type] }));

export function isCorporationType(value: unknown): value is CorporationType {
  return typeof value === "string" && (CORPORATION_TYPES as readonly string[]).includes(value);
}

export function isOperatingSectorType(value: unknown): value is OperatingSectorType {
  return isCorporationType(value);
}

/**
 * Maximum dividend rate (%). CEOs cannot set above this; turn processing clamps existing values.
 */
export const MAX_DIVIDEND_RATE = 25;

/** Maximum growth rate a player can set (% per game year) */
export const MAX_GROWTH_RATE = 15.0;

/** Minimum growth rate; negative means deliberate downsizing (% per game year) */
export const MIN_GROWTH_RATE = -2;

/** Growth cost multiplier: growthCost = revenue x growthRate x this */
export const GROWTH_COST_MULTIPLIER = 3.0;
