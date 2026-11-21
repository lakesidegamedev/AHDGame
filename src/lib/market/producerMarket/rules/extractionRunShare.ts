import type { ProducedStock, ProducerOperatingResult } from "../productionPlan";

/** Leave a replenishment probe and keep stock available for recent buyers. */
export function stockBackedExtractionRunShare(input: {
  runShare: number;
  minimumRunShare: number;
  prior: Pick<
    ProducerOperatingResult,
    "profit" | "soldUnits" | "products" | "plannedRunShare"
  > | null;
  outputStock: readonly ProducedStock[];
  allowPartialStock?: boolean;
}): number {
  const { runShare, minimumRunShare, prior, outputStock } = input;
  if (!prior || !(prior.profit < 0) || !(prior.soldUnits > 0)) return runShare;
  const products = prior.products ?? [];
  if (products.some((line) => line.internalDeliveredUnits > 0)) return runShare;

  const soldLines = products.filter((line) => line.soldUnits > 0);
  if (soldLines.length === 0) return runShare;
  const stocks = soldLines.map((line) => ({
    line,
    held: outputStock.reduce(
      (units, stock) =>
        stock.commodity === line.commodity && stock.book === line.book
          ? units + stock.units
          : units,
      0
    ),
  }));
  let cut = 0.3;
  if (!stocks.every(({ line, held }) => held >= 1.25 * line.soldUnits)) {
    const priorRun = prior.plannedRunShare ?? 0;
    if (!input.allowPartialStock || runShare <= 0.15 || !(priorRun >= 0.01)) return runShare;

    // Keep a buffer against a larger run or a line that sold from stock.
    const growth = Math.max(1, runShare / priorRun);
    const smallestCover = Math.min(
      ...stocks.map(
        ({ line, held }) => held / (growth * Math.max(line.producedUnits, line.soldUnits))
      )
    );
    cut = Math.min(0.2, smallestCover * 0.8);
    if (!(cut >= 0.08)) return runShare;
  }
  return Math.min(runShare, Math.max(minimumRunShare, runShare * (1 - cut)));
}
