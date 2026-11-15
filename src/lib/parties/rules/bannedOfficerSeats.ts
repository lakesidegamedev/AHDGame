/**
 * Officer seats held by a banned account are vacant for every purpose: they do
 * not count toward quorum or the payout allowance, they sign nothing, and the
 * party may fill them. Plain data in, plain data out.
 */

export interface OfficerSeatIds<Id> {
  chairId?: Id | null;
  viceChairId?: Id | null;
  treasurerId?: Id | null;
}

export const OFFICER_SEAT_FIELDS = ["chairId", "viceChairId", "treasurerId"] as const;

/** The seat ids that are filled and not held by a banned character. */
export function seatedOfficerIds(
  seats: OfficerSeatIds<{ toString(): string }>,
  bannedCharacterIds: ReadonlySet<string>
): string[] {
  const ids = new Set<string>();
  for (const field of OFFICER_SEAT_FIELDS) {
    const id = seats[field]?.toString();
    if (id && !bannedCharacterIds.has(id)) ids.add(id);
  }
  return [...ids];
}
