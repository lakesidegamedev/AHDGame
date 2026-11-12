/** Price established opening debt independently of the rate on new borrowing. */
export function openingStockCoupon(input: {
  countryId: string;
  fiscalYear: number;
  averageRate?: number;
  annualInterest?: number;
  uncoveredPrincipal: number;
  coveredCoupons: number;
}): number | null {
  if (input.countryId === "US" && input.fiscalYear === 2027) {
    const remainingInterest = (input.annualInterest ?? NaN) - input.coveredCoupons;
    if (
      !Number.isFinite(remainingInterest) ||
      remainingInterest < 0 ||
      !Number.isFinite(input.uncoveredPrincipal) ||
      input.uncoveredPrincipal <= 0
    )
      throw new Error("Invalid US 2027 opening debt-service obligation");
    return (remainingInterest / input.uncoveredPrincipal) * 100;
  }
  if (
    input.fiscalYear === 1991 &&
    typeof input.averageRate === "number" &&
    Number.isFinite(input.averageRate) &&
    input.averageRate >= 0
  )
    return input.averageRate * 100;
  return null;
}
