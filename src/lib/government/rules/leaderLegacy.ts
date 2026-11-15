/**
 * Presidential legacy: how a head of government's time in office is judged when
 * they leave, and what that does to their party afterwards.
 *
 * Inputs, each normalised to -1..1: approval at exit against the neutral 50, laws
 * enacted (a credit), Crisis v2 credit and blame, and crisis scars (a debit). The
 * weighted sum is the score, -100..100. It becomes a bounded, decaying shift in
 * the party's vote share and in the governing party's approval as party renewal
 * reads it. Both are small: a legacy colours the next cycle, it never decides it.
 */

/** Neutral approval, percent. */
export const NEUTRAL_APPROVAL = 50;
export const WEIGHT_APPROVAL = 0.4;
export const WEIGHT_LAWS = 0.2;
export const WEIGHT_CRISIS = 0.3;
export const WEIGHT_SCARS = 0.1;
/** Laws enacted in a term at which the laws term reaches about 0.76 (tanh 1). */
export const LAWS_SCALE = 10;
/** Summed crisis approval points (credit minus blame) at which the crisis term saturates toward 1. */
export const CRISIS_POINTS_SCALE = 6;
/** Summed scar magnitude (fractions) at which the scar term reaches about -0.76. */
export const SCAR_SCALE = 0.15;
/** Terms shorter than this many turns scale the score down: a caretaker has no legacy. */
export const FULL_LEGACY_TENURE_TURNS = 24;

/** Largest party vote-share shift one legacy gives, percent, at the moment of departure. */
export const MAX_LEGACY_VOTE_PCT = 2;
/** Largest governing-party approval shift one legacy gives the renewal phase, points. */
export const MAX_LEGACY_APPROVAL_POINTS = 5;
/** Turns for a legacy's effect to halve. */
export const LEGACY_HALF_LIFE_TURNS = 96;
/** Turns after departure at which the effect is dropped altogether (three half-lives, about 12%). */
export const LEGACY_HORIZON_TURNS = 288;
/** Below this many vote-share percent a decayed shift is not worth applying. */
export const MIN_APPLIED_VOTE_PCT = 0.02;

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Number.isFinite(value) ? value : 0));

export type LegacyExitReason = "term_end" | "vacancy";

export interface LegacyInput {
  /** Turns the leader held office. */
  tenureTurns: number;
  /** Government approval at the last snapshot before leaving, 0-100; null when unknown. */
  exitApproval: number | null;
  /** Laws signed or enacted during the term. */
  lawsEnacted: number;
  /** Sum of the leader's crisis verdict approval points: credit positive, blame negative. */
  crisisPoints: number;
  /** Sum of the scar magnitudes (fractions) from crises that began during the term. */
  scarMagnitude: number;
}

export interface LegacyComponents {
  approval: number;
  laws: number;
  crisis: number;
  scars: number;
}

export interface LegacyScore {
  /** -100..100. */
  score: number;
  components: LegacyComponents;
  /** Multiplier applied for a short term, 0..1. */
  tenureFactor: number;
}

export function computeLegacyScore(input: LegacyInput): LegacyScore {
  const approval =
    input.exitApproval == null
      ? 0
      : clamp((input.exitApproval - NEUTRAL_APPROVAL) / NEUTRAL_APPROVAL, -1, 1);
  const laws = Math.tanh(Math.max(0, input.lawsEnacted) / LAWS_SCALE);
  const crisis = Math.tanh(input.crisisPoints / CRISIS_POINTS_SCALE);
  const scars = -Math.tanh(Math.max(0, input.scarMagnitude) / SCAR_SCALE);
  const tenureFactor = clamp(input.tenureTurns / FULL_LEGACY_TENURE_TURNS, 0, 1);
  const raw =
    WEIGHT_APPROVAL * approval + WEIGHT_LAWS * laws + WEIGHT_CRISIS * crisis + WEIGHT_SCARS * scars;
  return {
    score: Math.round(clamp(raw * tenureFactor, -1, 1) * 1000) / 10,
    components: { approval, laws, crisis, scars },
    tenureFactor,
  };
}

/** Share of a legacy's effect left `elapsedTurns` after the leader departed, 0..1. */
export function legacyDecay(elapsedTurns: number): number {
  if (!Number.isFinite(elapsedTurns) || elapsedTurns < 0) return 1;
  if (elapsedTurns >= LEGACY_HORIZON_TURNS) return 0;
  return Math.pow(0.5, elapsedTurns / LEGACY_HALF_LIFE_TURNS);
}

/** The party vote-share shift (percent) a score gives at the moment of departure. */
export function legacyVotePct(score: number): number {
  return Math.round(clamp(score / 100, -1, 1) * MAX_LEGACY_VOTE_PCT * 1000) / 1000;
}

/** The governing-party approval shift (points) a score gives at the moment of departure. */
export function legacyApprovalPoints(score: number): number {
  return Math.round(clamp(score / 100, -1, 1) * MAX_LEGACY_APPROVAL_POINTS * 100) / 100;
}

