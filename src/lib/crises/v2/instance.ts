import type { CrisisDefinition, CrisisInstance } from "./types";

/** A fresh instance at the signal stage, ready for the first turn's evaluation. */
export function createCrisisInstance(def: CrisisDefinition, startTurn: number): CrisisInstance {
  return {
    definitionId: def.id,
    source: def.source,
    scope: def.scope,
    stage: "signal",
    startTurn,
    stageStartTurn: startTurn,
    severity: def.severity.initial,
    peakSeverity: def.severity.initial,
    severityHistory: [{ turn: startTurn, severity: def.severity.initial }],
    idleTurns: 0,
    relapses: 0,
    leverLastUsed: {},
    ledger: [],
    scars: [],
    parents: [],
    children: [],
  };
}
