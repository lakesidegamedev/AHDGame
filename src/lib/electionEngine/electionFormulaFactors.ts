/**
 * Default Support value seeded on candidate entry (per design doc §3.1
 * "written on candidate entry — defaulted to a calibration constant per
 * Phase 4 kickoff"). Chosen at 50 so `supportMoodMultiplier(50) = 1.0×` —
 * a fresh candidate enters at neutral mood and only campaign actions /
 * scandals / endorsements push it off baseline.
 */
export const DEFAULT_CANDIDATE_SUPPORT = 50 as const;

/**
 * Per-turn Support decay while the election is `active` (regression toward the
 * neutral midpoint 50). Fast enough that a single rally is not wasted on a
 * long primary calendar, slow enough to keep actions repeatable.
 */
export const SUPPORT_DECAY_PER_TURN = 0.5 as const;

// ─── Phase B Support mutation calibration ───────────────────────────────────
//
// Constants for the action paths that move `electionCandidates.support`
// off its 50 baseline. Calibration knobs, not invariants.

/**
 * Total Support "worth" of one presidential rally event. Per the design doc,
 * the value is distributed as 60% immediate this-turn / 40% spread over
 * future turns.
 */
export const SUPPORT_RALLY_FULL_VALUE = 10 as const;

/** Share of a rally's full value applied immediately on the turn it fires. */
export const RALLY_IMMEDIATE_SHARE = 0.6 as const;

/**
 * How many turns the remaining (1 − RALLY_IMMEDIATE_SHARE) of a rally's
 * value is spread across. Per-turn drip = `(1 − immediate) × R / spread_turns`.
 */
export const RALLY_SPREAD_TURNS = 4 as const;

/**
 * Action cost of a one-shot rally for a presidential campaign.
 */
export const SUPPORT_RALLY_ACTION_COST = 20 as const;

/**
 * Action cost of a per-turn rally-tour tick. ~50% of one-shot at the
 * presidential baseline — a tour is cheaper per tick but consumes every
 * turn it's active.
 */
export const SUPPORT_RALLY_TOUR_TICK_ACTION_COST = 10 as const;

/**
 * Support penalty when a scandal lands on a character with an active
 * candidate row. Scandal severity tiers (when wired) can multiply this
 * base.
 */
export const SUPPORT_SCANDAL_PENALTY = 10 as const;

/**
 * Support bump when an endorsement lands on a candidate. One-shot —
 * the endorsement's vote-time multiplier persists separately. Revoking
 * the endorsement reverses this bump by the same amount.
 */
export const SUPPORT_ENDORSEMENT_BUMP = 3 as const;

/**
 * Support bump for a debate win. Debate resolution currently applies
 * favorability deltas only; this constant is not consumed on that path.
 */
export const SUPPORT_DEBATE_WIN_BUMP = 4 as const;

/**
 * Phase 5a formula factors for general-election vote distribution.
 *
 * Implements the three signals committed by Phase 0.5 §7.3.2's general-election
 * formula contract — Org as normalized state share, Reg as persuasion
 * resistance, Support as candidate-level mood.
 *
 * Pure functions; safe for both server and client. Bounds and curves chosen
 * for tunability - the Balance Appendix records calibration tweaks rather
 * than this file. Backward-compat: every helper returns a neutral value
 * when its input is `undefined` (unseeded Reg / Support rows).
 *
 * See plan §"Phase 5a — Decisions Recorded During Execution" D4-D5.
 */

/**
 * Org as the party's normalized share of the total state-level Organization:
 * `org[partyId] / Σorg`, matching the plan's normalized 100% pool share.
 *
 * Edge cases:
 *   - Total Org = 0 → return 0.
 *   - Single party in state → return 1.
 *   - Party not in map / has 0 Org → return 0.
 *   - Negative Orgs treated as 0 (defensive against bad data).
 *
 * @returns Number in `[0, 1]`. Sum across all parties present in the map = 1
 *          when the total is positive.
 */
