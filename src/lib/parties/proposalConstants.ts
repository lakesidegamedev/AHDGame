/**
 * Tuning constants for the `CommitteeProposal` system, gathered here so
 * future tuning lands in one place.
 */

/**
 * Fraction of the eligible voter set that must vote YES for a proposal
 * to pass. "Filled roles" = chair + viceChair + treasurer + committee
 * members. Vacant slots are excluded from both numerator and denominator
 * (see `getEligibleVoterSet`). At resolution time, voters who haven't
 * cast a ballot count as NAY — i.e. abstention is opposition.
 *
 * Stored as a 0..1 fraction. 0.6 = 60% of filled roles.
 */
export const REQUIRED_YES_FRACTION = 0.6 as const;

/** Yes votes needed to pass with `committeeSize` filled voting seats. */
export function requiredYesVotes(committeeSize: number): number {
  return Math.ceil(committeeSize * REQUIRED_YES_FRACTION);
}

/**

 * Turns a `positionShift` cooldown locks the affected axis for after a
 * successful pass. Each axis (`economic | social`) tracks independently —
 * passing a `social` shift does not lock `economic`. 336 turns = roughly
 * 7 game-years per the 48 turn / year cadence — intentional slow drift on
 * ideological repositioning.
 */
export const POSITION_SHIFT_COOLDOWN_TURNS = 336 as const;

/**
 * Turns a non-positionShift proposal cooldown locks the affected type
 * for after a successful pass. Each type (`rename | merge |
 * electionMethod | electionDuration`) tracks independently. 96 turns =
 * half a game-year.
 */
export const PROPOSAL_COOLDOWN_TURNS = 96 as const;

/**
 * How long (in turns) a `pendingTreasuryTransactions` row stays open
 * before it auto-expires unresolved. 48 turns ≈ 1 in-game day at the
 * standard 48-turn-per-day cadence — fast enough to keep the queue
 * tidy without forcing immediate response. Mirrors the `expireOpen*`
 * sweep pattern used by `CommitteeProposal` expiry, but pending txns
 * resolve to `"expired"` (no execution, no balance change).
 */
export const PENDING_TXN_EXPIRY_TURNS = 48 as const;
