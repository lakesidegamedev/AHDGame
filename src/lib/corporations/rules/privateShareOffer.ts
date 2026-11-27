/** Frozen offers must describe a finite, positive and internally consistent purchase. */
export function validPrivateShareOffer(offer: {
  shares: number;
  pricePerShare: number;
  totalCost: number;
}): boolean {
  return (
    Number.isSafeInteger(offer.shares) &&
    offer.shares > 0 &&
    Number.isFinite(offer.totalCost) &&
    offer.totalCost > 0 &&
    Number.isFinite(offer.pricePerShare) &&
    offer.pricePerShare > 0 &&
    Math.abs(offer.shares * offer.pricePerShare - offer.totalCost) <= 0.000001
  );
}