export function normalizedOrgShare(orgByParty: Map<string, number>, partyId: string): number {
  const ownOrg = Math.max(0, orgByParty.get(partyId) ?? 0);
  let total = 0;
  for (const value of orgByParty.values()) {
    total += Math.max(0, value);
  }
  if (total <= 0) return 0;
  return ownOrg / total;
}

/**
 * Exponent applied to the normalized Org share when it enters the vote weight.
 * `< 1` gives diminishing returns - doubling Org less-than-doubles weight -
 * which softens a dominant party's structural Org edge. `0.2` is the tuned
 * value (a 3:1 Org lead yields ~1.25:1 weight); `1.0` would reproduce the
 * legacy linear share.
 */
export const ORG_WEIGHT_EXPONENT = 0.2;

/**
 * Org's contribution to a candidate's vote weight: the party's normalized
 * state Org share raised to `ORG_WEIGHT_EXPONENT` (diminishing-returns curve).
 *
 * Edge cases mirror the engines' contract:
 *  - No Org data anywhere in the state (empty / all-zero map) → neutral `1`
 *    (don't zero the whole field on unseeded worlds / test fixtures).
 *  - A party with 0 Org in a populated state → `0` (no presence → no weight;
 *    the gate is preserved, and swing-flow's `personalOrgFloor` still applies
 *    on top where wired).
 */
export function orgVoteWeight(orgByParty: Map<string, number>, partyId: string): number {
  let total = 0;
  for (const value of orgByParty.values()) total += Math.max(0, value);
  if (total <= 0) return 1; // no Org data anywhere → neutral fallback
  const share = Math.max(0, orgByParty.get(partyId) ?? 0) / total;
  return Math.pow(share, ORG_WEIGHT_EXPONENT);
}

/**
 * Maximum org-equivalent a candidate can reach from pure personal pull (no
 * party machinery). Well below a real party's normalized org share, so building
 * party organisation remains the path to winning; this only rescues ~0-org
 * candidates from a literal zero. See #0671.
 */
export const PERSONAL_ORG_FLOOR_CAP = 0.1;

/**
 * A candidate's personal "ground game" floor on effective org, from their own
 * pull: reach (√influence, 0–1) × approval (favorability/100, 0–1). Independent
 * of party org, so a genuinely-supported candidate is never zeroed by 0 party
 * organisation. Returns 0 when either input is 0; negatives clamped to 0.
 */
export function personalOrgFloor(reach: number, approval: number): number {
  return PERSONAL_ORG_FLOOR_CAP * Math.max(0, reach) * Math.max(0, approval);
}

/**
 * Minimum vote-weight reach after normalizeNPI / presidential-primary reach
 * curves. Without this, PI=0 yields reach=0 and the candidate accumulates
 * zero votes, looking removed from the race. The floor keeps zero-PI players
 * visible as a steep disadvantage, not an erasure. Downstream zeros
 * (approval=0, regimeMult=0) still erase a candidate.
 */
export const VOTE_REACH_FLOOR = Math.sqrt(1 / 100);

/** Clamp a normalized reach into [VOTE_REACH_FLOOR, ∞). */
export function applyVoteReachFloor(reach: number): number {
  return Math.max(VOTE_REACH_FLOOR, reach);
}

/**
 * Tenure fatigue for politicalInfluence / favorability: erodes the
 * tenure-holder's effective stats per consecutive term beyond the first.
 *
 * Without this, campaigning characters asymptotically pin near 100 while
 * non-campaigners decay, producing a permanent gap that re-arms every
 * election. Gated on tracked tenure (US President, Senate, House); absent
 * tenure data returns exactly 1.0, so single-election balance tests are
 * unaffected.
 *
 * Returns a retention FRACTION, not a points subtraction: a flat points
 * charge is regressive against low-stat candidates and can zero out an
 * ordinary officeholder. Callers scale the stat (stat * retention).
 */
