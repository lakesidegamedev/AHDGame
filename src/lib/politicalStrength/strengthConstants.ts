import type { CountryId } from "@/lib/constants/countries";
import { JP_ECONOMY } from "@/lib/countries/jp/economy";
import { JP_STRENGTH_REGION_COUNT } from "@/lib/countries/jp/geographyFacts";
import { US_ECONOMY } from "@/lib/countries/us/economy";
import { UK_ECONOMY } from "@/lib/countries/uk/economy";
import { DE_ECONOMY } from "@/lib/countries/de/economy";
import { CN_ECONOMY } from "@/lib/countries/cn/economy";
import { IE_ECONOMY } from "@/lib/countries/ie/economy";
import { RU_ECONOMY } from "@/lib/countries/ru/economy";
import { DD_ECONOMY } from "@/lib/countries/dd/economy";
import { NG_ECONOMY } from "@/lib/countries/ng/economy";
import { BR_ECONOMY } from "@/lib/countries/br/economy";
import { FR_ECONOMY } from "@/lib/countries/fr/economy";
import { IT_ECONOMY } from "@/lib/countries/it/economy";
import { ES_ECONOMY } from "@/lib/countries/es/economy";
import { SE_ECONOMY } from "@/lib/countries/se/economy";
import { TR_ECONOMY } from "@/lib/countries/tr/economy";
import { GR_ECONOMY } from "@/lib/countries/gr/economy";
import { AT_ECONOMY } from "@/lib/countries/at/economy";
import { FI_ECONOMY } from "@/lib/countries/fi/economy";
import { PL_ECONOMY } from "@/lib/countries/pl/economy";
import { HU_ECONOMY } from "@/lib/countries/hu/economy";
import { RO_ECONOMY } from "@/lib/countries/ro/economy";
import { YU_ECONOMY } from "@/lib/countries/yu/economy";
import { BG_ECONOMY } from "@/lib/countries/bg/economy";
import { CS_ECONOMY } from "@/lib/countries/cs/economy";
import { SCO_ECONOMY } from "@/lib/countries/sco/economy";
import { WAL_ECONOMY } from "@/lib/countries/wal/economy";
import { BLR_ECONOMY } from "@/lib/countries/blr/economy";
import { UKR_ECONOMY } from "@/lib/countries/ukr/economy";
import { BAL_ECONOMY } from "@/lib/countries/bal/economy";
import { CA_ECONOMY } from "@/lib/countries/ca/economy";

/**
 * Political Strength reserve and pressure-ladder constants for Phase 3.
 *
 * See plan §"Phase 3 — Recommended default PS reserve / pressure model"
 * for the canonical model. Tuning lands in the plan's Balance Appendix, not here.
 *
 * Phase 3 consumers:
 *  - `partyActionGeneration` reads passive trickle, treasury rates, cap formulas
 *  - `spendPoliticalStrength` reads pressure-ladder constants
 *  - `pressureDecay` turn-phase reads `PRESSURE_DECAY_PER_TURN`
 */

// ─── Passive PS gain ────────────────────────────────────────────────────────

/**
 * Per-turn flat passive PS, by scope. Applied by `partyActionGeneration`
 * every turn regardless of treasury, the baseline reserve growth even an
 * idle (or broke) party experiences. Like every stream it is still clamped
 * at the hard cap (`NATIONAL_PS_CAP`).
 */
export const NATIONAL_PASSIVE_PS_PER_TURN = 20 as const;
export const STATE_PASSIVE_PS_PER_TURN = 5 as const;

// ─── Treasury-driven PS gain (country-normalized) ──────────────────────────

/**
 * Treasury cost per `+1 PS` of treasury-driven generation, by country.
 *
 * National rates per plan baselines; state rates are 50% of national (state
 * generation is twice as efficient per unit treasury). Normalizes country
 * economic scale so PS-per-treasury-hour stays comparable across countries.
 *
 * Inactive countries (BR / CN / IE / NG) get placeholder rates; not load-bearing
 * until those countries activate.
 */
