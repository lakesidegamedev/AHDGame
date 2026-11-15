/**
 * Decides whether a rehearsal record authorises a real reset: the rehearsal
 * must have passed, be recent, and have run the same settings against the
 * same tree of files that is about to be reset with.
 */

export const REHEARSAL_RECORD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ResetSettings {
  preset: string;
  mode: string;
  startingParties: "default" | "none";
  foundingPhase: boolean;
}

/** Key order and spacing are fixed so equal settings always give equal text. */
export function settingsFingerprint(settings: ResetSettings): string {
  return JSON.stringify({
    foundingPhase: settings.foundingPhase,
    mode: settings.mode,
    preset: settings.preset,
    startingParties: settings.startingParties,
  });
}

export interface RehearsalRecordLike {
  passed?: unknown;
  timestamp?: unknown;
  settingsFingerprint?: unknown;
  treeHash?: unknown;
}

export type RehearsalGateVerdict =
  | { ok: true }
  | {
      ok: false;
      reason: "missing" | "failed" | "stale" | "settings-differ" | "tree-differs" | "unreadable";
      message: string;
    };

export interface RehearsalGateContext {
  settingsFingerprint: string;
  treeHash: string;
  nowMs: number;
}

function refuse(
  reason: Exclude<RehearsalGateVerdict, { ok: true }>["reason"],
  message: string
): RehearsalGateVerdict {
  return { ok: false, reason, message };
}

export function evaluateRehearsalRecord(
  record: RehearsalRecordLike | null | undefined,
  context: RehearsalGateContext
): RehearsalGateVerdict {
  if (record === null || record === undefined) return refuse("missing", "no rehearsal record");
  if (typeof record !== "object") return refuse("unreadable", "rehearsal record is not an object");
  if (record.passed !== true) return refuse("failed", "the rehearsal did not pass");

  const at = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : NaN;
  if (!Number.isFinite(at)) return refuse("unreadable", "rehearsal record has no valid timestamp");
  const age = context.nowMs - at;
  if (age < 0 || age > REHEARSAL_RECORD_MAX_AGE_MS)
    return refuse("stale", "the rehearsal is older than 24 hours");

  if (record.settingsFingerprint !== context.settingsFingerprint)
    return refuse("settings-differ", "the rehearsal ran with different reset settings");

  if (
    typeof record.treeHash !== "string" ||
    record.treeHash === "" ||
    record.treeHash === "unknown" ||
    record.treeHash !== context.treeHash
  )
    return refuse("tree-differs", "the rehearsal ran against a different version of the code");

  return { ok: true };
}