export const PERSONAL_STAT_TENURE_EROSION_PER_TERM = 0.03;
export const PERSONAL_STAT_TENURE_EROSION_MAX = 0.15;

/**
 * Fraction of a tenure-holder's politicalInfluence / favorability that still
 * counts, given their consecutive terms. Returns a multiplier in
 * `[1 - PERSONAL_STAT_TENURE_EROSION_MAX, 1]`, never 0, so callers scale the
 * stat (`stat * retention`) rather than subtracting from it.
 */
export function personalStatTenureRetention(consecutiveTerms: number | undefined): number {
  if (consecutiveTerms == null || !Number.isFinite(consecutiveTerms)) return 1;
  const termsBeyondFirst = Math.max(0, Math.floor(consecutiveTerms) - 1);
  const erosion = Math.min(
    PERSONAL_STAT_TENURE_EROSION_MAX,
    termsBeyondFirst * PERSONAL_STAT_TENURE_EROSION_PER_TERM
  );
  return 1 - erosion;
}

/**
 * The three tenure sources disagree on units. The presidential ledger and the
 * House map report terms ALREADY HELD (first-termer = 1). The Senate counter
 * reports the term being SOUGHT (same senator = 2), so normalize here to avoid
 * an extra term of erosion. Done here rather than in the counter because the
 * Senate incumbency shield consumes the raw sought-term value.
 */
export function legislativeTenureTermsHeld(soughtTerm: number | undefined): number | undefined {
  return soughtTerm == null ? undefined : soughtTerm - 1;
}

/**
 * Reg as persuasion-resistance multiplier: entrenched voters defend their party against peeling. Multiplies this party's weight in the demographic-group split.
 *
 * Linear `1 + 0.3 × (reg / 100)`, clamped to `[1.0, 1.3]`: reg 0 → 1.0×, reg 50 → 1.15×, reg 100 → 1.3×.
 *
 * undefined / NaN / negative reg returns 1.0× (neutral), matching the bootstrap-deferred state where most rows have `registration: undefined`.
 *
 * Bounds are intentionally modest: Reg is a slow partisan baseline, a tilt not a wall, so insurgent campaigns can still flip a state through cumulative effort.
 */
export const REG_RESISTANCE_MAX_BONUS = 0.3;
export function regResistanceMultiplier(reg: number | undefined): number {
  if (reg == null || !Number.isFinite(reg) || reg <= 0) return 1.0;
  const clamped = Math.min(100, reg);
  return 1 + REG_RESISTANCE_MAX_BONUS * (clamped / 100);
}

/**
 * Support as candidate-level mood multiplier: short-term momentum (debates, scandals, endorsements) independent of the party's Reg / Org.
 *
 * `0.6 + 0.8 × (support / 100)`, clamped to `[0.6, 1.4]`: support 0 → 0.6×, 50 → 1.0× (new-candidate default), 100 → 1.4×.
 *
 * undefined / NaN returns 1.0× so rows without Support are not penalized.
 *
 * Asymmetry is intentional: scandalous candidates lose meaningfully (0.6× of their weighted share) but are not zeroed out, leaving room for a comeback within the cycle.
 */
export const SUPPORT_MOOD_FLOOR = 0.6;
export const SUPPORT_MOOD_CEILING = 1.4;
export function supportMoodMultiplier(support: number | undefined): number {
  if (support == null || !Number.isFinite(support)) return 1.0;
  const clamped = Math.max(0, Math.min(100, support));
  return SUPPORT_MOOD_FLOOR + (SUPPORT_MOOD_CEILING - SUPPORT_MOOD_FLOOR) * (clamped / 100);
}

