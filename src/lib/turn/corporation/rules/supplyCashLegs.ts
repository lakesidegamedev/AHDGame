interface CashCurrency {
  currencyCode?: string;
  rate: number;
}

/** Independent native rounding changes the value transferred between currencies. */
export function supplyCashLegs(anchorAmount: number, supplier: CashCurrency, buyer: CashCurrency) {
  const supplierRate = supplier.currencyCode ? supplier.rate : 1;
  const buyerRate = buyer.currencyCode ? buyer.rate : 1;
  if (
    !Number.isFinite(anchorAmount) ||
    ![supplierRate, buyerRate].every((rate) => Number.isFinite(rate) && rate > 0)
  )
    throw new Error("Supply settlement currency quote is unavailable");
  const supplierLocal = anchorAmount * supplierRate,
    buyerLocal = anchorAmount * buyerRate;
  if (![supplierLocal, buyerLocal].every(Number.isFinite))
    throw new Error("Supply settlement amount exceeds the supported range");
  return { supplierLocal, buyerLocal };
}
