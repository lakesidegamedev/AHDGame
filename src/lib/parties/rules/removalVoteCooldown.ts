/**
 * When a committee vote to remove an office holder may be opened. A holder is
 * protected for a fixed number of turns after taking the seat, and again after
 * a removal vote against them fails, so a committee cannot unseat someone
 * before they have served, or retry the same removal turn after turn.
 */

export const REMOVAL_VOTE_COOLDOWN_TURNS = 24;

export type RemovalLockReason = "recently_seated" | "recent_failed_removal";

export interface RemovalCooldownInput {
  currentTurn: number;
  /** Turn the holder was elected or appointed to this seat, when known. */
  seatedTurn: number | null;
  /** Turn the latest failed or expired removal vote against the holder closed. */
  lastFailedRemovalTurn: number | null;
}

export interface RemovalCooldown {
  locked: boolean;
  reason: RemovalLockReason | null;
  /** Turn the event behind the lock happened. */
  sinceTurn: number | null;
  /** First turn a removal vote may be opened; null when not locked. */
  unlocksAtTurn: number | null;
}

const OPEN: RemovalCooldown = { locked: false, reason: null, sinceTurn: null, unlocksAtTurn: null };

export function removalVoteCooldown(input: RemovalCooldownInput): RemovalCooldown {
  const candidates: Array<{ reason: RemovalLockReason; sinceTurn: number }> = [];
  if (input.seatedTurn != null) {
    candidates.push({ reason: "recently_seated", sinceTurn: input.seatedTurn });
  }
  if (input.lastFailedRemovalTurn != null) {
    candidates.push({ reason: "recent_failed_removal", sinceTurn: input.lastFailedRemovalTurn });
  }
  let latest: RemovalCooldown = OPEN;
  for (const { reason, sinceTurn } of candidates) {
    const unlocksAtTurn = sinceTurn + REMOVAL_VOTE_COOLDOWN_TURNS;
    if (input.currentTurn >= unlocksAtTurn) continue;
    if (latest.unlocksAtTurn == null || unlocksAtTurn > latest.unlocksAtTurn) {
      latest = { locked: true, reason, sinceTurn, unlocksAtTurn };
    }
  }
  return latest;
}

/** One plain sentence explaining a lock, for the proposal form and API errors. */
export function removalCooldownMessage(lock: RemovalCooldown, roleLabel: string): string {
  if (!lock.locked || lock.unlocksAtTurn == null) return "";
  const since =
    lock.reason === "recent_failed_removal"
      ? `A vote to remove them failed or expired at turn ${lock.sinceTurn}.`
      : `They took the ${roleLabel} seat at turn ${lock.sinceTurn}.`;
  return (
    `${since} A new removal vote can be opened from turn ${lock.unlocksAtTurn} ` +
    `(${REMOVAL_VOTE_COOLDOWN_TURNS} turns later).`
  );
}
