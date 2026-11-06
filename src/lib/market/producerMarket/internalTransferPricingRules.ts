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

/**
 * The site profit operating decisions read: losing marks, restart probes and
 * NPP loss counts. Once own-site deliveries are booked at market value
 * (producerCaptiveDeliveryStage >= 3), a plant whose output goes to its own
 * company is judged on its management account, so it is not read as a loss
 * for output its company would otherwise buy, and the receiving site carries
 * the matching charge. Cash, company totals, tax and distributions keep the
 * economic profit; the entries net to zero inside the company, so no money is
 * created. Below that stage this is the economic profit, unchanged.
 */
export function decisionProfit(
  result: { profit: number; internalSupplyIncome?: number; internalSupplyCharge?: number },
  managementAccounts: boolean
): number {
  if (!managementAccounts) return result.profit;
  return internalTransferAccount({
    revenue: 0,
    costs: 0,
    profit: result.profit,
    income: result.internalSupplyIncome,
    charge: result.internalSupplyCharge,
  }).profit;
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
