import type { KeirMood } from "@/components/askDrawer/KeirSprite";

// Which state Keir shows while the drawer works. Ask names each research step
// and may tag it with a phase; older Ask versions send only the label, so the
// label's wording is the fallback.

export type AskStatusPhase = "search" | "read" | "live" | "calc" | "chart" | "plan" | "write";

const PHASE_MOODS: Record<AskStatusPhase, KeirMood> = {
  search: "reading",
  read: "reading",
  live: "working",
  calc: "working",
  chart: "point",
  plan: "thinking",
  write: "working",
};

/** Keir's state for one research step. */
export function moodForStatus(label: string | undefined, phase?: string | null): KeirMood {
  if (phase && phase in PHASE_MOODS) return PHASE_MOODS[phase as AskStatusPhase];
  const text = (label ?? "").toLowerCase();
  if (/\b(chart|map|draw|plot|graph)/.test(text)) return "point";
  if (/\b(live|data|calculat|comput|quer|fetch|checking|count|total|pull)/.test(text))
    return "working";
  if (/\b(search|read|doc|code|wiki|source|look|scan|rule|find)/.test(text)) return "reading";
  return "thinking";
}

/** How long the first-word "!" plays before Keir starts talking. */
export const ALERT_MS = 600;
/** A research step quiet for this long starts the long-wait rotation. */
export const LONG_WAIT_MS = 8000;
/** The drawer open and untouched for this long sends Keir to sleep. */
export const IDLE_SLEEP_MS = 120_000;

const LONG_WAIT: KeirMood[] = ["thinking", "glasses_peek", "tea_sip"];

/** The long-wait state for the given number of quiet periods. */
export function longWaitMood(quietPeriods: number): KeirMood {
  return LONG_WAIT[Math.max(0, quietPeriods) % LONG_WAIT.length];
}

export type KeirRest = "yawn" | "sleeping" | "waking" | null;

export interface KeirMoodInput {
  busy: boolean;
  /** Text has started streaming for the current answer. */
  answering: boolean;
  /** The "!" is still showing for the first words of this answer. */
  alerting: boolean;
  /** A one-off reaction: nod on ack, thumbs up on an answer, and so on. */
  flash: KeirMood | null;
  /** The current research step's state. */
  stepMood: KeirMood;
  /** Quiet periods of LONG_WAIT_MS since the last research step. */
  quietPeriods: number;
  typing: boolean;
  rest: KeirRest;
}

export function keirMood(input: KeirMoodInput): KeirMood {
  if (input.busy) {
    if (input.alerting) return "alert";
    if (input.answering) return "talking";
    if (input.flash) return input.flash;
    if (input.quietPeriods > 0) return longWaitMood(input.quietPeriods - 1);
    return input.stepMood;
  }
  if (input.rest) return input.rest;
  if (input.flash) return input.flash;
  return input.typing ? "listening" : "idle";
}

/** Keir's reaction when an answer lands. */
export function finishMood(result: {
  error?: string | null;
  stopped?: boolean;
  quota?: boolean;
  usedMcp?: boolean;
}): KeirMood {
  if (result.stopped) return "shrug";
  if (result.quota) return "concerned";
  if (result.error) return "error";
  return result.usedMcp ? "thumbs_up" : "idea";
}
