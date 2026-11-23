/**
 * Government commodity demand. GOVERNMENT_COMMODITY_DEMAND maps budget lines
 * to buyers and marks which buyers also affect regional market books.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import {
  GOVT_DEFENSE_ORDNANCE_DEMAND_RATE,
  GOVT_HEALTHCARE_DEMAND_RATE,
  STATE_MEDIA_DEMAND_RATE,
} from "@/lib/constants/commodities";

export const GOVERNMENT_COMMODITY_DEMAND: ReadonlyArray<{
  category: string;
  commodity: CommodityType;
  /** Whole-economy conversion of budget money to demand units (legacy engine). */
  rate: number;
  /**
   * Share of the budget line that buys this good from the plant economy's slice
   * of the country (funded market). The line is already scaled to the plant
   * economy, so this is the line's own purchase fraction, not a scale factor.
   */
  plantSliceFraction: number;
  plannedOnly?: boolean;
  regional?: boolean;
}> = [
  {
    category: "healthcare",
    commodity: "healthcare_services",
    rate: GOVT_HEALTHCARE_DEMAND_RATE,
    plantSliceFraction: 1,
    regional: true,
  },
  {
    category: "defense",
    commodity: "ordnance",
    rate: GOVT_DEFENSE_ORDNANCE_DEMAND_RATE,
    plantSliceFraction: 1,
    regional: true,
  },
  {
    category: "education",
    commodity: "advertising",
    rate: STATE_MEDIA_DEMAND_RATE,
    plantSliceFraction: STATE_MEDIA_DEMAND_RATE,
    plannedOnly: true,
  },
];

/** True when any government budget line buys this good. */
export function governmentBuysCommodity(commodity: string): boolean {
  return GOVERNMENT_COMMODITY_DEMAND.some((line) => line.commodity === commodity);
}

/**
 * The goods governments buy, in table order, each with whether only planned
 * economies buy it. Labels come from the caller so this stays plain data.
 */
export function governmentBoughtGoods(): { commodity: CommodityType; plannedOnly: boolean }[] {
  return GOVERNMENT_COMMODITY_DEMAND.map((line) => ({
    commodity: line.commodity,
    plannedOnly: line.plannedOnly === true,
  }));
}
