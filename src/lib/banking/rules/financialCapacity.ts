import type { CorporateSector } from "@/lib/db/types";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import { defaultSupplyRates } from "@/lib/constants/capacityEconomy";
import { impliedOutputUnits } from "@/lib/market/capital";
import { getStrategy } from "@/lib/constants/sectorStrategies";

/** Explicit capacity, including zero, is authoritative; only legacy absence uses revenue. */
export function financialSectorCapacityUnits(
  sector: Pick<CorporateSector, "capitalStock" | "revenue" | "strategyId" | "sectorType">,
  eraUnitScale: number
): number {
  const stock = sector.capitalStock;
  if (stock !== undefined) {
    return typeof stock === "number" && Number.isFinite(stock) ? Math.max(0, stock) : 0;
  }
  const revenue =
    typeof sector.revenue === "number" && Number.isFinite(sector.revenue)
      ? Math.max(0, sector.revenue)
      : 0;
  if (!(revenue > 0)) return 0;
  const strategy = getStrategy("financial", sector.strategyId ?? "standard");
  const supply = strategy?.supply ?? defaultSupplyRates("financial");
  return impliedOutputUnits(revenue, supply, COMMODITY_BASE_PRICES, eraUnitScale);
}
