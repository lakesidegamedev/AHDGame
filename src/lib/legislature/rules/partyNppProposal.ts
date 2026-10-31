/**
 * Party chairs direct regional NPP legislation. Only the party's national chair
 * or the target region's chair may request it: see canDirectRegionalPartyNpp.
 */
export function canDirectRegionalPartyNpp(input: {
  characterId: string;
  characterPartyId: string | null;
  partyId: string;
  sameCountry: boolean;
  nationalChairId: string | null;
  regionalChairId: string | null;
}): boolean {
  return (
    input.sameCountry &&
    input.characterPartyId === input.partyId &&
    (input.characterId === input.nationalChairId || input.characterId === input.regionalChairId)
  );
}

/** Legacy individual seats omit seatsHeld; explicit zero-seat records cannot sponsor. */
export function hasPartyNppSeats(seatsHeld: number | undefined): boolean {
  return seatsHeld === undefined || seatsHeld > 0;
}
