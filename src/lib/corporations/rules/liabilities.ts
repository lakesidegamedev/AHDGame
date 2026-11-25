export interface CorporateLiabilityParts {
  bonds: number;
  loans: number;
  arrears: number;
  imf: number;
}

/** Every balance-sheet surface includes the same four classes of obligation. */
export function corporateLiabilityTotal(parts: CorporateLiabilityParts): number {
  return Object.values(parts).reduce((sum, amount) => sum + Math.max(0, amount), 0);
}
