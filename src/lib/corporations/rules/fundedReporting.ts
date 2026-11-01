/**
 * Funded sector reporting uses settled sales and booked profit. Unsold output
 * cost is a memo, not income, and own-site deliveries are not market sales:
 * see fundedSalesTelemetry and readFundedPnl.
 */
export interface FundedSalesReceipt {
  producedUnits: number;
  soldUnits: number;
  offeredUnits?: number;
  products?: readonly {
    commodity: string;
    offeredUnits: number;
    soldUnits: number;
    revenue: number;
  }[];
}

export function fundedSalesTelemetry(receipt: FundedSalesReceipt) {
  const fraction = (sold: number, offered: number) =>
    offered > 0 ? Math.max(0, Math.min(1, sold / offered)) : 1;
  const products = receipt.products ?? [];
  const revenue = products.reduce((sum, p) => sum + p.revenue, 0);
  return {
    soldFraction: fraction(receipt.soldUnits, receipt.offeredUnits ?? receipt.producedUnits),
    soldByCommodity: Object.fromEntries(
      products.map((p) => [p.commodity, fraction(p.soldUnits, p.offeredUnits)])
    ),
    revenueShareByCommodity: Object.fromEntries(
      products.map((p) => [p.commodity, revenue > 0 ? p.revenue / revenue : 0])
    ),
  };
}

export function readFundedPnl(
  pnl:
    | {
        source?: string;
        totalCost?: number;
        profit?: number;
      }
    | null
    | undefined
) {
  if (pnl?.source !== "funded") return null;
  const { totalCost, profit } = pnl;
  if (
    typeof totalCost !== "number" ||
    !Number.isFinite(totalCost) ||
    typeof profit !== "number" ||
    !Number.isFinite(profit)
  )
    return null;
  return { totalCost, profit };
}
