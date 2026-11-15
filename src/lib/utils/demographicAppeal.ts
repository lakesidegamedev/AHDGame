/**
 * Shared demographic appeal formula for elections, polls, and NPP dropout.
 *
 * Model:
 *   • Appeal = position score (power curve, exponent APPEAL_POSITION_EXPONENT) + influence score (political influence)
 *   • Approval (favorability) scales votes at the end — voters won't support candidates they don't approve of
 *   • Political influence affects both reach (who you can reach) and appeal (credibility/visibility)
 *
 * Max appeal = 50 (position 0-25, influence 0-25 when included).
 */

import { normalizeNPI } from "./normalizeNPI";

/** Max appeal value for normalization */
export const MAX_APPEAL = 50;

/**
 * Minimum position score floor — ensures every candidate gets a non-zero
 * weight in every demographic group regardless of positional distance.
 * Prevents complete lockout of one party from any group (realistic: even the
 * most misaligned candidate still draws a small fraction of votes).
 * Value 0.5 is ~2% of the max position score of 25.
 */
export const APPEAL_POSITION_FLOOR = 0.5;

/**
 * Position-score exponent γ ("soften-appeal"): single knob for how steeply
 * positional alignment converts into appeal.
 *
 *   positionScore = (γ === 2 ? positionRaw²/100 : 25·(positionRaw/50)^γ) + floor
 *
 * γ=2 is the legacy squared curve and gives the position term a ~50-110×
 * dynamic range, dwarfing every non-ideology lever (favorability ~3×, Org ~2×,
 * persuasion ~1.4×). γ<2 compresses that range so campaigning matters.
 *
 * Endpoint-matched: positionRaw=0 → 0 and positionRaw=50 → 25 for any γ, so
 * the MAX_APPEAL=50 scale and its normalized consumers are unchanged. γ=2
 * reproduces legacy behavior byte-identically.
 *
 * Calibrated as a pair with DIRECTION_BONUS_PER_AXIS; change the pair together.
 */
export const APPEAL_POSITION_EXPONENT: number = 1.5;

/**
 * Tribal-voter directional bonus per axis. Added to `positionScore` for each
 * axis (EP, SP) where the candidate's sign matches the group's lean direction:
 * right-leaning voters prefer a right-leaning candidate over a centrist even
 * when the centrist is closer in absolute distance.
 *
 * Paired with APPEAL_POSITION_EXPONENT = 1.5: the position term's dynamic range
 * is compressed, so this flat per-axis bonus must stay small or it dominates
 * positioning. Restoring legacy behavior means BOTH the legacy exponent AND
 * this bonus are restored together.
 *
 * Edge cases:
 *   - Group exactly 0 on an axis: no directional preference, no bonus.
 *   - Candidate exactly 0 on an axis: no bonus, no penalty; cross-appeal stays
 *     intact via the absolute-distance term.
 */
export const DIRECTION_BONUS_PER_AXIS = 5;

/**
 * Ramp half-width for the directional bonus. A candidate's per-axis lean reaches
 * full tribal alignment once `|position| >= DIRECTION_RAMP`. Tied to the game's
 * own "Centrist vs leaning" label threshold (`roundLabelBucket` in
 * `src/lib/utils/politics.ts`: `|value| < 0.5` buckets to 0 = "Centrist"/"Moderate").
 */
export const DIRECTION_RAMP = 0.5;

/**
 * Bonus fraction a dead-center candidate (axis at exactly 0) earns in a leaning
 * group: acceptable to all, champion of none. The per-axis factor ramps linearly
 * from `CENTER_FRACTION` at center to 1.0 at the ramp threshold to 0 when opposed
 * past it. 1/3 is mid-pack, so centrists are not punished while partisans keep
 * their stronghold edge.
 */
export const CENTER_FRACTION = 1 / 3;

/**
 * Compute raw appeal from policy alignment and political influence.
 * Does NOT include favorability — that scales votes at the end.
 *
 * @param demoEP - Group economic lean (-5 to +5)
 * @param demoSP - Group social lean (-5 to +5)
 * @param charEP - Candidate economic position (-5 to +5)
 * @param charSP - Candidate social position (-5 to +5)
 * @param politicalInfluence - clamped to [0, 100] by normalizeNPI; sqrt curve maps to a 0-1 multiplier
 * @param includeInfluenceInAppeal
 *   true  → presidential elections: NPI adds up to 25 pts to appeal (national recognition as persuasion)
 *   false → state elections: NPI is reach-only (name recognition = who you reach, not how persuasive)
 * @returns Appeal score ≥ APPEAL_POSITION_FLOOR (approaches 0 but never reaches it)
 */
