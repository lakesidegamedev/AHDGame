/**
 * Rules for the pre-release preview of a held turn. Plain data in, plain data
 * out. The shell (`holdPreview.ts` beside the turn code) runs the queries.
 */
import { isSafeWhenInterrupted } from "./interruptedPhases";

export type WriteProbeResult =
  | { label: string; status: "found"; count: number; sums: Record<string, number> }
  | { label: string; status: "unknown"; reason: string };

export type StepWriteVerdict = "none-found" | "some" | "unknown";

export interface StepPreview {
  phase: string;
  onAllowList: boolean;
  /** Whether this step has probes of its own, beyond the generic audit trail. */
  hasSpecificProbes: boolean;
  verdict: StepWriteVerdict;
  probes: WriteProbeResult[];
}

/**
 * "some" when any probe found rows. "none-found" only when every probe ran, none
 * found anything, and the step has probes of its own: a step the audit trail
 * alone cannot see is "unknown", never "none".
 */
export function judgeStepWrites(
  probes: WriteProbeResult[],
  hasSpecificProbes: boolean
): StepWriteVerdict {
  if (probes.some((p) => p.status === "found" && p.count > 0)) return "some";
  if (probes.some((p) => p.status === "unknown")) return "unknown";
  return hasSpecificProbes ? "none-found" : "unknown";
}

export function buildStepPreview(
  phase: string,
  probes: WriteProbeResult[],
  hasSpecificProbes: boolean
): StepPreview {
  return {
    phase,
    onAllowList: isSafeWhenInterrupted(phase),
    hasSpecificProbes,
    verdict: judgeStepWrites(probes, hasSpecificProbes),
    probes,
  };
}

/** Stable text the token is hashed from: turn, steps and counts, nothing volatile. */
export function previewTokenInput(turn: number, steps: StepPreview[]): string {
  const rows = [...steps]
    .sort((a, b) => a.phase.localeCompare(b.phase))
    .map((s) => ({
      phase: s.phase,
      verdict: s.verdict,
      probes: s.probes.map((p) =>
        p.status === "found"
          ? [p.label, p.count, Object.entries(p.sums).sort(([a], [b]) => a.localeCompare(b))]
          : [p.label, "unknown"]
      ),
    }));
  return JSON.stringify({ turn, rows });
}

/** Steps a rerun cannot be released for without the operator confirming repair. */
export function stepsNeedingRepairConfirmation(steps: StepPreview[]): string[] {
  return steps
    .filter((s) => !s.onAllowList && (s.verdict === "some" || s.verdict === "unknown"))
    .map((s) => s.phase)
    .sort();
}

/**
 * Earliest moment the held step can have written for the held turn. Turn numbers restart
 * after a world reset and old rows stay, so every probe only counts rows created at or
 * after this time. The dead holder's own start time for the step is the tightest bound;
 * the first step start of the turn, then the lock start, are the fallbacks. Null when
 * none is known, in which case no probe can be scoped to this world.
 */
export function probeWindowStart(
  statuses: Record<string, { startedAt?: Date | string | null } | undefined> | null | undefined,
  phase: string,
  processingStartedAt?: Date | string | null
): Date | null {
  const asDate = (v: Date | string | null | undefined) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const own = asDate(statuses?.[phase]?.startedAt);
  if (own) return own;
  const starts = Object.values(statuses ?? {})
    .map((s) => asDate(s?.startedAt))
    .filter((d): d is Date => d !== null);
  if (starts.length > 0) return new Date(Math.min(...starts.map((d) => d.getTime())));
  return asDate(processingStartedAt);
}
