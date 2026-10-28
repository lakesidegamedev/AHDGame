/**
 * Cabinet and central bank independence. Current cabinet members cannot become
 * central bank chairs or US Fed governors; leaving office restores eligibility.
 * See incompatibleBankHolders for the bank offices that exclude cabinet service.
 */
/** A chair is independent in every country; all US Fed Board seats are too. */
export function requiresCabinetIndependence(bankCountryId: string, isChair: boolean): boolean {
  return bankCountryId === "US" || isChair;
}

export function incompatibleBankHolders(
  banks: readonly {
    countryId: string;
    chairCharacterId: string | null;
    fomcBoard?: readonly { occupantType: string; characterId: string | null }[];
  }[]
): Set<string> {
  const ids = new Set<string>();
  for (const bank of banks) {
    if (bank.chairCharacterId) ids.add(bank.chairCharacterId);
    if (bank.countryId === "US") {
      for (const seat of bank.fomcBoard ?? []) {
        if (seat.occupantType === "player" && seat.characterId) ids.add(seat.characterId);
      }
    }
  }
  return ids;
}
