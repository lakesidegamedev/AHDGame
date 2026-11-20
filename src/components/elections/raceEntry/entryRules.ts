/**
 * Who may enter or withdraw from a race. Shared by the election page and
 * Campaign Manager so both offer the same buttons. Plain data in, plain data out.
 */

export interface EntryRuleRace {
  inPrimary: boolean;
  isEnded: boolean;
  myCharId: string | null;
  /** The viewer withdrew from this race and may not re-enter. */
  viewerWithdrew?: boolean;
}

/** Entry is open during the primary to a character not already in the race. */
export function raceEntryBlock(e: EntryRuleRace, amInRace: boolean) {
  if (e.isEnded) return "raceEnded";
  if (amInRace) return "alreadyEntered";
  if (e.viewerWithdrew) return "alreadyWithdrew";
  if (!e.inPrimary) return "nominationsUnavailable";
  if (e.myCharId === null) return "characterRequired";
  return null;
}

export function canEnter(e: EntryRuleRace, amInRace: boolean): boolean {
  return raceEntryBlock(e, amInRace) === null;
}

export function canWithdraw(e: EntryRuleRace, amInRace: boolean): boolean {
  return amInRace && !e.isEnded;
}
