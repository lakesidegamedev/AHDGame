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
 * Services that trade on one book per country in the funded market: freight
 * and construction crews travel anywhere inside their own country, even though
 * contracts for them still name a state.
 */
export function isCountryBookCommodity(commodity: CommodityType): boolean {
  return commodity === "freight" || commodity === "construction_services";
}
