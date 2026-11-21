/**
 * Why a live supply agreement delivered less than it promised, read from the
 * figures settlement stores on it. Kept free of recipe tables so the
 * agreements panel can run it in the browser.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";

/** Below this many units a delivery figure is rounding noise. */
const DELIVERY_EPSILON = 0.01;

export type AgreementDeliveryStatus =
  | { code: "buyerCannotReceive"; stateScoped: boolean }
  | { code: "supplierProducedNone" }
  | { code: "supplierProducedLess"; achievable: number; cap: number }
  | { code: "buyerUsedLess"; used: number; cap: number }
  | { code: "marketDeliveredLess"; delivered: number; cap: number };

/**
 * Why the last settlement delivered less than the contract promised, read
 * from the figures settlement stores on the agreement. Null when it delivered
 * in full or nothing has settled yet.
 */
export function agreementDeliveryStatus(args: {
  commodity: CommodityType;
  volumeCap: number;
  lastDeliveryTurn?: number;
  lastDeliveredUnits?: number;
  lastAchievableUnits?: number;
  lastBuyerConsumptionUnits?: number;
  /** "funded" when the delivery is the pair's settled funded trade. */
  lastDeliveryBasis?: "funded";
}): AgreementDeliveryStatus | null {
  if (!Number.isFinite(args.lastDeliveryTurn)) return null;
  const cap = Math.max(0, args.volumeCap);
  const delivered = Math.max(0, args.lastDeliveredUnits ?? 0);
  if (!(cap > 0) || delivered >= cap - DELIVERY_EPSILON) return null;
  const funded = args.lastDeliveryBasis === "funded";
  const used = funded ? undefined : args.lastBuyerConsumptionUnits;
  if (typeof used === "number" && used <= DELIVERY_EPSILON && delivered <= DELIVERY_EPSILON) {
    return { code: "buyerCannotReceive", stateScoped: isStateScopedCommodity(args.commodity) };
  }
  const achievable = args.lastAchievableUnits;
  if (typeof achievable === "number" && Number.isFinite(achievable)) {
    // Settlement stores achievable rounded to whole units, so a small contract
    // can read 0 while still delivering a fraction; trust the delivery then.
    if (achievable <= 0 && delivered <= DELIVERY_EPSILON) return { code: "supplierProducedNone" };
    const ceiling = typeof used === "number" ? Math.min(cap, used) : cap;
    if (achievable > 0 && achievable < ceiling - 0.5) {
      return { code: "supplierProducedLess", achievable, cap };
    }
  }
  // The funded market matches buyers and sellers on its own; the buyer
  // estimate did not limit this delivery, so it is not offered as the reason.
  if (funded) return { code: "marketDeliveredLess", delivered, cap };
  if (typeof used === "number" && used < cap - DELIVERY_EPSILON) {
    return { code: "buyerUsedLess", used, cap };
  }
  return null;
}