/**
 * Party-baseline registration multiplier: a structural vote-weight scalar,
 * distinct from `regResistanceMultiplier` (a 1.0-1.3x persuasion tilt).
 *
 * Without it, seeded polling enters the vote kernel only through Org's
 * `share^0.2` curve, so a low-polling party pays a small penalty. Weighting
 * by `share^REG_BASELINE_EXPONENT` (concave, sqrt by default) makes the
 * partisan baseline bite: 2.5% registration ~ 0.16x, 45-50% ~ 0.67-0.71x.
 *
 * Input is the party's current `statePartyOrg.registration` (0-100). The host
 * decides whether a region uses this baseline; UK regions opt in, others are
 * unchanged so existing peel and resistance curves are not double-counted.
 *
 * COMPATIBILITY CONTRACT: returns exactly 1.0 when the baseline lane is not
 * enabled (undefined or non-finite input). Once a region has registration
 * data, a party with no row is passed 0 and floored at `REG_BASELINE_MIN_SHARE`.
 */
export const REG_BASELINE_EXPONENT = 0.5;
export const REG_BASELINE_MIN_SHARE = 0.005;
export function regBaselineMultiplier(regShare: number | undefined): number {
  if (regShare == null || !Number.isFinite(regShare)) return 1.0;
  const pct = Math.max(0, Math.min(100, regShare));
  const share = Math.max(REG_BASELINE_MIN_SHARE, pct / 100);
  return Math.pow(share, REG_BASELINE_EXPONENT);
}

export interface CurrentRegistrationBaselineRow {
  partyId: string;
  registration?: number;
}

/**
 * Builds the current-registration baseline for one region. An undefined map
 * disables the lane and preserves prior behavior. Once any current Reg data
 * exists, missing party values become 0 so a late-created or incomplete row
 * cannot receive the neutral multiplier reserved for disabled regions.
 */
export function buildCurrentRegistrationBaseline(
  rows: ReadonlyArray<CurrentRegistrationBaselineRow>,
  countryId: string
): Map<string, number> | undefined {
  if (countryId !== "UK" || !rows.some((row) => Number.isFinite(row.registration))) {
    return undefined;
  }

  return new Map(
    rows.map((row) => [
      row.partyId,
      typeof row.registration === "number" && Number.isFinite(row.registration)
        ? row.registration
        : 0,
    ])
  );
}

// ─── §7.3.2 swing-flow curves ───────────────────────────────────────────────
//
// High-Reg incumbents must not win the electoral count while losing the
// popular vote in close cycles. Calibrated so:
//
//   - Newcomer parties (Reg ≈ 0): ~20% transferable, 0% resistance →
//     ~20% effective peel.
//   - Entrenched parties (Reg ≈ 100): ~10% transferable, ~50% resisting
//     → ~5% effective peel. A tilt, not a wall.
//   - Crossover around Reg=40-60. Quadratic shape preserved.
//
// Numbers verifiable in voteDistributionSwingFlow.test.ts under
// "transferableShare curve" / "persuasionResistance curve".

/**
 * Maximum share of a party's nominal vote that can be peeled by
 * persuasion in one election. Per §7.3.2, higher own Reg = larger
 * absolute pool (more voters present) but smaller transferable fraction
 * (entrenched). Quadratic shape, concave down:
 *
 *   transferable_share(0)   = 0.20
 *   transferable_share(50)  = 0.20 + (0.10−0.20) × (50/100)^1.5 ≈ 0.165
 *   transferable_share(100) = 0.10
 *
 * Backward-compat: undefined / NaN / negative reg returns 0.20 (the
 * "no Reg data" baseline matches the bootstrap-deferred state).
 */
export const TRANSFERABLE_SHARE_NO_REG = 0.2;
export const TRANSFERABLE_SHARE_FULL_REG = 0.1;
const TRANSFERABLE_SHARE_EXPONENT = 1.5;
export function transferableShare(reg: number | undefined): number {
  if (reg == null || !Number.isFinite(reg) || reg < 0) return TRANSFERABLE_SHARE_NO_REG;
  const clamped = Math.min(100, reg);
  const t = Math.pow(clamped / 100, TRANSFERABLE_SHARE_EXPONENT);
  return TRANSFERABLE_SHARE_NO_REG + (TRANSFERABLE_SHARE_FULL_REG - TRANSFERABLE_SHARE_NO_REG) * t;
}

