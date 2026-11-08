/**
 * Which currencies were legal tender at a world's start. A preset seeding a
 * currency outside its window carries money from another era.
 */

export interface CurrencyWindow {
  /** First starting year the currency is valid for. */
  readonly from?: number;
  /** First starting year it is no longer valid for. */
  readonly until?: number;
}

/** Legal-tender windows by start year, for currencies that came or went. */
export const CURRENCY_VALIDITY: Readonly<Record<string, CurrencyWindow>> = {
  // Soviet ruble until the Russian ruble replaced it in 1993.
  SUR: { until: 1993 },
  RUB: { from: 1993 },
  DDM: { until: 1991 },
  CSK: { until: 1993 },
  YUD: { until: 1994 },
  PLZ: { until: 1995 },
  PLN: { from: 1995 },
  ROL: { until: 2006 },
  RON: { from: 2006 },
  TRL: { until: 2005 },
  TRY: { from: 2005 },
  BGL: { until: 2000 },
  BGN: { from: 2000, until: 2026 },
  // Euro notes and coins from 2002; the legacy currencies they replaced.
  EUR: { from: 2002 },
  FRF: { until: 2002 },
  ITL: { until: 2002 },
  ESP: { until: 2002 },
  ATS: { until: 2002 },
  FIM: { until: 2002 },
  GRD: { until: 2002 },
  IEP: { until: 2002 },
};

/**
 * Countries whose seed currency code is a declared accounting unit rather than
 * the legal tender of the day.
 */
export const CURRENCY_UNIT_EXCEPTIONS: Readonly<Record<string, string>> = {
  DE: "Pre-euro German budgets are authored in EUR-equivalent units at the fixed 1.95583 DEM parity.",
};

/** True when `code` was legal tender at `startingYear` (or has no window). */
export function isCurrencyValidAt(code: string, startingYear: number): boolean {
  const window = CURRENCY_VALIDITY[code];
  if (!window) return true;
  if (window.from != null && startingYear < window.from) return false;
  if (window.until != null && startingYear >= window.until) return false;
  return true;
}