export const TREASURY_PS_RATE_BY_COUNTRY: Record<CountryId, { national: number; state: number }> = {
  US: US_ECONOMY.tax.treasuryPsRate,
  UK: UK_ECONOMY.tax.treasuryPsRate,
  DE: DE_ECONOMY.tax.treasuryPsRate,
  JP: JP_ECONOMY.tax.treasuryPsRate,
  IE: IE_ECONOMY.tax.treasuryPsRate,
  BR: BR_ECONOMY.tax.treasuryPsRate,
  CN: CN_ECONOMY.tax.treasuryPsRate,
  NG: NG_ECONOMY.tax.treasuryPsRate,
  HU: HU_ECONOMY.tax.treasuryPsRate,
  PL: PL_ECONOMY.tax.treasuryPsRate,
  RO: RO_ECONOMY.tax.treasuryPsRate,
  YU: YU_ECONOMY.tax.treasuryPsRate,
  BG: BG_ECONOMY.tax.treasuryPsRate,
  UKR: UKR_ECONOMY.tax.treasuryPsRate,
  BLR: BLR_ECONOMY.tax.treasuryPsRate,
  CS: CS_ECONOMY.tax.treasuryPsRate,
  BAL: BAL_ECONOMY.tax.treasuryPsRate,
  RU: RU_ECONOMY.tax.treasuryPsRate,
  FR: FR_ECONOMY.tax.treasuryPsRate,
  IT: IT_ECONOMY.tax.treasuryPsRate,
  ES: ES_ECONOMY.tax.treasuryPsRate,
  SE: SE_ECONOMY.tax.treasuryPsRate,
  TR: TR_ECONOMY.tax.treasuryPsRate,
  GR: GR_ECONOMY.tax.treasuryPsRate,
  AT: AT_ECONOMY.tax.treasuryPsRate,
  FI: FI_ECONOMY.tax.treasuryPsRate,
  DD: DD_ECONOMY.tax.treasuryPsRate,
  SCO: SCO_ECONOMY.tax.treasuryPsRate, // mirrors UK (sterling zone)
  WAL: WAL_ECONOMY.tax.treasuryPsRate, // mirrors UK (sterling zone)
  CA: CA_ECONOMY.tax.treasuryPsRate,
} as const;

// ─── Pressure ladder ────────────────────────────────────────────────────────

/**
 * Per-geography pressure decay applied each turn (subtracted from each
 * `partyStrengthPressure.value`, floored at `0`).
 *
 * Locked at `3` per turn so a party can still burst during heated elections
 * but accumulated pressure dissipates within a few turns of inactivity in
 * that geography.
 */
export const PRESSURE_DECAY_PER_TURN = 3 as const;

/**
 * Per-spend pressure increment in the same geography. Effective PS cost of
 * the next spend in that geography rises by this amount until the ladder
 * caps at `PRESSURE_LADDER_MAX_COST`.
 */
export const PRESSURE_LADDER_INCREMENT = 1 as const;

/**
 * Hard ceiling on the per-action effective PS cost from pressure ladder
 * escalation. Once an action's `(baseCost + pressure)` would exceed this,
 * the cost saturates here rather than growing indefinitely.
 *
 * Note: this caps the **delta** added by pressure, not the action's base
 * cost. A 6-cost base action with full pressure caps at `8`, not `14`.
 */
export const PRESSURE_LADDER_MAX_COST = 8 as const;

/**
 * Hard ceiling on the STORED per-(party, geography) pressure value.
 *
 * The cost ladder saturates at `PRESSURE_LADDER_MAX_COST`, so pressure beyond
 * the point that already maxes the cheapest action (base cost 1, pressure 7)
 * has no further effect on cost. Left unbounded, per-spend `$inc` lets the
 * stored value run away, and with decay of only `PRESSURE_DECAY_PER_TURN` (3)
 * it stays pinned at max cost for dozens of turns. Capping at
 * `PRESSURE_LADDER_MAX_COST` keeps the ladder fully punishing while active
 * but lets it decay back to 0 within a few turns of inactivity.
 */
export const PRESSURE_LADDER_MAX_VALUE = PRESSURE_LADDER_MAX_COST;

/**
 * Effective PS cost given a base action cost and current pressure value.
 * Saturates at `PRESSURE_LADDER_MAX_COST`.
 */
export function effectivePsCost(baseCost: number, pressure: number): number {
  const total = baseCost + Math.max(0, pressure);
  return Math.min(total, PRESSURE_LADDER_MAX_COST);
}

// ─── Cap formulas ───────────────────────────────────────────────────────────

/**
 * Flat national PS cap, identical in every country. A uniform cap keeps a
 * real gap between a Minor party (climbing from MINOR_PARTY_BASE_PS_CAP via
 * earned regions) and a Major one, which unlocks this full cap.
 *
 * Note: REGION_COUNT_BY_COUNTRY is retained; it still drives the tier
 * graduation/demotion thresholds (⌈regions/3⌉).
 */
export const NATIONAL_PS_CAP = 280 as const;

/**
 * State / regional PS cap default. Per-row override exists on
 * `Party.politicalStrengthCap` but state-party rows currently use this
 * constant directly (no per-state override field — keeps the schema
 * minimal until a use case appears).
 */
export const STATE_PS_CAP_DEFAULT = 30 as const;

/**
 * Fraction of the normal state cap that a state/region party with only NPP
 * members (or no members) may accumulate. A single homed Player Character
 * member lifts the cap back to the full `STATE_PS_CAP_DEFAULT`.
 *
 * Rationale: NPP-only state parties were hoarding PS to the full cap, which
 * pinned the Build Org PS-leverage factor (`ownPS / avgRivalPS`) near its 0.5×
 * floor for player parties facing them. Capping NPP-only reserves at 25% keeps
 * rival reserves modest so player leverage stays meaningful.
 */
