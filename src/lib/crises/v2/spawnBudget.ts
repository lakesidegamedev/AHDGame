import { DEFAULT_DIRECTOR_BUDGET, type DirectorBudget } from "./director";

/**
 * Budget for crises the automatic spawners open. Sized so a simulated country
 * can hold about two national crises at once, as the old per-country limit
 * allowed, while a regional disaster costs far less than a national one and so
 * no longer crowds it out. Cadence is frequent: only global shocks are spaced.
 */
export const SPAWN_BUDGET: DirectorBudget = {
  ...DEFAULT_DIRECTOR_BUDGET,
  scopeWeight: { local: 1, state: 2, national: 5, global: 10 },
  maxConcurrent: { local: 60, state: 24, national: 12, global: 2 },
  maxTotalLoad: 120,
  maxCountryLoad: 10,
  minGapTurns: { local: 0, state: 0, national: 0, global: 24 },
  maxOpensPerTurn: 4,
};

/** Spawn priority by trigger tier: metric-driven first, then rolls, then weather. */
export const SPAWN_PRIORITY = { condition: 30, random: 20, disaster: 10 } as const;
