/**
 * Labor productivity is modeled real output per modeled hour worked.
 * advanceProductivity keeps a bounded, contiguous year of matching levels;
 * productivityGrowth pools levels before calculating regional or national growth.
 */
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

export interface ProductivityPoint {
  turn: number;
  output: number;
  hours: number;
}
export interface ProductivityState {
  points: ProductivityPoint[];
}
export interface GrowthBasis {
  startTurn: number;
  endTurn: number;
  openingOutput: number;
  closingOutput: number;
  openingHours: number;
  closingHours: number;
}

// Approximate 1991 annual hours per employed person, OECD ECO/WKP(2000)21,
// table A.13: https://one.oecd.org/document/ECO/WKP(2000)21/en/pdf
// Constant game assumptions, not a timecard ledger. Other countries
// use a disclosed 1,800-hour assumption; no country waits on survey microdata.
export function annualHours(countryId: string): number {
  return ({ US: 1808, UK: 1589, JP: 1998 } as Record<string, number>)[countryId] ?? 1800;
}

export function advanceProductivity(input: {
  previous?: ProductivityState;
  turn: number;
  output: number;
  employed: number;
  employmentTurn: number;
  countryId: string;
}): ProductivityState {
  const prior = input.previous?.points ?? [];
  if (
    !Number.isSafeInteger(input.turn) ||
    input.turn < 1 ||
    input.employmentTurn !== input.turn ||
    !Number.isFinite(input.output) ||
    input.output <= 0 ||
    !Number.isFinite(input.employed) ||
    input.employed <= 0
  )
    return { points: prior.slice(-TURNS_PER_YEAR - 1) };
  const last = prior.at(-1);
  if (last && last.turn >= input.turn) return { points: prior.slice(-TURNS_PER_YEAR - 1) };
  const contiguous = last?.turn === input.turn - 1 ? prior : [];
  return {
    points: [
      ...contiguous,
      {
        turn: input.turn,
        output: input.output,
        hours: (input.employed * annualHours(input.countryId)) / TURNS_PER_YEAR,
      },
    ].slice(-TURNS_PER_YEAR - 1),
  };
}

export function productivityBasis(state?: ProductivityState): GrowthBasis | null {
  const points = state?.points;
  if (!points || points.length !== TURNS_PER_YEAR + 1) return null;
  if (
    points.some(
      (p, i) =>
        !Number.isSafeInteger(p.turn) ||
        p.turn < 1 ||
        p.turn !== points[0]!.turn + i ||
        !Number.isFinite(p.output) ||
        p.output <= 0 ||
        !Number.isFinite(p.hours) ||
        p.hours <= 0
    )
  )
    return null;
  const first = points[0]!,
    last = points.at(-1)!;
  return {
    startTurn: first.turn,
    endTurn: last.turn,
    openingOutput: first.output,
    closingOutput: last.output,
    openingHours: first.hours,
    closingHours: last.hours,
  };
}

export function productivityGrowth(rows: readonly GrowthBasis[]): number | null {
  if (!rows.length) return null;
  const first = rows[0]!;
  if (
    rows.some(
      (r) =>
        r.startTurn !== first.startTurn ||
        r.endTurn !== first.endTurn ||
        r.endTurn - r.startTurn !== TURNS_PER_YEAR ||
        [r.openingOutput, r.closingOutput, r.openingHours, r.closingHours].some(
          (v) => !Number.isFinite(v) || v <= 0
        )
    )
  )
    return null;
  const sum = (
    key: keyof Pick<
      GrowthBasis,
      "openingOutput" | "closingOutput" | "openingHours" | "closingHours"
    >
  ) => rows.reduce((n, r) => n + r[key], 0);
  const value =
    100 *
    (sum("closingOutput") / sum("closingHours") / (sum("openingOutput") / sum("openingHours")) - 1);
  return Number.isFinite(value) ? value : null;
}

/** Real-output growth uses summed levels, never a mean of regional rates. */
export function outputGrowth(rows: readonly GrowthBasis[]): number | null {
  if (productivityGrowth(rows) === null) return null;
  const value =
    100 *
    (rows.reduce((n, r) => n + r.closingOutput, 0) / rows.reduce((n, r) => n + r.openingOutput, 0) -
      1);
  return Number.isFinite(value) ? value : null;
}
