/** An unfilled party chair can be represented by its largest seated live NPC bloc. */
export function selectNppOppositionLeader(input: {
  members: readonly { nppId: string; party: string; seats: number }[];
  seatsByParty: Readonly<Record<string, number>>;
  eligiblePartyIds: ReadonlySet<string>;
  liveNppIds: ReadonlySet<string>;
  competingLeaderSeats: number;
}): { nppId: string; party: string } | null {
  const candidates = input.members.filter(
    (member) => input.eligiblePartyIds.has(member.party) && input.liveNppIds.has(member.nppId)
  );
  candidates.sort(
    (a, b) =>
      (input.seatsByParty[b.party] ?? 0) - (input.seatsByParty[a.party] ?? 0) ||
      b.seats - a.seats ||
      a.nppId.localeCompare(b.nppId)
  );
  const leader = candidates[0];
  return leader && (input.seatsByParty[leader.party] ?? 0) > input.competingLeaderSeats
    ? { nppId: leader.nppId, party: leader.party }
    : null;
}
