import type { ProducerOperatingResult } from "@/lib/market/producerMarket/productionPlan";

type ProductRow = Pick<
  ProducerOperatingResult["products"][number],
  | "commodity"
  | "producedUnits"
  | "offeredUnits"
  | "soldUnits"
  | "internalDeliveredUnits"
  | "revenue"
>;

export interface SettledProductSales {
  produced: number;
  offered: number;
  sold: number;
  ownSites: number;
  unsold: number;
  /** Anchor currency cash receipts for outside sales. */
  revenue: number;
}

export function settledProductSales(
  receipt: { turn: number; products?: readonly ProductRow[] } | null | undefined,
  currentTurn: number
): Map<string, SettledProductSales> | null {
  if (!receipt?.products || receipt.turn < currentTurn - 1 || receipt.turn > currentTurn) {
    return null;
  }
  const sales = new Map<string, SettledProductSales>();
  for (const product of receipt.products) {
    const row = sales.get(product.commodity) ?? {
      produced: 0,
      offered: 0,
      sold: 0,
      ownSites: 0,
      unsold: 0,
      revenue: 0,
    };
    row.produced += product.producedUnits;
    row.offered += product.offeredUnits;
    row.sold += product.soldUnits;
    row.ownSites += product.internalDeliveredUnits ?? 0;
    row.revenue += product.revenue;
    row.unsold = Math.max(0, row.offered - row.sold - row.ownSites);
    sales.set(product.commodity, row);
  }
  return sales;
}
