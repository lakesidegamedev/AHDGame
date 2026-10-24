import type { PlantIdleCauseKey } from "../types";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import { facilityVocabulary } from "@/lib/constants/facilityVocabulary";

/**
 * Shared vocabulary for the plants-tier panels.
 *
 * COPY RULE (project standing): player-facing strings here are plain language.
 * No em dashes, no en dashes, no jargon, short sentences.
 */

/** Format a unit count for display. Capacity is fractional but reads as whole. */
export function fmtUnits(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}

/** Format a 0–1 share as a whole percent. */
export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return `${(n * 100).toFixed(digits)}%`;
}

/** Format a multiplier leg for the cost breakdown, e.g. "1.12x". */
export function fmtMult(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "1.00x";
  return `${n.toFixed(2)}x`;
}

export interface IdleCauseMeta {
  label: string;
  /** Semantic token slice used for the meter segment and legend dot. */
  tone: "warning" | "error" | "muted" | "info";
  help: string;
}

/**
 * Idle-cause copy, in the sector's own words.
 *
 * The engine names one set of causes for every sector type, but the sentence
 * that explains a cause has to name the thing that stopped. A retail sector
 * that runs out of stock did not stop "the line", it stopped "the floor", and
 * it did not do it in a plant. `facilityVocabulary` supplies both nouns, so
 * this stays one source of copy instead of seventeen.
 */
export function idleCauseMeta(
  sectorType: OperatingSectorType | string | null | undefined,
  bankCapacityShare?: number
): Record<PlantIdleCauseKey, IdleCauseMeta> {
  const v = facilityVocabulary(sectorType);
  const sites = v.plural;
  const run = v.runNoun;
  return {
    inputs: {
      label: "Waiting on inputs",
      tone: "warning",
      help: `Your ${sites} could not buy enough of what they consume, so part of ${run} stopped. Check the Inputs list below for the item in short supply.`,
    },
    demand: {
      label: "Demand limited",
      tone: "warning",
      help: "Recent sales did not support a full run, so your plants are producing less to avoid making more unsold goods. Output rises as buyers take more.",
    },
    ramping: {
      label: "Ramping up",
      tone: "info",
      help: `You sold everything you made last turn, so your ${sites} are stepping back up toward a full run. Output rises each turn while buyers keep taking it, faster when the market is short.`,
    },
    strike: {
      label: "Strike",
      tone: "error",
      help: `Your workers are on strike. Most of ${run} is stopped until the strike ends.`,
    },
    disaster: {
      label: "Damage and disruption",
      tone: "error",
      help: `A live crisis in this region is stopping part of ${run}. It fades as the crisis decays.`,
    },
    policy: {
      label: "Held back on purpose",
      tone: "info",
      help: "You set output below full. Raise the output target to run more of your capacity.",
    },
    staffing: {
      label: "Short of workers",
      tone: "warning",
      help: `Your ${sites} did not have enough workers for a full run. Hire or raise pay until staffing catches up.`,
    },
    bank: {
      label: "Reserved for your bank network",
      tone: "info",
      help: `Your active bank charter allocates ${fmtPct(bankCapacityShare)} of financial capacity to deposit-taking branches, set by its branch capacity share. This capacity is not lost: it backs your bank's deposit ceiling.`,
    },
    deposits: {
      label: "Deposits ran short",
      tone: "warning",
      help: "This region does not hold enough of the resource to feed all your capacity. Build in a region with more left in the ground.",
    },
    mothballed: {
      label: "Mothballed",
      tone: "muted",
      help: `You put these ${sites} into cold storage. They make nothing and pay reduced upkeep until you turn them back on.`,
    },
    other: {
      label: "Other limits",
      tone: "muted",
      help: "Capacity that did not run for a reason the engine did not name this turn, for example a rounding gap.",
    },
  };
}

/**
 * Tailwind classes per tone, for meter fills and legend dots.
 *
 * Tones carry severity, not identity. A capacity meter needs identity: several
 * causes can share a severity while asking the player to do different things,
 * so each cause takes its own swatch from `IDLE_CAUSE_FILL`. Chart swatches are
 * the documented exception to the semantic-token rule (docs/DESIGN.md): a
 * capacity meter needs more hues than the status tokens provide.
 */
export const TONE_FILL: Record<IdleCauseMeta["tone"] | "sold" | "unsold", string> = {
  sold: "bg-success",
  unsold: "bg-warning",
  warning: "bg-warning/50",
  error: "bg-error/60",
  info: "bg-info/50",
  muted: "bg-muted/40",
};

/**
 * One swatch per idle cause, used for both the meter segment and its legend
 * dot so the two can always be matched.
 *
 * The hues are deliberately spread around the wheel rather than grouped by
 * severity: "waiting on inputs" and "demand limited" are both warnings, but one
 * is solved by buying and the other by waiting, so they must not look alike.
 * Keep every entry unique; `plants.test.ts` fails the build if two causes
 * collide, because a legend with two identical dots teaches nothing.
 */
export const IDLE_CAUSE_FILL: Record<PlantIdleCauseKey, string> = {
  inputs: "bg-amber-500/60",
  demand: "bg-rose-500/50",
  ramping: "bg-sky-400/60",
  strike: "bg-error/80",
  disaster: "bg-fuchsia-600/55",
  policy: "bg-indigo-400/55",
  staffing: "bg-orange-600/60",
  bank: "bg-teal-400/55",
  deposits: "bg-lime-500/55",
  mothballed: "bg-muted/45",
  other: "bg-slate-500/30",
};

/**
 * One clock, said once. Money in this game is stored per financial day, and one
 * game year is two financial days.
 */
export const PLANTS_CLOCK_NOTE =
  "Totals cover one financial day (24 turns). Per-unit figures are averages across the same day's output. One game year is 48 turns.";
