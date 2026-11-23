import { isUserActive } from "@/lib/players/playerActivity";

export interface PartyPlayerUser {
  isBanned?: boolean;
  lastActivity?: Date;
  createdAt?: Date;
}

/** A character counts toward a party's player roster when its user is not banned and still active. */
export function isDisplayedPartyPlayer(user: PartyPlayerUser | undefined, now: Date): boolean {
  if (!user || user.isBanned === true) return false;
  return isUserActive(user.lastActivity, user.createdAt, now);
}

/** Players per party id, counting only displayed (unbanned, active) members. */
export function countDisplayedPartyPlayers(
  characters: ReadonlyArray<{ party?: string | null; userId: { toString(): string } }>,
  usersById: ReadonlyMap<string, PartyPlayerUser>,
  now: Date
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const char of characters) {
    if (!char.party) continue;
    if (!isDisplayedPartyPlayer(usersById.get(char.userId.toString()), now)) continue;
    counts.set(char.party, (counts.get(char.party) ?? 0) + 1);
  }
  return counts;
}
