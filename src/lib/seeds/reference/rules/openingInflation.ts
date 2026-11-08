/**
 * Gameplay opening CPI and wage growth for the 1991 high-inflation countries.
 *
 * Seed rows record historical 1991 CPI as provenance (BR 480%, BG 338%, ...),
 * not live opening values. The runtime CPI range is -2..100 and the first
 * recalculation would snap anything above it, an unmodelled stabilization. So
 * these countries open at moderate gameplay values instead of carrying
 * hyperinflation into play.
 *
 * Contract:
 * - An opening at or below GAMEPLAY_OPENING_INFLATION_MAX (20%) is used as
 *   authored. Ordinary countries are untouched.
 * - Every authored opening above it must have a row in
 *   GAMEPLAY_OPENING_INFLATION_1991, naming its historical figure and its
 *   gameplay value. A missing row, or a historical figure that no longer
 *   matches the seed, is a seed error, not a silent fallback.
 * - Gameplay values sit in a moderate 12..20% band. Countries with an
 *   authored 1991 monetary-era inflation target of 12% or more open at that
 *   target (so the opening agrees with the target the engine reverts toward);
 *   the rest are placed by the severity of their 1991 price shock.
 * - A calibrated opening rebuilds wage growth with the runtime wage rule
 *   (`wageGrowthNode`): authored real GDP growth plus the wage inflation
 *   passthrough times CPI, matching `wageGrowth = inflation + real growth`.
 *
 * Pure: plain data in, plain data out. Runtime constants come from the shell.
 */

/** Highest opening CPI (%) used as authored; also the top of the gameplay band. */
export const GAMEPLAY_OPENING_INFLATION_MAX = 20;

/** Bottom of the gameplay band for calibrated openings (%). */
export const GAMEPLAY_OPENING_INFLATION_MIN = 12;

export interface GameplayOpeningInflation {
  /** Authored historical 1991 annual CPI (%), kept as provenance. */
  historical: number;
  /** Gameplay opening CPI (%). */
  gameplay: number;
  /** Why this value. */
  basis: "era-target" | "unanchored-severity";
}

export const GAMEPLAY_OPENING_INFLATION_1991: Readonly<Record<string, GameplayOpeningInflation>> = {
  BR: { historical: 480, gameplay: 12, basis: "era-target" },
  RU: { historical: 144, gameplay: 12, basis: "era-target" },
  TR: { historical: 66, gameplay: 12, basis: "era-target" },
  YU: { historical: 164, gameplay: 15, basis: "era-target" },
  BG: { historical: 338.45, gameplay: 20, basis: "unanchored-severity" },
  RO: { historical: 230.62, gameplay: 18, basis: "unanchored-severity" },
  PL: { historical: 76.77, gameplay: 16, basis: "unanchored-severity" },
  CS: { historical: 55, gameplay: 14, basis: "unanchored-severity" },
  HU: { historical: 34.82, gameplay: 14, basis: "unanchored-severity" },
};

export interface OpeningInflationBounds {
  /** Runtime CPI floor (%). */
  minInflation: number;
  /** Runtime real wage growth clamp [low, high] (%). */
  realWageClamp: readonly [number, number];
  /** Runtime share of CPI passed into nominal wage growth. */
  wageInflationPassthrough: number;
}

export interface OpeningEconomicFactors {
  gdpGrowth: number;
  wageGrowth: number;
  inflationRate: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Wage growth the runtime wage rule gives at this real growth and CPI. */
export function runtimeOpeningWageGrowth(
  gdpGrowth: number,
  inflationRate: number,
  bounds: OpeningInflationBounds
): number {
  const [low, high] = bounds.realWageClamp;
  const real = Math.max(low, Math.min(high, gdpGrowth));
  return round2(real + bounds.wageInflationPassthrough * inflationRate);
}

/**
 * Calibrate one authored opening. Ordinary openings are returned unchanged;
 * a tabled high-inflation opening gets its gameplay CPI and runtime-rule wage.
 * Throws on an opening outside the contract.
 */
export function calibrateOpeningEconomicFactors<T extends OpeningEconomicFactors>(
  countryId: string,
  factors: T,
  bounds: OpeningInflationBounds
): T {
  const { inflationRate, wageGrowth, gdpGrowth } = factors;
  if (![inflationRate, wageGrowth, gdpGrowth].every(Number.isFinite)) {
    throw new Error(`${countryId}: non-finite opening economic factor`);
  }
  if (inflationRate <= GAMEPLAY_OPENING_INFLATION_MAX) return factors;
  const row = GAMEPLAY_OPENING_INFLATION_1991[countryId];
  if (!row) {
    throw new Error(
      `${countryId}: opening CPI ${inflationRate}% exceeds ${GAMEPLAY_OPENING_INFLATION_MAX}% ` +
        `and has no gameplay opening row`
    );
  }
  if (row.historical !== inflationRate) {
    throw new Error(
      `${countryId}: authored CPI ${inflationRate}% does not match its recorded historical ` +
        `figure ${row.historical}%`
    );
  }
  return {
    ...factors,
    inflationRate: row.gameplay,
    wageGrowth: runtimeOpeningWageGrowth(gdpGrowth, row.gameplay, bounds),
  };
}

/**
 * Why a seeded opening is outside the gameplay contract, or null. Used by the
 * seed contract test and the opening diagnostic on persisted budgets.
 */
export function openingInflationProblem(
  countryId: string,
  factors: OpeningEconomicFactors,
  bounds: OpeningInflationBounds
): string | null {
  const { inflationRate, wageGrowth, gdpGrowth } = factors;
  if (![inflationRate, wageGrowth, gdpGrowth].every(Number.isFinite)) {
    return "non-finite opening CPI, wage or growth";
  }
  if (inflationRate < bounds.minInflation || inflationRate > GAMEPLAY_OPENING_INFLATION_MAX) {
    return `opening CPI ${inflationRate}% outside ${bounds.minInflation}..${GAMEPLAY_OPENING_INFLATION_MAX}%`;
  }
  const row = GAMEPLAY_OPENING_INFLATION_1991[countryId];
  if (row) {
    if (inflationRate !== row.gameplay) {
      return `opening CPI ${inflationRate}% is not the gameplay value ${row.gameplay}%`;
    }
    const wage = runtimeOpeningWageGrowth(gdpGrowth, row.gameplay, bounds);
    if (Math.abs(wageGrowth - wage) > 0.005) {
      return `opening wage growth ${wageGrowth}% is not the runtime-rule value ${wage}%`;
    }
  }
  return null;
}
