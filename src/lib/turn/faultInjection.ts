/**
 * Rehearsal-only fault injection for turn phases. Armed by the turn system only
 * when the world is a sandbox (gameConfig.simSandbox), never in production.
 *
 * Spec: `<phase>[:<substep>][:once][:stop]`. Without a substep the fault throws as the
 * phase starts; with one it throws when that substep is marked. `once` fires a
 * single time per process, so a retry of the same turn gets past it. `stop`
 * makes the failure stop the turn (as a must-succeed step would) instead of
 * being recorded as a failed step while the turn carries on.
 */

import { TurnMustStopError } from "@/lib/turn/turnMustStop";

export type TurnFaultSpec = {
  phase: string;
  substep: string | null;
  once: boolean;
  /** Throw as a step that must stop the turn, so the retry loop is exercised. */
  stop: boolean;
};

export function parseTurnFaultSpec(raw: string | undefined | null): TurnFaultSpec | null {
  const parts = (raw ?? "")
    .split(":")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  let once = false;
  let stop = false;
  while (parts.length > 1) {
    const tail = parts[parts.length - 1];
    if (tail === "once") once = true;
    else if (tail === "stop") stop = true;
    else break;
    parts.pop();
  }
  if (parts.length === 0 || parts.length > 2) return null;
  return { phase: parts[0], substep: parts[1] ?? null, once, stop };
}

declare global {
  var _ahdTurnFault: { spec: TurnFaultSpec; fired: boolean } | undefined;
}

/** Arm (or clear, with null) the fault for this process. */
export function armTurnFault(spec: TurnFaultSpec | null): void {
  globalThis._ahdTurnFault = spec ? { spec, fired: false } : undefined;
}

export function turnFaultArmed(): boolean {
  return globalThis._ahdTurnFault !== undefined;
}

/** Throws when the armed fault matches this phase (and substep, when given). */
export function maybeInjectTurnFault(phase: string, substep: string | null): void {
  const armed = globalThis._ahdTurnFault;
  if (!armed || armed.spec.phase !== phase || armed.spec.substep !== substep) return;
  if (armed.spec.once && armed.fired) return;
  armed.fired = true;
  const error = new Error(
    `Injected fault in ${phase}${substep ? `:${substep}` : ""} (AHD_TURN_FAULT_INJECT)`
  );
  throw armed.spec.stop ? new TurnMustStopError(phase, error) : error;
}

/** Message plus the first stack frames, bounded for storage on a turn log. */
export function describeTurnError(err: unknown, stackLines = 6): string {
  if (!(err instanceof Error)) return String(err);
  const frames = (err.stack ?? "")
    .split("\n")
    .filter((l) => l.trimStart().startsWith("at "))
    .slice(0, stackLines)
    .map((l) => l.trim());
  const text = frames.length ? `${err.message}\n${frames.join("\n")}` : err.message;
  return text.length > 2000 ? `${text.slice(0, 2000)}...` : text;
}
