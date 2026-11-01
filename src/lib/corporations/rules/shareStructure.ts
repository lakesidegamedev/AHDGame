/** Active placements carry prices and share counts in the current share units. */
export function shareStructureEligibility(corp: {
  countryOwnerId?: unknown;
  isNationalized?: boolean;
  totalShares?: number;
  pendingShareIssuance?: { remainingShares: number };
}): { ok: true } | { ok: false; reason: string } {
  if (corp.countryOwnerId != null || corp.isNationalized)
    return { ok: false, reason: "State-owned corporations cannot change share structure." };
  if (!Number.isFinite(corp.totalShares) || !(corp.totalShares! > 0))
    return { ok: false, reason: "Invalid outstanding share count." };
  if ((corp.pendingShareIssuance?.remainingShares ?? 0) > 0)
    return {
      ok: false,
      reason: "Complete the pending share issuance before changing share structure.",
    };
  return { ok: true };
}
