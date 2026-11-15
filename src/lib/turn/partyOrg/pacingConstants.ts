/**
 * Pacing constants for passive Org/Reg drift and decay processors.
 * Drift is 10x decay; both tiny per turn for slow background pressure.
 * See [docs/design/political-system-reg-support.md](../../../../docs/design/political-system-reg-support.md)
 * §8.1 for the full design.
 */

import type { CountryId } from "@/lib/constants/countries";
import { JP_GEOGRAPHY } from "@/lib/countries/jp/geography";
import { US_NON_PARTY_INDEPENDENT_BIAS } from "@/lib/countries/us/geographyFacts";
import { UK_NON_PARTY_INDEPENDENT_BIAS } from "@/lib/countries/uk/geographyFacts";
import { DE_NON_PARTY_INDEPENDENT_BIAS } from "@/lib/countries/de/geographyFacts";

/**
 * Passive Reg% drift per turn toward each party's `(Org% - country lag)`
 * baseline (see `REG_LAG_BELOW_ORG_PCT_BY_COUNTRY`). One-directional (up
 * only): Reg only drifts UP when the target is above current Reg. Seeded
 * registration is durable and should move on real political causes, not decay
 * toward Org on a clock. Downward movement comes from the decay mechanism
 * (PASSIVE_REG_DECAY_RATE) and active political events.
 *
 * Bounds: percent points per hourly turn.
 *
 * The climb is sourced from over-registered parties once the state's
 * Independent + Unregistered pool is empty (`sourceFromSurplus`); a state with
 * no party below its Org still does not move.
 */
export const PASSIVE_REG_DRIFT_RATE = 0.075 as const;

/**
 * Passive Reg% decay / erosion per turn. Independent of drift — Reg loses
 * a small amount each turn unless actively maintained, regardless of where
 * Org sits. Routes via the 10% Org eligibility rule (`§8.3 step 4`) to
 * other parties or non-party buckets.
 *
 * Bounds: percent points per hourly turn.
 */
export const PASSIVE_REG_DECAY_RATE = 0.004 as const;

/**
 * Share of each turn's decayed Reg that lapses to the non-party pool
 * (Independent + Unregistered) instead of routing to rival parties; the rest
 * routes via sqrt(Org) eligibility weights. Without this, decay only
 * redistributed Reg to rivals and the pool was a one-way sink that emptied
 * permanently, disabling pool-sourced Registration Drives. Models the two
 * real outcomes: some voters switch party, some fall off the rolls.
 * 0.5 = even split.
 */
export const REG_DECAY_LAPSE_TO_POOL_SHARE = 0.5 as const;

/**
 * Eligibility threshold for a party to "catch" drifted Reg.
 * Parties below this Org% in a state cannot absorb Reg from drift / decay
 * routing — the displaced share routes to non-party buckets instead
 * (Independent first, then Unregistered, with bias toward Independent).
 */
export const REG_DRIFT_CATCH_ELIGIBILITY_ORG_PCT = 10 as const;

/**
 * Independent vs Unregistered routing bias when displaced Reg goes to
 * non-party buckets. Higher = more goes to Independent. `1.0` = even split.
 *
 * Default fallback used when a country isn't listed in
 * `NON_PARTY_BUCKET_INDEPENDENT_BIAS_BY_COUNTRY`.
 */
export const NON_PARTY_BUCKET_INDEPENDENT_BIAS = 1.5 as const;

/**
 * Per-country: percentage points that Reg sits below Org at steady state.
 *
 * Real-world friction: not every voter the party reaches actually registers
 * with that party. The map is currently empty, so Reg targets Org exactly.
 * Per-country friction can be reintroduced as a tunable if desired.
 *
 * Countries absent from this map default to 0 (Reg targets Org exactly).
 * Floor: target = `max(0, Org - lag)` so tiny-Org parties don't target
 * negative Reg.
 */
export const REG_LAG_BELOW_ORG_PCT_BY_COUNTRY: Partial<Record<CountryId, number>> = {};

/**
 * Per-country: Independent vs Unregistered routing bias for displaced Reg.
 * Higher = more goes to Independent.
 *
 *   - US 2.33 → 70% Independent (strong cultural identity)
 *   - UK 1.00 → 50/50 split (mixed culture)
 *   - JP 1.50 → 60% Independent (mushikutei has identity but less so)
 *   - DE 0.43 → 30% Independent (Nichtwähler / non-voting more common)
 *
 * Countries absent from this map fall back to `NON_PARTY_BUCKET_INDEPENDENT_BIAS`.
 */
export const NON_PARTY_BUCKET_INDEPENDENT_BIAS_BY_COUNTRY: Partial<Record<CountryId, number>> = {
  US: US_NON_PARTY_INDEPENDENT_BIAS,
  UK: UK_NON_PARTY_INDEPENDENT_BIAS,
  JP: JP_GEOGRAPHY.nonPartyIndependentBias,
  DE: DE_NON_PARTY_INDEPENDENT_BIAS,
};

/**
 * Soft pacing target (documentation only — not consumed by mutation
 * logic). Expected number of hourly turns for a Strong stronghold to be
 * moved to a Lean tier by sustained external attack. Calibrated in the
 * Balance Appendix; exported so playtest tooling has one canonical
 * reference.
 *
 * Range: ~150-300 turns (about a week to two weeks of sustained
 * coordinated effort against an unmanned default).
 */
export const STRONGHOLD_FALL_TIME_TURNS_TARGET = 200 as const;

/**
 * Governor home-field: while a party holds the state executive, its Reg is
 * defended. Scaled by the executive's magnitude band (sign 1/2/3). Tune-later.
 */
/** Per-band fraction by which the governor party's passive Reg decay is reduced. */
export const HOME_FIELD_DECAY_RELIEF = 0.25 as const;
/** Per-band extra upward Reg drift (pp/turn) for the governor party. */
export const HOME_FIELD_DRIFT_BONUS = 0.01 as const;
/**
 * Ceiling: the gov-driven upward drift never pushes Reg above this value.
 * Set high enough that a party sustaining the state executive can build Reg
 * into the high-resistance band where election Reg curves bite.
 */
export const HOME_FIELD_REG_CAP = 75 as const;
