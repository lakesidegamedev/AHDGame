export interface CorporateLiabilityParts {
  bonds: number;
  loans: number;
  arrears: number;
  imf: number;
}

/** Funded producer invoices are already denominated in anchor units. */
export function producerPayablesAnchor(claims?: readonly { amount: number }[]): number {
  return (claims ?? []).reduce(
    (sum, claim) => sum + (Number.isFinite(claim.amount) ? Math.max(0, claim.amount) : 0),
    0
  );
}

/** Every balance-sheet surface includes the same four classes of obligation. */
export function corporateLiabilityTotal(parts: CorporateLiabilityParts): number {
  return Object.values(parts).reduce((sum, amount) => sum + Math.max(0, amount), 0);
}
