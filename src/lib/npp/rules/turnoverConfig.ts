/**
 * Every number the NPP turnover rules use, as one explicit table. A missing or
 * malformed value throws when the table is parsed; nothing is defaulted.
 */

export interface NppTurnoverConfig {
  death: {
    /** Annual death probability at age 0 of the exponential curve. */
    baseAnnual: number;
    /** Growth of the log hazard per year of age. */
    exponentPerYear: number;
    /** Ceiling on the annual death probability. */
    maxAnnual: number;
  };
  retirement: {
    /** Nobody retires from old age below this age. */
    startAge: number;
    /** Annual retirement probability at `startAge`. */
    startAnnual: number;
    /** Age at which the annual probability reaches `maxAnnual`. */
    maxAge: number;
    maxAnnual: number;
  };
  /** Birth-year range for a freshly minted successor. */
  replacement: { minAge: number; ageSpan: number };
  /** Stand-in age range for a seated NPP seeded without a birth year. */
  backfill: { minAge: number; ageSpan: number };
  leaders: {
    /** Turns before a term ends in which a leader may retire. */
    windowTurns: number;
    /** Term length the in-window chance is sized against. */
    termTurns: number;
    /** From this age a leader retires on the ordinary roll, mid-term or not. */
    midTermRetirementAge: number;
  };
}

function numberAt(raw: unknown, path: string, min: number, max = Number.POSITIVE_INFINITY) {
  let cursor: unknown = raw;
  for (const key of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null || !(key in cursor)) {
      throw new Error(`NPP turnover config: missing ${path}`);
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (typeof cursor !== "number" || !Number.isFinite(cursor) || cursor < min || cursor > max) {
    throw new Error(`NPP turnover config: ${path} must be a number in [${min}, ${max}]`);
  }
  return cursor;
}

export function parseNppTurnoverConfig(raw: unknown): NppTurnoverConfig {
  const config: NppTurnoverConfig = {
    death: {
      baseAnnual: numberAt(raw, "death.baseAnnual", 0, 1),
      exponentPerYear: numberAt(raw, "death.exponentPerYear", 0, 1),
      maxAnnual: numberAt(raw, "death.maxAnnual", 0, 1),
    },
    retirement: {
      startAge: numberAt(raw, "retirement.startAge", 0),
      startAnnual: numberAt(raw, "retirement.startAnnual", 0, 1),
      maxAge: numberAt(raw, "retirement.maxAge", 0),
      maxAnnual: numberAt(raw, "retirement.maxAnnual", 0, 1),
    },
    replacement: {
      minAge: numberAt(raw, "replacement.minAge", 18),
      ageSpan: numberAt(raw, "replacement.ageSpan", 1),
    },
    backfill: {
      minAge: numberAt(raw, "backfill.minAge", 18),
      ageSpan: numberAt(raw, "backfill.ageSpan", 1),
    },
    leaders: {
      windowTurns: numberAt(raw, "leaders.windowTurns", 1),
      termTurns: numberAt(raw, "leaders.termTurns", 1),
      midTermRetirementAge: numberAt(raw, "leaders.midTermRetirementAge", 0),
    },
  };
  if (config.retirement.maxAge <= config.retirement.startAge) {
    throw new Error("NPP turnover config: retirement.maxAge must exceed retirement.startAge");
  }
  if (config.retirement.maxAnnual < config.retirement.startAnnual) {
    throw new Error("NPP turnover config: retirement.maxAnnual is below retirement.startAnnual");
  }
  return config;
}