/**
 * Fraction of the transferable pool that resists peeling. Higher own Reg means
 * higher resistance. Net peelable = transferable_share × (1 - persuasionResistance).
 * Quadratic curve: 0 at Reg 0, 0.125 at Reg 50, 0.5 at Reg 100. Combined with
 * `transferableShare` this yields a smooth ~4x falloff in effective peelable
 * share between newcomer and entrenched, so entrenched parties have a
 * structural edge reversible by cumulative campaign pressure.
 */
export const PERSUASION_RESISTANCE_NO_REG = 0.0;
export const PERSUASION_RESISTANCE_FULL_REG = 0.5;
const PERSUASION_RESISTANCE_EXPONENT = 2;
export function persuasionResistance(reg: number | undefined): number {
  if (reg == null || !Number.isFinite(reg) || reg < 0) return PERSUASION_RESISTANCE_NO_REG;
  const clamped = Math.min(100, reg);
  const t = Math.pow(clamped / 100, PERSUASION_RESISTANCE_EXPONENT);
  return (
    PERSUASION_RESISTANCE_NO_REG +
    (PERSUASION_RESISTANCE_FULL_REG - PERSUASION_RESISTANCE_NO_REG) * t
  );
}

/**
 * Effective peelable fraction of a party's nominal vote — the single
 * multiplier the swing-flow engine applies to persuasion drivers:
 *
 *   eff_peel(reg) = transferableShare(reg) × (1 − persuasionResistance(reg))
 *
 *   eff_peel(undefined / no Reg data) = 0.20 × 1.00  = 0.200
 *   eff_peel(50)                      ≈ 0.165 × 0.875 ≈ 0.144
 *   eff_peel(100)                     = 0.10 × 0.50  = 0.050
 *
 * Exported so the driver-display layer can scale its "pp" rows by the SAME
 * fraction the engine uses (UI honesty: displayed driver magnitudes must not
 * overstate the real vote impact by the 5-20x pre-peel factor).
 */
export function effectivePeelableFraction(reg: number | undefined): number {
  return transferableShare(reg) * (1 - persuasionResistance(reg));
}

// Money-driver spend stock: reads a decaying stock of recent spend, not raw spend-this-turn. Steady spending beats one-shot splurges over time; idle turns fade (like Support's SUPPORT_DECAY_PER_TURN) rather than cliffing; hoarded treasuries score zero since the stock grows only through actual spend. Campaign rows are deleted on resolution, so no stock carries across cycles.

/**
 * Fraction of a campaign's spend stock carried from one turn to the next.
 * `0.8` = half-life ~3.1 turns, steady state 5x per-turn spend. A 100x
 * one-time splurge outscores steady spending for ~13 turns, then loses —
 * recency matters, but so does persistence. Tuning knob, not invariant.
 */
export const SPEND_STOCK_RETENTION = 0.8;

/** Stock values below $1 are dust: dropped to keep rows self-cleaning. */
export const SPEND_STOCK_DUST_CUTOFF = 1;

/**
 * One turn of spend-stock rollover. Pure helper; the turn-phase sweep in
 * `campaignSpendReset.ts` applies the same math as a DB pipeline update.
 */
export function rollSpendStock(
  stock: number | undefined,
  spendThisTurn: number | undefined,
  retention: number = SPEND_STOCK_RETENTION
): number | undefined {
  const prior = typeof stock === "number" && stock > 0 ? stock : 0;
  const fresh = typeof spendThisTurn === "number" && spendThisTurn > 0 ? spendThisTurn : 0;
  const rolled = prior * retention + fresh;
  return rolled < SPEND_STOCK_DUST_CUTOFF ? undefined : rolled;
}