export function calcAppeal(
  demoEP: number,
  demoSP: number,
  charEP: number,
  charSP: number,
  politicalInfluence: number,
  includeInfluenceInAppeal: boolean = true,
  partyEP?: number,
  partySP?: number
): number {
  const diff = (a: number, b: number) => Math.abs(a - b);
  const positionRaw = Math.max(0, 50 - diff(demoEP, charEP) * 5 - diff(demoSP, charSP) * 5);
  // Floor ensures appeal never reaches exactly 0 — distant candidates still draw
  // a small fraction of votes rather than being completely locked out of any group.
  //
  // γ = APPEAL_POSITION_EXPONENT softens the legacy squared curve (see the
  // constant's doc comment). Endpoint-matched: 0 → 0, 50 → 25 for any γ; the
  // γ===2 branch is the byte-identical legacy expression.
  const positionScore =
    (APPEAL_POSITION_EXPONENT === 2
      ? Math.pow(positionRaw, 2) / 100
      : 25 * Math.pow(positionRaw / 50, APPEAL_POSITION_EXPONENT)) + APPEAL_POSITION_FLOOR;
  // Tribal-voter directional bonus, continuous through center: scales from
  // CENTER_FRACTION at dead-center to 1.0 when leaning >= DIRECTION_RAMP the
  // group's way, and 0 past the opposite threshold. A neutral group (lean 0)
  // grants no bonus.
  //
  // Party gate: when party args are provided and a leaning candidate disagrees
  // in sign with their party on an axis, the bonus is suppressed to 0 there.
  // Centrists have no sign conflict and keep center credit.
  const directionFactor = (demoAxis: number, charAxis: number, partyAxis?: number): number => {
    if (demoAxis === 0) return 0;
    if (
      partyAxis !== undefined &&
      partyAxis !== 0 &&
      charAxis !== 0 &&
      Math.sign(partyAxis) !== Math.sign(charAxis)
    ) {
      return 0;
    }
    // Signed lean strength saturating at ±DIRECTION_RAMP, projected onto the
    // group's lean direction: +1 fully aligned, 0 centrist, -1 fully opposed.
    const lean = Math.max(-1, Math.min(1, charAxis / DIRECTION_RAMP));
    const align = lean * Math.sign(demoAxis);
    return Math.max(0, Math.min(1, CENTER_FRACTION + (1 - CENTER_FRACTION) * align));
  };
  const directionBonus =
    DIRECTION_BONUS_PER_AXIS *
    (directionFactor(demoEP, charEP, partyEP) + directionFactor(demoSP, charSP, partySP));
  // normalizeNPI caps at 2.0, so scaling by 12.5 keeps the influence
  // contribution within the 0-25 range promised by the docstring (and the
  // MAX_APPEAL=50 combined ceiling).
  const influenceScore = includeInfluenceInAppeal ? normalizeNPI(politicalInfluence) * 12.5 : 0;
  return positionScore + directionBonus + influenceScore;
}

/**
 * Softening exponent on the approval scalar: `scalar = (fav/100)^γ` with
 * γ < 1 pulls the curve toward 1 in the middle while preserving both
 * endpoints (0 → 0, 100 → 1).
 *
 * A power curve rather than a floor (`a + (1-a)·fav/100`): the floor breaks the
 * documented rule that 0% favorability means 0 votes (see
 * `voteDistribution.test.ts` "zero favorability candidate gets effectively no
 * votes" and the wiki demographics page). A power curve compresses the spread
 * while leaving that endpoint intact.
 *
 * Calibration guard: `voteDistribution.test.ts` "balance: favorability impacts
 * vote share" requires an 80-vs-20 matchup to stay above a 2.5x ratio, which
 * holds at γ = 0.8 (3.03x). γ below ~0.62 breaks it; treat 0.8 as the floor
 * for this knob, not a midpoint.
 */
export const APPROVAL_SCALAR_EXPONENT = 0.8;

/**
 * Approval scalar: 0% favorability = 0 votes, 100% = full votes.
 * "If voters don't approve of you they won't vote for you."
 *
 * @param favorability - 0-100
 * @returns Multiplier 0-1
 */
export function approvalScalar(favorability: number): number {
  const normalized = Math.max(0, Math.min(1, (favorability ?? 50) / 100));
  return Math.pow(normalized, APPROVAL_SCALAR_EXPONENT);
}

// Retired: `partyOrgScalar` (1.0-1.6×) and
// `partyOrgScalarPresidential` (1.0–2.5×) soft Org multipliers. General
// elections and polls now use `normalizedOrgShare` (party's normalized state
// Org share, `[0, 1]`); primaries use a uniform neutral `1×` (intra-party Org
// cancels). The election engines' former "no Org data" fallback that returned
// these scalars at 1.0× is now an explicit neutral `1×`.
