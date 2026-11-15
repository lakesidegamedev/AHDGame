/**
 * Portable rules for the national macro history series.
 *
 * Plain data in, plain data out: the query shell loads durable macro points,
 * these functions merge them by turn, derive GDP per capita and downsample the
 * window for display. No database, no wall clock, no randomness, so a report
 * builder or a future host can reuse the exact same series math.
 */

/** Macro telemetry metric path for national/regional GDP (local-currency millions). */
export const MACRO_GDP_METRIC = "economic.gdp";
/** Macro telemetry metric path for population (people). */
export const MACRO_POPULATION_METRIC = "population.population";

/** Default chart window: ten in-game days of hourly turns. */
export const MACRO_HISTORY_DEFAULT_TURNS = 120;
/** Smallest window the API accepts. */
export const MACRO_HISTORY_MIN_TURNS = 12;
/** Largest window the API accepts (a full 20-turn/day, 24-day campaign). */
export const MACRO_HISTORY_MAX_TURNS = 480;
/** Most points a chart receives; longer windows are evenly thinned. */
export const MACRO_HISTORY_MAX_POINTS = 180;

/** One stored macro sample, already reduced to the fields the series needs. */
export interface MacroHistorySample {
  turn: number;
  year?: number | null;
  value: number;
}

/** One merged national observation. */
export interface NationalMacroPoint {
  turn: number;
  year: number | null;
  /** National GDP in local-currency millions. */
  gdpMillions: number;
  /** National population in people; null when that turn has no population sample. */
  population: number | null;
  /** GDP per capita in base local-currency units; null when population is missing. */
  gdpPerCapita: number | null;
}

/** Display metric ids shared by the API payload and the chart. */
export type NationalMacroMetric = "population" | "gdp" | "gdpPerCapita";

/** Clamp a requested window to the supported range, defaulting on bad input. */
export function normalizeHistoryTurns(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return MACRO_HISTORY_DEFAULT_TURNS;
  const rounded = Math.round(value);
  return Math.min(MACRO_HISTORY_MAX_TURNS, Math.max(MACRO_HISTORY_MIN_TURNS, rounded));
}

/**
 * Evenly thin a series while keeping old and new ends, so the newest turn is
 * always plotted. `maxPoints` below two is treated as "do not thin".
 */
export function downsampleSeries<T>(points: readonly T[], maxPoints: number): T[] {
  if (maxPoints < 2 || points.length <= maxPoints) return [...points];
  const step = (points.length - 1) / (maxPoints - 1);
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)]);
  }
  out[out.length - 1] = points[points.length - 1];
  return out;
}

/**
 * Merge GDP and population samples by turn. GDP is the anchor: a turn without
 * a GDP sample is skipped rather than plotted as zero, and population stays
 * null when absent. Per capita is derived only from two present, positive
 * values, never inferred backwards.
 */
export function buildNationalMacroSeries(input: {
  gdp: readonly MacroHistorySample[];
  population: readonly MacroHistorySample[];
  maxPoints?: number;
}): NationalMacroPoint[] {
  const populationByTurn = new Map<number, number>();
  for (const sample of input.population) {
    if (Number.isFinite(sample.turn) && Number.isFinite(sample.value) && sample.value > 0) {
      populationByTurn.set(sample.turn, sample.value);
    }
  }

  const points: NationalMacroPoint[] = [];
  const sortedGdp = [...input.gdp].sort((a, b) => a.turn - b.turn);
  for (const sample of sortedGdp) {
    if (!Number.isFinite(sample.turn)) continue;
    if (!Number.isFinite(sample.value) || sample.value < 0) continue;
    const population = populationByTurn.get(sample.turn) ?? null;
    points.push({
      turn: sample.turn,
      year: sample.year ?? null,
      gdpMillions: sample.value,
      population,
      gdpPerCapita: population === null ? null : (sample.value * 1_000_000) / population,
    });
  }

  return downsampleSeries(points, input.maxPoints ?? MACRO_HISTORY_MAX_POINTS);
}

/** Percentage change between the first and last finite value in a series. */
export function seriesChangePercent(values: readonly (number | null)[]): number | null {
  const finite = values.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  );
  if (finite.length < 2) return null;
  const first = finite[0];
  const last = finite[finite.length - 1];
  if (first <= 0) return null;
  return ((last - first) / first) * 100;
}
