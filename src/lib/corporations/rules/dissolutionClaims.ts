import type { Corporation } from "@/lib/db/types";

/** A wind-down cannot distribute property that still backs another claim. */
export function dissolutionClaimBlock(corporation: Corporation): string | null {
  const positive = (value: number | undefined) =>
    value !== undefined && (!Number.isFinite(value) || value > 0);
  if (corporation.producerPayables?.claims.some((claim) => positive(claim.amount)))
    return "Settle supplier payables before dissolving this corporation.";
  if (Object.values(corporation.operatingCashArrearsByCurrency ?? {}).some(positive))
    return "Settle operating arrears before dissolving this corporation.";
  if (Object.values(corporation.federalTaxArrearsAnchorByCountry ?? {}).some(positive))
    return "Settle tax arrears before dissolving this corporation.";
  if (Object.keys(corporation.pendingCompensationRecoveries ?? {}).length)
    return "Finish compensation settlements before dissolving this corporation.";
  if (positive(corporation.pendingOperatingCash))
    return "Finish the pending operating settlement before dissolving this corporation.";
  return null;
}
