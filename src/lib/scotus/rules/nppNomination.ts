/**
 * Who nominates to a vacant Supreme Court seat when no player President does.
 * Plain data in, plain data out: the shell in `scotusNppNominationTurn.ts`
 * loads the documents and files the nomination.
 */

/** Turns an unconfirmed or rejected nomination blocks a re-nomination for the same seat. */
export const SCOTUS_NPP_RENOMINATION_COOLDOWN_TURNS = 48;

/**
 * Turns a vacancy waits for a player President to nominate before the
 * generated-scholar fallback files one in the President's own party.
 */
export const SCOTUS_PLAYER_NOMINATION_GRACE_TURNS = 96;

/** Last turn a player President can still nominate; null when the clock has not started. */
export function playerNominationDeadlineTurn(
  vacantSinceTurn: number | null | undefined
): number | null {
  return vacantSinceTurn == null ? null : vacantSinceTurn + SCOTUS_PLAYER_NOMINATION_GRACE_TURNS;
}

/** True once a player President has had the whole grace window and nominated no one. */
export function playerNominationGraceElapsed(
  vacantSinceTurn: number | null | undefined,
  currentTurn: number
): boolean {
  if (vacantSinceTurn == null) return false;
  return currentTurn >= vacantSinceTurn + SCOTUS_PLAYER_NOMINATION_GRACE_TURNS;
}

/** Turns into a vacancy when a player President gets the second reminder. */
export const SCOTUS_PLAYER_NOMINATION_REMINDER_TURNS = 48;

/**
 * Which reminder a player President is due for this vacancy: 1 when the seat
 * opens, 2 halfway through the grace window, null when nothing is due. Each
 * stage is sent once; the stored stage records what has gone out.
 */
export function vacancyReminderDue(
  vacantSinceTurn: number | null | undefined,
  sentStage: number | null | undefined,
  currentTurn: number
): 1 | 2 | null {
  if (vacantSinceTurn == null) return null;
  const sent = sentStage ?? 0;
  if (currentTurn >= vacantSinceTurn + SCOTUS_PLAYER_NOMINATION_REMINDER_TURNS && sent < 2)
    return 2;
  if (sent < 1) return 1;
  return null;
}

export type ScotusPresidentKind = "player" | "npp" | "vacant";

export interface ScotusPresidencySnapshot {
  kind: ScotusPresidentKind;
  party?: string;
}

export interface SenateSeatCount {
  party?: string;
  seats: number;
}

/**
 * Party the NPP-driven nomination is drawn from. A sitting NPP President picks
 * their own party; with the presidency vacant the Senate's largest party
 * stands in (ties fall to the lexically first party for determinism).
 * Returns null when a player President holds the office (the player nominates)
 * or when no party can be named.
 */
export function chooseNppNominatingParty(
  presidency: ScotusPresidencySnapshot,
  senate: readonly SenateSeatCount[]
): string | null {
  if (presidency.kind === "player") return null;
  if (presidency.kind === "npp") return presidency.party ?? null;

  const seatsByParty = new Map<string, number>();
  for (const row of senate) {
    if (!row.party) continue;
    seatsByParty.set(row.party, (seatsByParty.get(row.party) ?? 0) + Math.max(0, row.seats));
  }
  let best: string | null = null;
  let bestSeats = 0;
  for (const party of [...seatsByParty.keys()].sort()) {
    const seats = seatsByParty.get(party) ?? 0;
    if (seats > bestSeats) {
      best = party;
      bestSeats = seats;
    }
  }
  return best;
}

/** True while the seat's latest nomination is still cooling down after it closed. */
export function isRenominationCoolingDown(
  latestVotingEndsOnTurn: number | null | undefined,
  currentTurn: number
): boolean {
  if (latestVotingEndsOnTurn == null) return false;
  return currentTurn < latestVotingEndsOnTurn + SCOTUS_NPP_RENOMINATION_COOLDOWN_TURNS;
}
