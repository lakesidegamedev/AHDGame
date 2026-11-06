import type { CommodityType } from "@/lib/constants/commodities";
import { FREIGHT_CLASS_BY_COMMODITY, type FreightClass } from "@/lib/logistics/freightClass";
import type { CorporationLookups } from "./types";

/**
 * Share of a sector's output that was wanted and still could not be delivered,
 * 0 when there is no measured limit. MAX across output legs identifies the
 * output with the worst delivery constraint for telemetry. Offers themselves
 * use each commodity's independent placement cap.
 *
 * The state ratio is a figure for every seller in the state. Where the sourcing
 * pass measured the owning corporation's own slice, that is what the sector
 * shows; otherwise the state ratio. Offers and revenue placement keep reading
 * the state ratio, so this changes what a player is told, not what they earn.
 */
export function sectorDeliveryLimited(
  lookups: Pick<
    CorporationLookups,
    "stateDeliveryLimitedRatioByState" | "ownerDeliveryLimitedRatioByCorp"
  >,
  stateId: string | undefined,
  supplyRates: Partial<Record<CommodityType, number>>,
  corpId?: string
): { fraction: number; freightClass: FreightClass | null } {
  if (!stateId) return { fraction: 0, freightClass: null };
  const byCommodity = lookups.stateDeliveryLimitedRatioByState?.get(stateId);
  if (!byCommodity) return { fraction: 0, freightClass: null };
  const ownerByCommodity = corpId
    ? lookups.ownerDeliveryLimitedRatioByCorp?.get(corpId)?.get(stateId)
    : undefined;
  let ratio = 0;
  let freightClass: FreightClass | null = null;
  for (const commodity of Object.keys(supplyRates) as CommodityType[]) {
    if (!((supplyRates[commodity] ?? 0) > 0)) continue;
    const candidate = ownerByCommodity?.get(commodity) ?? byCommodity.get(commodity) ?? 0;
    if (candidate > ratio) {
      ratio = candidate;
      freightClass = FREIGHT_CLASS_BY_COMMODITY[commodity];
    }
  }
  return { fraction: Math.max(0, Math.min(1, ratio)), freightClass };
}
