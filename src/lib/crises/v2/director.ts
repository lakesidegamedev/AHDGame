import type { CrisisScope, CrisisStage } from "./types";

/**
 * Budgets concurrent crisis load by scope: many small crises, the occasional
 * national one and a rare global one. Pure: the shell supplies the live load and
 * the candidates, and opens whatever this approves.
 */
export interface DirectorBudget {
  /** Load points each active crisis of a scope costs. */
  scopeWeight: Record<CrisisScope, number>;
  /** Share of weight an aftermath crisis still counts for, 0..1. */
  aftermathWeight: number;
  /** Ceiling on concurrent crises per scope. */
  maxConcurrent: Record<CrisisScope, number>;
  /** Ceiling on total weighted load across the world. */
  maxTotalLoad: number;
  /** Ceiling on weighted load touching any one country. */
  maxCountryLoad: number;
  /** Turns that must pass after a crisis of a scope opens before another may. */
  minGapTurns: Record<CrisisScope, number>;
  /** Openings approved in a single turn. */
  maxOpensPerTurn: number;
}

export const DEFAULT_DIRECTOR_BUDGET: DirectorBudget = {
  scopeWeight: { local: 1, state: 2, national: 5, global: 12 },
  aftermathWeight: 0.5,
  maxConcurrent: { local: 24, state: 12, national: 3, global: 1 },
  maxTotalLoad: 60,
  maxCountryLoad: 10,
  minGapTurns: { local: 0, state: 0, national: 6, global: 48 },
  maxOpensPerTurn: 4,
};

export interface DirectorActiveCrisis {
  definitionId: string;
  scope: CrisisScope;
  stage: CrisisStage;
  countryIds: readonly string[];
  startTurn: number;
}

export interface DirectorCandidate {
  /** Stable key for the opening; orders ties and names decisions. */
  key: string;
  definitionId: string;
  scope: CrisisScope;
  countryIds: readonly string[];
  /** Higher opens first when the budget cannot fit everything. */
  priority: number;
}

export type DirectorRefusal =
  "duplicate" | "scopeFull" | "totalLoad" | "countryLoad" | "scopeGap" | "turnLimit";

export interface DirectorDecision {
  approved: DirectorCandidate[];
  refused: { candidate: DirectorCandidate; reason: DirectorRefusal }[];
}

/** Load a crisis puts on the budget. Resolved crises carry none. */
export function crisisLoad(
  crisis: Pick<DirectorActiveCrisis, "scope" | "stage">,
  budget: DirectorBudget
): number {
  if (crisis.stage === "resolved") return 0;
  const weight = budget.scopeWeight[crisis.scope];
  return crisis.stage === "aftermath" ? weight * budget.aftermathWeight : weight;
}

function duplicateKey(definitionId: string, countryIds: readonly string[]): string {
  return `${definitionId}|${[...countryIds].sort().join(",")}`;
}

/**
 * Approves candidates in priority order until the budget is spent. A candidate
 * that does not fit is refused for this turn only; the detector offers it again
 * next turn if its condition still holds.
 */
export function decideOpenings(
  candidates: readonly DirectorCandidate[],
  active: readonly DirectorActiveCrisis[],
  turn: number,
  budget: DirectorBudget = DEFAULT_DIRECTOR_BUDGET
): DirectorDecision {
  const concurrent: Record<CrisisScope, number> = { local: 0, state: 0, national: 0, global: 0 };
  const lastOpen: Partial<Record<CrisisScope, number>> = {};
  const countryLoad = new Map<string, number>();
  const live = new Set<string>();
  let totalLoad = 0;

  const absorb = (crisis: DirectorActiveCrisis) => {
    if (crisis.stage === "resolved") return;
    const load = crisisLoad(crisis, budget);
    concurrent[crisis.scope] += 1;
    totalLoad += load;
    lastOpen[crisis.scope] = Math.max(lastOpen[crisis.scope] ?? -Infinity, crisis.startTurn);
    live.add(duplicateKey(crisis.definitionId, crisis.countryIds));
    for (const countryId of crisis.countryIds) {
      countryLoad.set(countryId, (countryLoad.get(countryId) ?? 0) + load);
    }
  };
  for (const crisis of active) absorb(crisis);

  const ordered = [...candidates].sort(
    (a, b) => b.priority - a.priority || a.key.localeCompare(b.key)
  );
  const decision: DirectorDecision = { approved: [], refused: [] };
  const refuse = (candidate: DirectorCandidate, reason: DirectorRefusal) =>
    decision.refused.push({ candidate, reason });

  for (const candidate of ordered) {
    const weight = budget.scopeWeight[candidate.scope];
    if (decision.approved.length >= budget.maxOpensPerTurn) {
      refuse(candidate, "turnLimit");
    } else if (live.has(duplicateKey(candidate.definitionId, candidate.countryIds))) {
      refuse(candidate, "duplicate");
    } else if (concurrent[candidate.scope] >= budget.maxConcurrent[candidate.scope]) {
      refuse(candidate, "scopeFull");
    } else if (
      turn - (lastOpen[candidate.scope] ?? -Infinity) <
      budget.minGapTurns[candidate.scope]
    ) {
      refuse(candidate, "scopeGap");
    } else if (totalLoad + weight > budget.maxTotalLoad) {
      refuse(candidate, "totalLoad");
    } else if (
      candidate.countryIds.some(
        (countryId) => (countryLoad.get(countryId) ?? 0) + weight > budget.maxCountryLoad
      )
    ) {
      refuse(candidate, "countryLoad");
    } else {
      decision.approved.push(candidate);
      absorb({ ...candidate, stage: "signal", startTurn: turn });
    }
  }
  return decision;
}
