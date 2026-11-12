/**
 * Pick the candidates to show once an election has left its primary phase.
 * Keeps up to `maxPerParty` candidates per party, highest primary score first,
 * mirroring the elimination the turn resolver performs in
 * `resolvePrimariesIfNeeded`. Doubles as a safety net for the window between
 * `primaryEndTime` and the next primary-resolution turn, when losing candidacies
 * are still `status: "active"`. `maxPerParty` MUST come from
 * `getPrimaryWinnersForElection` so display caps match resolver winners. The
 * viewer's own candidate is always kept, even below the cap.
 */
export function selectGeneralPhaseDisplayCandidates<
  T extends { id: string; party: string; primaryScore: number; isYou?: boolean },
>(enriched: T[], maxPerParty: number): T[] {
  const partyCount = new Map<string, number>();
  const selected: T[] = [];

  for (const c of [...enriched].sort((a, b) => b.primaryScore - a.primaryScore)) {
    const used = partyCount.get(c.party) ?? 0;
    if (used < maxPerParty) {
      selected.push(c);
      partyCount.set(c.party, used + 1);
    }
  }

  const mine = enriched.find((c) => c.isYou);
  if (mine && !selected.some((c) => c.id === mine.id)) {
    selected.push(mine);
  }

  return selected;
}
