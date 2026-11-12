import { parseNppTurnoverConfig } from "./rules/turnoverConfig";

/** The shipped turnover table; parsed once, so a bad edit fails on import. */
export const NPP_TURNOVER_CONFIG = parseNppTurnoverConfig({
  death: { baseAnnual: 0.00005, exponentPerYear: 0.095, maxAnnual: 0.5 },
  retirement: { startAge: 70, startAnnual: 0.05, maxAge: 80, maxAnnual: 0.35 },
  replacement: { minAge: 32, ageSpan: 37 },
  backfill: { minAge: 35, ageSpan: 36 },
  leaders: { windowTurns: 24, termTurns: 192, midTermRetirementAge: 85 },
});

/**
 * Countries whose NPPs never age out, retire or get replaced by turnover.
 * The US NPP side stays static so player parties face a stable field.
 */
export const NPP_TURNOVER_EXEMPT_COUNTRIES: ReadonlySet<string> = new Set(["US"]);
