/**
 * Local service markets. Visits, leases, crew-days, events and haulage sell
 * in the state where they are produced; see commodityMarketScope. Remote
 * services and physical goods can reach other countries.
 */
import { COMMODITY_TYPES, type CommodityType } from "@/lib/constants/commodities";

export type CommodityMarketScope = "reachable" | "state";

/** Software, consulting and other remotely delivered services remain reachable. */
export function commodityMarketScope(commodity: CommodityType): CommodityMarketScope {
  switch (commodity) {
    case "freight":
    case "construction_services":
    case "healthcare_services":
    case "real_estate_services":
      return "state";
    default:
      return "reachable";
  }
}

export function isStateScopedCommodity(commodity: CommodityType): boolean {
  return commodityMarketScope(commodity) === "state";
}

export const STATE_SCOPED_COMMODITIES = COMMODITY_TYPES.filter(isStateScopedCommodity);

/**
 * State-scoped services the funded market books per country: freight (owner yes,
 * 2026-10-19) and construction services (owner yes, 2026-10-30) sell anywhere
 * in their own country.
 */
export function isCountryBookCommodity(commodity: string): boolean {
  return commodity === "freight" || commodity === "construction_services";
}
