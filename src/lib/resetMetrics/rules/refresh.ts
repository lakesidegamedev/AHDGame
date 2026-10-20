/** Portable cadence and ownership rules for the reset metric board. */
import { primaryMetrics } from "../catalog";
import type { OpeningMetricObservation } from "./openingObservation";
import type { ResetMetricSnapshot } from "./snapshot";
import { validateHousingState, type HousingState } from "./housing";
import type { HouseholdProductionStatus } from "./householdSources";

export interface MetricRefreshInput {
  board: ResetMetricSnapshot;
  turn: number;
  /** Owner-produced observations, keyed by primary metric id. */
  updates: Readonly<Record<string, OpeningMetricObservation>>;
  cohortDue: boolean;
  electionDue: boolean;
  /** Refresh overdue owners from current readings without manufacturing missed turns. */
  allowCatchUp?: boolean;
  housingState?: HousingState;
  householdProductionStatus?: HouseholdProductionStatus;
  housingProductionStatus?: HouseholdProductionStatus;
}

export interface MetricRefreshResult {
  board: ResetMetricSnapshot;
  replayed: boolean;
  dueIds: readonly string[];
  changedIds: readonly string[];
  missingDueIds: readonly string[];
}

function isDue(
  refresh: string,
  elapsedTurns: number,
  previousElapsedTurns: number,
  cohortDue: boolean,
  electionDue: boolean
) {
  if (refresh === "cohort") return cohortDue;
  if (refresh === "election") return electionDue;
  const cadence = Number(refresh);
  if (!Number.isSafeInteger(cadence) || cadence < 1) {
    throw new Error(`Unknown reset metric refresh cadence ${refresh}`);
  }
  return Math.floor(elapsedTurns / cadence) > Math.floor(previousElapsedTurns / cadence);
}

function sameObservation(a: OpeningMetricObservation | undefined, b: OpeningMetricObservation) {
  return (
    a?.metricId === b.metricId &&
    a.path === b.path &&
    a.value === b.value &&
    a.status === b.status &&
    a.source === b.source &&
    a.owner === b.owner &&
    a.note === b.note &&
    a.observedAtTurn === b.observedAtTurn &&
    a.ratioBasis?.numerator === b.ratioBasis?.numerator &&
    a.ratioBasis?.denominator === b.ratioBasis?.denominator &&
    JSON.stringify(a.demographicBasis) === JSON.stringify(b.demographicBasis) &&
    JSON.stringify(a.householdBasis) === JSON.stringify(b.householdBasis) &&
    a.definitionVersion === b.definitionVersion &&
    a.unit === b.unit &&
    JSON.stringify(a.countryBasis) === JSON.stringify(b.countryBasis) &&
    a.lastUpdatedTurn === b.lastUpdatedTurn
  );
}

export function dueResetMetricIds(
  board: ResetMetricSnapshot,
  turn: number,
  cohortDue: boolean,
  electionDue: boolean
): string[] {
  if (!Number.isSafeInteger(turn) || turn <= board.sourceTurn) {
    throw new Error("Reset metric due calculation needs a turn after the opening");
  }
  const elapsedTurns = turn - board.sourceTurn;
  const previousTurn =
    turn === board.asOfTurn ? (board.lastRefreshFromTurn ?? turn - 1) : board.asOfTurn;
  if (
    !Number.isSafeInteger(previousTurn) ||
    previousTurn < board.sourceTurn ||
    previousTurn >= turn
  ) {
    throw new Error("Reset metric cadence has an invalid prior observation turn");
  }
  return primaryMetrics
    .filter((metric) =>
      board.scope === "national"
        ? metric.aggregation === "national"
        : metric.aggregation !== "national"
    )
    .filter((metric) =>
      isDue(metric.refresh, elapsedTurns, previousTurn - board.sourceTurn, cohortDue, electionDue)
    )
    .map((metric) => metric.id);
}

/**
 * Advance a complete board exactly one turn. A missed owner reading remains
 * visible as missing; callers must not certify the result as a live board.
 */
