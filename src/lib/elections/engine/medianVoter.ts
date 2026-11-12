/**
 * Per-state median voter computation for the swing-flow engine's
 * policy-distance driver.
 *
 * Implements M1 from `2026-05-22-per-state-median-voter.md`. Replaces
 * the policy-distance driver's hard-coded `(0, 0)` reference with a
 * turnout-weighted average of the state's census unit leans so a
 * centrist candidate is judged relative to the state's actual median
 * voter, not abstract national neutrality.
 *
 * Pure function; safe for both server and client. The math is a weighted
 * average — not a statistical median — because per-voter modeling isn't
 * part of this engine's architecture. The weighted-average proxy
 * captures the *direction* of shift, which is what the driver needs.
 *
 * See `policyDistanceDriver` in `persuasionDrivers.ts` for the consumer.
 */

import type { ElectorateUnit } from "@/lib/demographics/electorateUnit";
import type { CountryId } from "@/lib/constants/countries";

export interface MedianVoter {
  /** Economic position weighted median, scaled to the ±4 EP grid. */
  ep: number;
  /** Social position weighted median, scaled to the ±4 SP grid. */
  sp: number;
}

/**
 * Turnout-weighted average of the electorate units' leans.
 * Returns `{ ep: 0, sp: 0 }` for mirror-symmetric demographics, positive for
 * right-leaning electorates, negative for left-leaning.
 *
 * `liveTurnouts` overrides per-unit turnout (GOTV / suppression shift the
 * median toward boosted or suppressed units); when omitted, each unit's own
 * `turnout` is used.
 *
 * Zero total weight yields `{ ep: 0, sp: 0 }`; negative or non-finite values
 * are clamped.
 */
export function computeMedianVoter(
  electorate: readonly ElectorateUnit[],
  liveTurnouts?: Record<string, number>
): MedianVoter {
  let weightSum = 0;
  let epWeighted = 0;
  let spWeighted = 0;

  for (const unit of electorate) {
    if (!Number.isFinite(unit.populationPct) || unit.populationPct <= 0) continue;

    const turnoutPct = liveTurnouts?.[unit.id] ?? unit.turnout;
    if (!Number.isFinite(turnoutPct) || turnoutPct <= 0) continue;

    const w = unit.populationPct * turnoutPct;
    weightSum += w;
    epWeighted += w * unit.economicLean;
    spWeighted += w * unit.socialLean;
  }

  if (weightSum <= 0) return { ep: 0, sp: 0 };
  return {
    ep: epWeighted / weightSum,
    sp: spWeighted / weightSum,
  };
}

/**
 * Per-country mapping of (electionType) that uses the EV-weighted
 * national median for the policy-distance driver instead of the
 * seat's own state median. Currently only US president — the US's
 * electoral-college system is the only one in-game where the
 * "median voter campaigns court" is meaningfully different from
 * raw national population. Non-US head-of-government races (UK PM,
 * DE chancellor, JP shugiin) wire in a later sub-phase.
 */
const EV_WEIGHTED_HEAD_OF_GOVERNMENT_BY_COUNTRY: Readonly<Partial<Record<CountryId, string>>> = {
  US: "president",
};

/**
 * True when the country uses an EV-weighted national median for the
 * given election type. Caller is expected to invoke
 * `computeNationalEvWeightedMedian` instead of `computeMedianVoter`
 * when this returns true.
 */
export function usesEvWeightedNationalMedian(electionType: string, countryId: CountryId): boolean {
  return EV_WEIGHTED_HEAD_OF_GOVERNMENT_BY_COUNTRY[countryId] === electionType;
}

/**
 * EV-weighted national median voter for US presidential elections.
 *
 * Per-state medians are aggregated by electoral-vote
 * weight, so a 55-EV state pulls the national signal 55x harder than a
 * 3-EV state. Population and turnout are already folded in per state, so
 * they are not double-counted here.
 *
 * Empty states or zero total EV returns `{ ep: 0, sp: 0 }`. States whose
 * median collapses to the neutral (0, 0) contribute zero shift but still
 * count toward the denominator.
 */
export function computeNationalEvWeightedMedian(
  states: Array<{ median: MedianVoter; ev: number }>
): MedianVoter {
  let evSum = 0;
  let epWeighted = 0;
  let spWeighted = 0;

  for (const { median, ev } of states) {
    if (!Number.isFinite(ev) || ev <= 0) continue;
    evSum += ev;
    epWeighted += ev * median.ep;
    spWeighted += ev * median.sp;
  }

  if (evSum <= 0) return { ep: 0, sp: 0 };
  return {
    ep: epWeighted / evSum,
    sp: spWeighted / evSum,
  };
}
