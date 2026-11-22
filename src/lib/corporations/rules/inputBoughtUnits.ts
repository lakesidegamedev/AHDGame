import { COMMODITY_BASE_PRICES, type CommodityType } from "@/lib/constants/commodities";
import { priceRealizationFactor } from "@/lib/market/priceRealization";

/**
 * Unit price the settlement bills for an input: base price through the damped
 * realization of the global price ratio. Every screen that prices inputs reads
 * this one function.
 */
export function billedInputUnitPrice(
  commodity: CommodityType,
  globalPrice: number | null | undefined
): number {
  const base = COMMODITY_BASE_PRICES[commodity];
  const ratio =
    typeof globalPrice === "number" && globalPrice > 0 && base > 0 ? globalPrice / base : 1;
  return Math.round(base * priceRealizationFactor(ratio) * 100) / 100;
}

export interface InputNameplateRow {
  /** Units a day the plant would buy running flat out. */
  units: number;
  /** Billed unit price in the same money as the booked bill. */
  price: number;
}

/**
 * Share of the nameplate input quantities the plant actually bought: the
 * booked input bill over the nameplate bill at billed prices. 1 when no bill
 * was booked yet, so the nameplate stands in until a turn has settled.
 */
export function inputBoughtScale(
  bookedInputsPerDay: number | null | undefined,
  rows: readonly InputNameplateRow[]
): number {
  const nameplateBill = rows.reduce((sum, r) => sum + (r.units > 0 ? r.units * r.price : 0), 0);
  return typeof bookedInputsPerDay === "number" && bookedInputsPerDay > 0 && nameplateBill > 0
    ? bookedInputsPerDay / nameplateBill
    : 1;
}

/**
 * Units a day of each input a plant bought last turn. The sector page and the
 * company Commodities tab both show this, so the two cannot drift.
 */
export function inputBoughtUnitsPerDay(args: {
  revenueAnchor: number;
  demandRates: Partial<Record<CommodityType, number>>;
  bookedInputsPerDay: number | null | undefined;
  globalPriceOf: (commodity: CommodityType) => number | null | undefined;
}): Map<CommodityType, number> {
  const rows = (Object.entries(args.demandRates) as [CommodityType, number][])
    .filter(([commodity, rate]) => rate > 0 && COMMODITY_BASE_PRICES[commodity] > 0)
    .map(([commodity, rate]) => ({
      commodity,
      units: (args.revenueAnchor * rate) / COMMODITY_BASE_PRICES[commodity],
      price: billedInputUnitPrice(commodity, args.globalPriceOf(commodity)),
    }));
  const scale = inputBoughtScale(args.bookedInputsPerDay, rows);
  return new Map(rows.map((r) => [r.commodity, r.units * scale]));
}