export const NPP_ONLY_STATE_PS_CAP_FRACTION = 0.25;

/**
 * Effective PS cap for a state/region party given whether it has at least one
 * homed Player Character member. With a player member: full `STATE_PS_CAP_DEFAULT`
 * (30). Otherwise (NPP-only or empty): 25% of it (7.5).
 */
export function effectiveStatePsCap(hasPlayerMember: boolean): number {
  return hasPlayerMember
    ? STATE_PS_CAP_DEFAULT
    : STATE_PS_CAP_DEFAULT * NPP_ONLY_STATE_PS_CAP_FRACTION;
}

/**
 * Region count by country, used by the cap formula. Hardcoded rather than
 * derived from the seeded map so it survives a re-cut without drifting.
 *
 * MUST match the actual seeded region count for region-derived thresholds
 * (party tier graduation, demotion) to be reachable: graduation requires
 * ⌈regions/3⌉, so a value larger than the seeded count makes it impossible.
 * Authored regions, not real-world subdivisions (IE, CN, JP).
 */
export const REGION_COUNT_BY_COUNTRY: Record<CountryId, number> = {
  US: 50,
  UK: 12,
  DE: 16,
  JP: JP_STRENGTH_REGION_COUNT,
  IE: 8, // 8 authored planning regions (not the 26 IRL counties)
  BR: 27,
  CN: 7, // 7 authored macro-regions (not the 33 IRL provinces)
  NG: 36,
  HU: 6, // 6 seeded macro-regions (Cold-War split)
  PL: 8,
  RO: 7,
  YU: 8,
  BG: 5,
  // Union republics, now seeded with real oblast/republic region sets rather
  // than the single placeholder region the dormant stubs carried.
  UKR: 6,
  BLR: 6,
  CS: 4,
  BAL: 3,
  RU: 17, // 17 seeded USSR macro-regions
  FR: 8,
  IT: 8,
  ES: 8,
  SE: 8,
  TR: 8,
  GR: 6,
  AT: 5,
  FI: 6,
  DD: 6, // 6 seeded regions (5 Länder + East Berlin)
  SCO: 7, // 7 authored sub-regions (seeded at secession)
  WAL: 6, // 6 authored sub-regions (seeded at secession)
  CA: 13, // 13 provinces and territories
} as const;

/**
 * Resolve the full national (Major) PS cap for a country. Now a flat
 * `NATIONAL_PS_CAP` for every country; the `countryId` parameter is retained so
 * call sites stay stable and a per-country cap could be reintroduced here in one
 * place if ever needed.
 */
export function nationalCapForCountry(_countryId: CountryId): number {
  return NATIONAL_PS_CAP;
}

// ─── Priority Region ────────────────────────────────────────────────────────

/**
 * Number of turns for the Priority Region cooldown. `168` turns = 7 IRL days
 * at the standard hourly cadence; matches the plan's locked assumption.
 */
export const PRIORITY_REGION_LOCKOUT_TURNS = 168 as const;

/**
 * Maximum number of states / regions in a Priority Region cluster.
 * Per the plan: "2-3 adjacent states / regions".
 */
export const PRIORITY_REGION_MAX_STATES = 3 as const;

/**
 * Extra states a party may include in its Priority Region cluster when
 * it holds the state-level executive (US governor / DE Land Minister-
 * President / JP prefectural governor / UK devolved First Minister) in
 * at least one of the cluster's states. Evaluated at SET time only —
 * losing the anchor mid-lockout doesn't shrink the cluster.
 */
export const PRIORITY_REGION_GOVERNOR_ANCHOR_BONUS = 1 as const;

// ─── Explicit PS treasury investment (chair-set per-party budget) ───────────

/**
 * Legacy premium multiplier that produced the per-country explicit-spend rate
 * from the per-country base rate (`TREASURY_PS_RATE_BY_COUNTRY`). Historical
 * anchor: US national `$75,000` base × `250/75 ≈ 3.333` = `$250,000 / +1 PS`.
 * Retained purely as part of the rate derivation; the removed phantom stream it
 * was once a "premium over" no longer exists.
 */
const PS_INVESTMENT_PREMIUM_VS_PHANTOM = 250_000 / 75_000;

/**
 * Spend-rate discount. The explicit `+1 PS` cost is `5%`
 * of the legacy per-country rate — UK national `£200,000 → £10,000`, US
 * `£250,000 → £12,500`, etc. Applied uniformly so each country keeps its own
 * (different) base rate, just 20× cheaper. Makes the spend lever materially
 * useful instead of a token nudge.
 */
const PS_INVESTMENT_RATE_FRACTION = 0.05 as const;

