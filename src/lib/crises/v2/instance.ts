import type { CrisisDefinition, CrisisInstance, CrisisScope } from "./types";

export interface CreateInstanceOptions {
  /** Actual reach when it differs from the definition's default scope. */
  scope?: CrisisScope;
  /**
   * Step the crisis on its own start turn. By default the first step is the
   * turn after, which suits detectors; content that spawns inside the turn and
   * fires start-turn effects needs the first step now.
   */
  evaluateOnStart?: boolean;
}

/** A fresh instance at the signal stage, ready for the first turn's evaluation. */
export function createCrisisInstance(
  def: CrisisDefinition,
  startTurn: number,
  options: CreateInstanceOptions = {}
): CrisisInstance {
  const sampleTurn = options.evaluateOnStart ? startTurn - 1 : startTurn;
  return {
    definitionId: def.id,
    source: def.source,
    scope: options.scope ?? def.scope,
    stage: "signal",
    startTurn,
    stageStartTurn: startTurn,
    severity: def.severity.initial,
    peakSeverity: def.severity.initial,
    severityHistory: [{ turn: sampleTurn, severity: def.severity.initial }],
    idleTurns: 0,
    relapses: 0,
    leverLastUsed: {},
    ledger: [],
    scars: [],
    parents: [],
    children: [],
  };
}
