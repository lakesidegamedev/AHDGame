interface RankableHolder {
  shares: number;
  name: string;
  characterId?: string;
  corporationId?: string;
}

/**
 * Largest holder first. Equal holdings fall back to name then id so the same
 * data always ranks, and therefore names, in the same order.
 */
export function compareHoldersByShares(a: RankableHolder, b: RankableHolder): number {
  if (b.shares !== a.shares) return b.shares - a.shares;
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  const idA = a.characterId ?? a.corporationId ?? "";
  const idB = b.characterId ?? b.corporationId ?? "";
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}
