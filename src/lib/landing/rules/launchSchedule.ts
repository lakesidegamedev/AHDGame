/**
 * Where a freshly reset world stands on its way to the first turn, for the
 * signed-out landing page.
 *
 * Plain data in, plain data out: the caller passes the clock. Live config wins
 * over the announced dates; the announced dates only fill a gap an admin has not
 * filled yet, and drop out on their own once they pass.
 */

export type LaunchPhase =
  /** Maintenance is on: nobody can sign up or create a character yet. */
  | "sealed"
  /** The world is open but its first turn has not run. */
  | "open"
  /** Turns are running. */
  | "running";

export interface LaunchScheduleInput {
  /** Normalized `gameConfig.maintenanceMode`. */
  maintenanceMode: "off" | "partial" | "full";
  /** `gameConfig.maintenanceExpectedEnd`, ISO 8601, or null when unset. */
  maintenanceExpectedEnd: string | null;
  /** `gameState.currentTurn`. A reset leaves it at 1 until the first turn runs. */
  currentTurn: number;
  /** `gameState.isActive`: the hourly turn is switched on. */
  turnsActive: boolean;
  /** `gameState.nextScheduledTurn` as ISO 8601, or null. */
  nextScheduledTurn: string | null;
}

export interface AnnouncedLaunch {
  opensAt: string;
  firstTurnAt: string;
}

export interface LaunchSchedule {
  phase: LaunchPhase;
  /** When the world opens to sign-ups, while it is still sealed and the time is known. */
  opensAt: string | null;
  /** When the first turn runs, while it is still ahead and the time is known. */
  firstTurnAt: string | null;
}

/** The opening the 2027 world was announced with. Eastern Standard Time. */
export const ANNOUNCED_2027_LAUNCH: AnnouncedLaunch = {
  opensAt: "2026-11-15T17:00:00-05:00",
  firstTurnAt: "2026-11-16T17:00:00-05:00",
};

function parse(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function future(value: string | null | undefined, nowMs: number): string | null {
  const ms = parse(value);
  return ms !== null && ms > nowMs ? new Date(ms).toISOString() : null;
}

export function resolveLaunchSchedule(
  input: LaunchScheduleInput,
  nowMs: number,
  announced: AnnouncedLaunch | null = ANNOUNCED_2027_LAUNCH
): LaunchSchedule {
  const sealed = input.maintenanceMode !== "off";
  const beforeFirstTurn = input.currentTurn <= 1;

  const opensAt = sealed
    ? (future(input.maintenanceExpectedEnd, nowMs) ?? future(announced?.opensAt, nowMs))
    : null;

  const scheduled = input.turnsActive ? future(input.nextScheduledTurn, nowMs) : null;
  const firstTurnAt = beforeFirstTurn ? (scheduled ?? future(announced?.firstTurnAt, nowMs)) : null;

  const phase: LaunchPhase = sealed ? "sealed" : beforeFirstTurn ? "open" : "running";
  return { phase, opensAt, firstTurnAt };
}
