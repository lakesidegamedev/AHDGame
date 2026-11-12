import type { TurnOutcome, TurnPhaseTelemetryMap } from "@/lib/db/types/turnPhaseTelemetry";

/** Market freshness uses phase telemetry's wall clock, including on a resumed turn. */
export function completedMarketUpdateAt(phaseStatuses: TurnPhaseTelemetryMap): Date | null {
  const phase = phaseStatuses.stockExchangeSnapshot;
  if (phase?.status !== "completed" || !phase.completedAt) return null;
  return Number.isFinite(phase.completedAt.getTime()) ? phase.completedAt : null;
}

export interface TurnStepAccounting {
  /** Steps that ran to completion in this attempt. */
  ran: string[];
  /** Steps a crash resume skipped because an earlier holder had finished them. */
  skippedAlreadyDone: string[];
  /** Steps a crash resume found mid-flight and did not rerun. */
  interruptedNotRerun: string[];
  /** Steps marked never reached. */
  neverRan: string[];
}

export interface TurnCompletionStatus {
  /** False when the turn is incomplete: see `outcome`. */
  success: boolean;
  outcome: TurnOutcome;
  failedPhases: string[];
  /** Phases skipped because a phase they depend on failed. */
  abortedPhases: string[];
  warningCount: number;
  stepAccounting: TurnStepAccounting;
  /** Money-moving steps interrupted by a process death and not rerun, plus never-run steps. */
  incompleteSteps: string[];
}

export function accountForSteps(phaseStatuses: TurnPhaseTelemetryMap): TurnStepAccounting {
  const out: TurnStepAccounting = {
    ran: [],
    skippedAlreadyDone: [],
    interruptedNotRerun: [],
    neverRan: [],
  };
  for (const [phase, status] of Object.entries(phaseStatuses)) {
    if (!status) continue;
    if (status.status === "completed") out.ran.push(phase);
    else if (status.status === "skipped" && status.resumeCarried === "completed")
      out.skippedAlreadyDone.push(phase);
    else if (status.resumeCarried === "interrupted") out.interruptedNotRerun.push(phase);
    else if (status.status === "notReached") out.neverRan.push(phase);
  }
  for (const list of Object.values(out)) list.sort();
  return out;
}

/**
 * A turn that reaches the commit path is committed, but it is only a success
 * when nothing money-moving was left interrupted and no step never ran. A phase
 * that threw is logged and skipped so the world keeps moving, which is why a
 * committed turn is not automatically a healthy one: `outcome` and
 * `failedPhases` say whether every phase actually finished. Exceptions and
 * rejected locks return from separate failure paths.
 */
export function completedTurnStatus(
  warnings: readonly string[],
  phaseStatuses: TurnPhaseTelemetryMap = {},
  interruptedMoneyMoving: readonly string[] = []
): TurnCompletionStatus {
  const failedPhases = Object.entries(phaseStatuses)
    .filter(([, status]) => status?.status === "failed")
    .map(([phase]) => phase)
    .sort();
  const abortedPhases = Object.entries(phaseStatuses)
    .filter(([, status]) => status?.status === "skipped" && status.reason === "upstreamAbort")
    .map(([phase]) => phase)
    .sort();
  const stepAccounting = accountForSteps(phaseStatuses);
  const incompleteSteps = [
    ...new Set([...interruptedMoneyMoving, ...stepAccounting.neverRan]),
  ].sort();
  const incomplete = incompleteSteps.length > 0;
  return {
    success: !incomplete,
    outcome: incomplete
      ? "incomplete"
      : failedPhases.length + abortedPhases.length > 0
        ? "degraded"
        : "clean",
    failedPhases,
    abortedPhases,
    warningCount: warnings.length,
    stepAccounting,
    incompleteSteps,
  };
}
