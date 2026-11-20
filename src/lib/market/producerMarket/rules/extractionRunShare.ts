import type { ProducedStock, ProducerOperatingResult } from "../productionPlan";

/** Leave a replenishment probe and keep stock available for recent buyers. */
export function stockBackedExtractionRunShare(input: {
  runShare: number;
  minimumRunShare: number;
  prior: Pick<ProducerOperatingResult, "profit" | "soldUnits" | "products"> | null;
  outputStock: readonly ProducedStock[];
}): number {
  const { runShare, minimumRunShare, prior, outputStock } = input;
  if (!prior || !(prior.profit < 0) || !(prior.soldUnits > 0)) return runShare;
  const products = prior.products ?? [];
  if (products.some((line) => line.internalDeliveredUnits > 0)) return runShare;

  const soldLines = products.filter((line) => line.soldUnits > 0);
  const coversRecentOrders =
    soldLines.length > 0 &&
    soldLines.every((line) => {
      const held = outputStock.reduce(
        (units, stock) =>
          stock.commodity === line.commodity && stock.book === line.book
            ? units + stock.units
            : units,
        0
      );
      return held >= 1.25 * line.soldUnits;
    });
  if (!coversRecentOrders) return runShare;
  return Math.min(runShare, Math.max(minimumRunShare, runShare * 0.7));
}