/** A stored legacy, as far as the decay readers need it. */
export interface LegacyEffectRow {
  partyId: string;
  /** Initial vote-share shift, percent. */
  votePct: number;
  /** Initial approval shift, points. */
  approvalPoints: number;
  /** Turn the leader left. */
  endTurn: number;
}

/** Vote-share percent the legacy still gives at `turn`; 0 once it is below the floor. */
export function currentVotePct(row: Pick<LegacyEffectRow, "votePct" | "endTurn">, turn: number) {
  const pct = row.votePct * legacyDecay(turn - row.endTurn);
  return Math.abs(pct) < MIN_APPLIED_VOTE_PCT ? 0 : pct;
}

/** Approval points the legacy still gives at `turn`. */
export function currentApprovalPoints(
  row: Pick<LegacyEffectRow, "approvalPoints" | "endTurn">,
  turn: number
): number {
  return row.approvalPoints * legacyDecay(turn - row.endTurn);
}

/**
 * Approval points per party from every stored legacy still in force, summed and
 * bounded to one legacy's worth either way so a string of leaders cannot stack.
 */
export function approvalPointsByParty(
  rows: readonly Pick<LegacyEffectRow, "partyId" | "approvalPoints" | "endTurn">[],
  turn: number
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.partyId, (totals.get(row.partyId) ?? 0) + currentApprovalPoints(row, turn));
  }
  for (const [partyId, total] of totals) {
    totals.set(partyId, clamp(total, -MAX_LEGACY_APPROVAL_POINTS, MAX_LEGACY_APPROVAL_POINTS));
  }
  return totals;
}

export type LegacyTier = "great" | "good" | "mixed" | "poor" | "disastrous";

export function legacyTier(score: number): LegacyTier {
  if (score >= 40) return "great";
  if (score >= 12) return "good";
  if (score > -12) return "mixed";
  if (score > -40) return "poor";
  return "disastrous";
}

export const LEGACY_TIER_LABELS: Record<LegacyTier, string> = {
  great: "Celebrated",
  good: "Well regarded",
  mixed: "Mixed",
  poor: "Poorly regarded",
  disastrous: "Remembered for failure",
};

/** One-line news copy for a departure. */
export function legacyNewsLine(input: {
  leaderName: string;
  countryName: string;
  score: number;
  reason: LegacyExitReason;
}): string {
  const tier = LEGACY_TIER_LABELS[legacyTier(input.score)].toLowerCase();
  const how = input.reason === "vacancy" ? "left office" : "handed over power";
  return `${input.leaderName} ${how} in ${input.countryName}. Historians' first verdict: ${tier} (legacy ${input.score > 0 ? "+" : ""}${Math.round(input.score)}). The legacy now shapes how voters see their party in the next cycle, fading over time.`;
}

/** The approval the party renewal phase sees for a governing party: the real rating plus its legacy shift. */
export function legacyAdjustedApproval(
  approval: number | null,
  legacyPoints: number | undefined
): number | null {
  if (approval == null || !Number.isFinite(approval)) return null;
  return clamp(approval + (legacyPoints ?? 0), 0, 100);
}

export interface LeaderLegacyViewRow {
  id: string;
  leaderName: string;
  partyId: string | null;
  startTurn: number | null;
  endTurn: number;
  reason: LegacyExitReason;
  score: number;
  tier: LegacyTier;
  tierLabel: string;
  components: LegacyComponents;
  lawsEnacted: number;
  exitApproval: number | null;
  /** Share of the effect left now, 0..1. */
  remaining: number;
  /** Party vote-share shift still applied, percent. */
  votePct: number;
  /** Governing-party approval shift still applied, points. */
  approvalPoints: number;
}

export function buildLegacyViewRow(
  row: {
    _id: string;
    leaderName: string;
    partyId: string | null;
    startTurn: number | null;
    endTurn: number;
    reason: LegacyExitReason;
    score: number;
    components: LegacyComponents;
    inputs: { lawsEnacted: number; exitApproval: number | null };
    votePct: number;
    approvalPoints: number;
  },
  turn: number
): LeaderLegacyViewRow {
  const tier = legacyTier(row.score);
  return {
    id: row._id,
    leaderName: row.leaderName,
    partyId: row.partyId,
    startTurn: row.startTurn,
    endTurn: row.endTurn,
    reason: row.reason,
    score: row.score,
    tier,
    tierLabel: LEGACY_TIER_LABELS[tier],
    components: row.components,
    lawsEnacted: row.inputs.lawsEnacted,
    exitApproval: row.inputs.exitApproval,
    remaining: legacyDecay(turn - row.endTurn),
    votePct: Math.round(currentVotePct(row, turn) * 100) / 100,
    approvalPoints: Math.round(currentApprovalPoints(row, turn) * 100) / 100,
  };
}
