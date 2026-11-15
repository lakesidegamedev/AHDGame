/** Seeded default parties retain their names and abbreviations across gameplay. */
export function canRenameParty(party: { isDefault?: boolean }): boolean {
  return party.isDefault !== true;
}

export const DEFAULT_PARTY_RENAME_ERROR =
  "Default parties cannot change their name or abbreviation.";
