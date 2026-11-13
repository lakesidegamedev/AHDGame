/**
 * Plan for a person releasing a turn hold. Plain data in, plain data out.
 * "rerun" clears the held steps so the next attempt runs them again; "mark-done"
 * records them as finished by the operator.
 */
export type HoldReleaseMode = "rerun" | "mark-done";

export type HoldReleasePlan =
  | { ok: false; error: string }
  | { ok: true; set: Record<string, unknown>; unset: Record<string, ""> };

export function planHoldRelease(
  state: { processingHoldReason?: string | null; processingHeldPhases?: string[] | null },
  input: { mode: HoldReleaseMode; acknowledge: string[] },
  now: Date
): HoldReleasePlan {
  const held = state.processingHeldPhases ?? [];
  if (!state.processingHoldReason || held.length === 0) {
    return { ok: false, error: "The turn lock is not held; there is nothing to release." };
  }
  const want = [...held].sort().join(",");
  const got = [...new Set(input.acknowledge)].sort().join(",");
  if (want !== got) {
    return {
      ok: false,
      error: `Acknowledge exactly the held steps: ${held.join(", ")}.`,
    };
  }
  const set: Record<string, unknown> = {
    processingHoldReason: null,
    processingHeldPhases: null,
    processingHeldAt: null,
    updatedAt: now,
  };
  const unset: Record<string, ""> = {};
  for (const phase of held) {
    if (input.mode === "rerun") {
      unset[`processingPhaseStatuses.${phase}`] = "";
      unset[`processingPhaseResults.${phase}`] = "";
    } else {
      set[`processingPhaseStatuses.${phase}`] = {
        status: "completed",
        startedAt: null,
        completedAt: now,
        updatedAt: now,
        reason: null,
        message: "marked done by an operator after a turn hold",
      };
    }
  }
  return { ok: true, set, unset };
}
