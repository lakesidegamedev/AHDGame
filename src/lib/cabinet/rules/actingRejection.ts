/**
 * Senate rejection bars an acting appointment only within the current presidency.
 * Re-election starts a fresh window; an office conflict does not count as a vote defeat.
 */
export function actingRejectionScope(presidencyStartedAt: Date | null) {
  return {
    // Older rejections have no reason. Preserve their Senate-defeat treatment.
    rejectionReason: { $ne: "incompatible_bank_office" as const },
    // A legacy presidency with no start date remains scoped to its President.
    ...(presidencyStartedAt ? { proposedAt: { $gte: presidencyStartedAt } } : {}),
  };
}
