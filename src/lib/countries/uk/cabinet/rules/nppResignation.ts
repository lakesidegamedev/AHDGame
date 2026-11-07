/**
 * NPP minister resignation rule. Plain data in, decision out; rng and turns are
 * injected, no DB or wall clock, so the headless harness can run it unchanged.
 * The shell loads the seat, applies the outcome, and writes the confidence event.
 * Resignation is a deliberate AI choice with a flat gauge hit; likelihood rises as
 * approval falls below the confidence pivot. Impact weighting lives in the gauge.
 */

import { CONFIDENCE_APPROVAL_PIVOT } from "@/lib/uk/confidence/confidenceGauge";

export interface NppResignationInput {
  /** 0-100 government approval. */
  approval: number;
  /** Turns the NPP has held the seat. */
  turnsInPost: number;
}

/** Fresh appointees settle in before they consider quitting. */
export const NPP_RESIGNATION_GRACE_TURNS = 6;

/** Per-turn resignation chance for a settled minister of a popular government. */
export const NPP_RESIGNATION_BASE_CHANCE = 0.002;

/** Cap so a collapsing government loses ministers in waves, not all at once. */
export const NPP_RESIGNATION_MAX_CHANCE = 0.05;

/** Chance multiplier at zero approval relative to base. */
const APPROVAL_STRESS_MULTIPLIER = 9;

function clampApproval(approval: number): number {
  return Math.max(0, Math.min(100, approval));
}

/** Per-turn resignation probability for the input. Pure. */
export function nppResignationChance(input: NppResignationInput): number {
  if (input.turnsInPost < NPP_RESIGNATION_GRACE_TURNS) return 0;
  const approval = clampApproval(input.approval);
  const stress =
    approval >= CONFIDENCE_APPROVAL_PIVOT
      ? 0
      : (CONFIDENCE_APPROVAL_PIVOT - approval) / CONFIDENCE_APPROVAL_PIVOT;
  return Math.min(
    NPP_RESIGNATION_MAX_CHANCE,
    NPP_RESIGNATION_BASE_CHANCE * (1 + APPROVAL_STRESS_MULTIPLIER * stress)
  );
}

/** Roll the resignation decision with an injected rng. Pure. */
export function shouldNppMinisterResign(input: NppResignationInput, rng: () => number): boolean {
  return rng() < nppResignationChance(input);
}
