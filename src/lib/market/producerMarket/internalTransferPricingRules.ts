/**
 * Internal supply prices allocate income and charges between a company's sites.
 * Free is the existing default; cost uses the production quote's break-even
 * price, and market uses the posted ask less the selected internal discount.
 */
export type InternalTransferPricing = "free" | "cost" | "market";

/** Site management accounts only; economic revenue and profit stay unchanged. */
export function internalTransferAccount(input: {
  revenue: number;
  costs: number;
  profit: number;
  income?: number;
  charge?: number;
}): { revenue: number; costs: number; profit: number } {
  const income = Number.isFinite(input.income) ? Math.max(0, input.income ?? 0) : 0;
  const charge = Number.isFinite(input.charge) ? Math.max(0, input.charge ?? 0) : 0;
  return {
    revenue: input.revenue + income,
    costs: input.costs + charge,
    profit: input.profit + income - charge,
  };
}

export function internalTransferUnitPrice(input: {
  mode?: InternalTransferPricing;
  marketPrice: number;
  unitCost: number;
  discount?: number;
}): number {
  if (input.mode == null || input.mode === "free") return 0;
  const price = input.mode === "cost" ? input.unitCost : input.marketPrice;
  if (!Number.isFinite(price) || price < 0) throw new Error("Invalid internal supply price");
  const discount = Number.isFinite(input.discount)
    ? Math.max(0, Math.min(0.2, input.discount ?? 0))
    : 0;
  return input.mode === "market" ? price * (1 - discount) : price;
}