export function refreshResetMetricBoard(input: MetricRefreshInput): MetricRefreshResult {
  const { board, turn, cohortDue, electionDue } = input;
  for (const status of [input.householdProductionStatus, input.housingProductionStatus])
    if (
      status &&
      (board.scope !== "national" ||
        status.evaluatedAtTurn !== turn ||
        !["produced", "legacy"].includes(status.path) ||
        status.gaps.length > 64 ||
        status.gaps.some((g) => typeof g !== "string" || !g || g.length > 200) ||
        (status.path === "produced" && status.gaps.length > 0))
    )
      throw new Error("Invalid household production status");
  if (input.housingState) {
    validateHousingState(input.housingState);
    if (
      board.scope !== "regional" ||
      input.housingState.worldId !== board.worldId ||
      input.housingState.countryId !== board.countryId ||
      input.housingState.regionId !== board.regionId ||
      input.housingState.asOfTurn !== turn
    )
      throw new Error("Housing state is not bound to this board turn");
  }
  const updates = Object.fromEntries(
    Object.entries(input.updates).map(([id, observation]) => [
      id,
      { ...observation, lastUpdatedTurn: turn },
    ])
  );
  if (
    !Number.isSafeInteger(turn) ||
    turn < board.asOfTurn ||
    (!input.allowCatchUp && turn > board.asOfTurn + 1)
  ) {
    throw new Error("Reset metric board must advance by exactly one turn or replay the same turn");
  }
  const expected = primaryMetrics.filter((metric) =>
    board.scope === "national"
      ? metric.aggregation === "national"
      : metric.aggregation !== "national"
  );
  const expectedIds = new Set(expected.map((metric) => metric.id));
  if (
    Object.keys(board.observations).length !== expected.length ||
    Object.keys(board.observations).some((id) => !expectedIds.has(id))
  ) {
    throw new Error("Reset metric board is incomplete before refresh");
  }
  if (
    board.openingValues &&
    expected.some((metric) => !Number.isFinite(board.openingValues![metric.id]))
  ) {
    throw new Error("Reset metric board has an incomplete immutable opening baseline");
  }
  for (const [id, observed] of Object.entries(updates)) {
    const metric = expected.find((entry) => entry.id === id);
    if (
      !metric ||
      observed.metricId !== id ||
      observed.path !== metric.path ||
      observed.owner !== metric.owner ||
      observed.status === "unavailable" ||
      typeof observed.value !== "number" ||
      !Number.isFinite(observed.value) ||
      !observed.source ||
      !observed.note
    ) {
      throw new Error(`Invalid reset metric owner update ${id}`);
    }
  }
  const dueIds = dueResetMetricIds(board, turn, cohortDue, electionDue);
  const dueSet = new Set(dueIds);
  const changedIds = Object.keys(updates);
  if (changedIds.some((id) => !dueSet.has(id))) {
    throw new Error("Reset metric owner attempted an off-cadence update");
  }
  const missingDueIds = dueIds.filter((id) => updates[id] === undefined);
  if (turn === board.asOfTurn) {
    if (
      missingDueIds.length > 0 ||
      changedIds.some((id) => !sameObservation(board.observations[id], updates[id]!)) ||
      (input.householdProductionStatus &&
        JSON.stringify(board.householdProductionStatus) !==
          JSON.stringify(input.householdProductionStatus)) ||
      (input.housingProductionStatus &&
        JSON.stringify(board.housingProductionStatus) !==
          JSON.stringify(input.housingProductionStatus))
    ) {
      throw new Error("Reset metric turn replay differs from its persisted owner readings");
    }
    return { board, replayed: true, dueIds, changedIds, missingDueIds };
  }
  const next: ResetMetricSnapshot = {
    ...board,
    asOfTurn: turn,
    lastRefreshFromTurn: board.asOfTurn,
    priorValues: Object.fromEntries(
      Object.entries(board.observations).map(([id, o]) => [id, o.value])
    ),
    observations: { ...board.observations, ...updates },
    ...(input.housingState ? { housingState: input.housingState } : {}),
    ...(input.householdProductionStatus
      ? { householdProductionStatus: input.householdProductionStatus }
      : {}),
    ...(input.housingProductionStatus
      ? { housingProductionStatus: input.housingProductionStatus }
      : {}),
  };
  return { board: next, replayed: false, dueIds, changedIds, missingDueIds };
}
