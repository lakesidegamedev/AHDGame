export function planCaOpeningGovernment(
  members: readonly { id: string; nppId?: string; party?: string; seats: number }[]
) {
  if (
    !members.length ||
    members.some(
      (member) =>
        !member.nppId || !member.party || !Number.isInteger(member.seats) || member.seats <= 0
    )
  )
    return null;
  const seatsByParty: Record<string, number> = {};
  for (const member of members)
    seatsByParty[member.party!] = (seatsByParty[member.party!] ?? 0) + member.seats;
  const totalSeats = Object.values(seatsByParty).reduce((sum, seats) => sum + seats, 0);
  if (totalSeats !== 343) return null;
  const majorityThreshold = Math.floor(totalSeats / 2) + 1;
  const governingPartyId = Object.keys(seatsByParty).sort(
    (a, b) => seatsByParty[b] - seatsByParty[a] || a.localeCompare(b)
  )[0];
  const leader = members
    .filter((member) => member.party === governingPartyId)
    .sort((a, b) => b.seats - a.seats || a.id.localeCompare(b.id))[0];
  return {
    leaderNppId: leader.nppId!,
    governingPartyId,
    seatsByParty,
    totalSeats,
    majorityThreshold,
    totalSeatsSupporting: seatsByParty[governingPartyId],
    formationType:
      seatsByParty[governingPartyId] >= majorityThreshold
        ? ("majority" as const)
        : ("minority" as const),
  };
}
