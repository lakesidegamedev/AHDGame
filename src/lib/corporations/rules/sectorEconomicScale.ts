import type { CorporationType } from "@/lib/constants/corporations";
import { revenuePerCapacityUnitForStrategy } from "@/lib/constants/capacityEconomy";

/** Both observed revenue and the plant-capacity floor are in host currency. */
export function sectorEconomicScale(
  sector: {
    sectorType: CorporationType;
    revenue?: number | null;
    capitalStock?: number | null;
    strategyId?: string | null;
  },
  plantsEnabled: boolean,
  unitScale: number,
  hostLocalPerAnchor: number
): number {
  if (!(hostLocalPerAnchor > 0) || !Number.isFinite(hostLocalPerAnchor))
    throw new Error("Invalid sector host currency rate");
  const revenue =
    typeof sector.revenue === "number" && Number.isFinite(sector.revenue)
      ? Math.max(0, sector.revenue)
      : 0;
  if (!plantsEnabled) return revenue;
  const stock =
    typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
      ? Math.max(0, sector.capitalStock)
      : 0;
  if (!(stock > 0)) return revenue;
  const nameplate =
    stock *
    revenuePerCapacityUnitForStrategy(sector.sectorType, sector.strategyId, unitScale) *
    hostLocalPerAnchor;
  return Number.isFinite(nameplate) ? Math.max(revenue, nameplate) : revenue;
}
