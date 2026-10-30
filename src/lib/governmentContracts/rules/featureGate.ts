/** Missing configuration preserves the existing government-contract feature. */
export function governmentContractsEnabled(
  config?: { governmentContractsEnabled?: boolean } | null
): boolean {
  return config?.governmentContractsEnabled !== false;
}

export const GOVERNMENT_CONTRACTS_DISABLED_MESSAGE =
  "Government contracts are temporarily disabled. New tenders, bids and awards are paused. Existing signed contracts continue, and pending tenders and bids can still be canceled or withdrawn.";
