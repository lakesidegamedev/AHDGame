/**
 * Household purchase specs for each funded household wallet (owner decision
 * 2026-10-18: households spend what they actually receive).
 *
 * One spec per wallet: the shared consumer basket, each product on its book
 * (local services on the wallet's own state book, everything else on the world
 * book) and a ceiling price from this turn's reference. The market pays wages
 * into the wallet first, then fills these orders from its cash.
 * Pure: plain data and a price lookup in, specs out.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { HOUSEHOLD_CONSUMER_BASKET, type householdPurchaseOrders } from "./householdRules";
import { householdSpendFraction } from "@/lib/market/rules/demandCurve";

/** Share of a household wallet spent each turn. The rest carries as savings. Tunable. */
const HOUSEHOLD_SPEND_FRACTION = 0.9;

export type HouseholdSpec = Omit<Parameters<typeof householdPurchaseOrders>[0], "cash">;

export function householdDemandSpecs(input: {
  wallets: readonly { accountId: string; stateId: string }[];
  /** This turn's reference unit price for a commodity as seen from a state, or null if unpriced. */
  referencePrice: (commodity: CommodityType, stateId: string) => number | null;
  /** Ceiling over the reference a household will pay. */
  priceHeadroom: number;
  spendFraction?: number;
  /**
   * Demand curves (issue #5448). Absent: one order per good. Present: each
   * wallet gets a price ladder, with basket weights shifted by its state's
   * income index (missing states read as 1).
   */
  demandCurve?: {
    incomeIndexByState: ReadonlyMap<string, number>;
    /** Prime rate in percent by wallet state; households save more when money is dear. */
    primeRatePctByState?: ReadonlyMap<string, number>;
  };
}): HouseholdSpec[] {
  if (!Number.isFinite(input.priceHeadroom) || input.priceHeadroom < 1)
    throw new Error("Invalid household price headroom");
  const spendFraction = input.spendFraction ?? HOUSEHOLD_SPEND_FRACTION;
  const seen = new Set<string>();
  const specs: HouseholdSpec[] = [];
  for (const w of [...input.wallets].sort((a, b) => (a.accountId < b.accountId ? -1 : 1))) {
    if (seen.has(w.accountId)) continue;
    seen.add(w.accountId);
    const products: HouseholdSpec["products"][number][] = [];
    for (const [commodity, weight] of Object.entries(HOUSEHOLD_CONSUMER_BASKET) as [
      CommodityType,
      number,
    ][]) {
      const price = input.referencePrice(commodity, w.stateId);
      if (price == null || !Number.isFinite(price) || price <= 0 || !(weight > 0)) continue;
      products.push({
        commodity,
        book: isStateScopedCommodity(commodity) ? `state:${w.stateId}` : "world",
        maximumUnitPrice: price * input.priceHeadroom,
        weight,
      });
    }
    specs.push({
      accountId: w.accountId,
      spendFraction: input.demandCurve
        ? householdSpendFraction(
            spendFraction,
            input.demandCurve.primeRatePctByState?.get(w.stateId)
          )
        : spendFraction,
      products,
      stateId: w.stateId,
      ...(input.demandCurve
        ? {
            demandCurve: {
              incomeIndex: input.demandCurve.incomeIndexByState.get(w.stateId) ?? 1,
            },
          }
        : {}),
    });
  }
  return specs;
}