/**
 * Maximum PS/turn from the explicit investment budget. At the 5% rate, a party
 * draining its whole treasury buys up to this many PS/turn (flat passive
 * stacks on top).
 */
export const PS_INVESTMENT_MAX_TIERS = 20 as const;

/**
 * Effective treasury cost per `+1 PS` for the explicit investment field,
 * country-scaled. Used by `partyActionGeneration` and the `/ps-investment`
 * routes when validating the chair-set budget.
 *
 * Equals `5%` of the legacy per-country rate. Examples
 * (national): US `£12,500`, UK `£10,000`, DE `≈€11,667`, JP `≈¥833,333`.
 * State rate is half (matching the convention in `TREASURY_PS_RATE_BY_COUNTRY`).
 */
export function psInvestmentRate(countryId: CountryId, scope: "national" | "state"): number {
  // Treasury (post-cf-inconsistency-fix Phase 6) is persisted in the party's
  // native local currency, matching `TREASURY_PS_RATE_BY_COUNTRY`'s documented
  // units (£75k USD, £60k GBP, ¥5M JPY, etc.). The rate stays in native local,
  // so the math layer compares apples to apples without conversion.
  const base =
    TREASURY_PS_RATE_BY_COUNTRY[countryId]?.[scope] ?? TREASURY_PS_RATE_BY_COUNTRY.US[scope];
  return base * PS_INVESTMENT_PREMIUM_VS_PHANTOM * PS_INVESTMENT_RATE_FRACTION;
}

// ─── Build Org action ───────────────────────────────────────────────────────

/**
 * Base PS cost for one Build Org action (grow your own party's Org in a
 * specific state, drawing from the unaffiliated/independent pool).
 * Pressure ladder applies on top — repeated state-actions of any kind
 * (Build / Contest / etc.) escalate cost since the ladder is per-(party,
 * state), not per-action.
 */
export const BUILD_ORG_BASE_PS_COST = 1 as const;

/**
 * Share of the country's per-`+1 PS` treasury rate charged in CASH for one
 * Build Org click, per point of EFFECTIVE PS cost. Price is therefore
 * `TREASURY_PS_RATE_BY_COUNTRY[country][scope] × this × effectivePsCost`, which
 * (a) normalizes across currencies via the same table the PS streams use and
 * (b) makes the pressure ladder bite in cash as well as in PS: a party
 * grinding one state at the ladder's cap pays 8× per click.
 *
 * Calibrated against the live ledger rather than a plausible-looking sticker
 * price: at 0.075, top builders would spend roughly 17-124% of their treasury
 * inflow (median ~60%), making org building the largest discretionary line
 * without shutting anyone out. Assumes behaviour unchanged, so an upper bound;
 * real spend settles lower as parties spread clicks to let pressure decay.
 */
export const ORG_BUILD_TREASURY_FRACTION = 0.075 as const;

/**
 * Floor on the funded fraction of a Build Org click (see `buildOrgFunding`).
 *
 * Build Org accepts partial payment once the treasury covers this fraction of
 * the quote. Every successful click still deposits the same fixed bucket unit.
 * That matters because the parties least able to pay are often the ones with
 * the most ground to make up, while a hard gate would lock them out entirely.
 *
 * The floor bounds that in both directions. Below it the click is REFUSED
 * before any PS is spent, so nobody buys a near-worthless click; at or above
 * it the click lands at the funded fraction. After PS has been committed the
 * reported fraction is clamped UP to this floor (`clampFundedFraction`) when a
 * concurrent debit drains the treasury after PS has already been committed.
 */
export const ORG_BUILD_MIN_FUNDED_FRACTION = 0.25 as const;

/**
 * Band the per-state size multiplier is clamped into (see `orgBuildSizeMultiplier`).
 *
 * Build Org's price scales with state size because Org is consumed as a
 * normalized SHARE of its state, so a flat price underprices the states worth
 * winning.
 *
 * Two deliberate limits:
 *  - The curve is a SQUARE ROOT, not linear. Linear on the live US spread would
 *    make tiny-state Org nearly free and turn farming it into the dominant
 *    strategy.
 *  - The result is clamped into this band, so the widest real spread (US, 63.7x
 *    population) resolves to a 4x price range rather than 8x raw.
 *
 * The multiplier averages 1 ACROSS REGIONS, not across clicks. Players organize
 * where it matters, so the click-weighted mean is ~1.35 and the effective
 * `ORG_BUILD_TREASURY_FRACTION` level runs ~13.5% above where it was calibrated.
 * Paying more IS the mechanic: the dearer clicks buy the most valuable Org.
 */
export const ORG_BUILD_SIZE_MULTIPLIER_MIN = 0.5 as const;
export const ORG_BUILD_SIZE_MULTIPLIER_MAX = 2.0 as const;
