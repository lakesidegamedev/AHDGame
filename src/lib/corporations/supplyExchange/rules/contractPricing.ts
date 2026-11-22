import { COMMODITY_BASE_PRICES, type CommodityType } from "@/lib/constants/commodities";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { priceRealizationFactor } from "@/lib/market/priceRealization";

/**
 * The per-unit price a contract percentage is applied to: the commodity base
 * price through the same damped, clamped realization factor the turn settles
 * contracts and input bills at. This is not the price board figure.
 */
export function contractReferenceUnitPrice(
  commodity: CommodityType,
  globalPrice: number | null | undefined
): number {
  const base = COMMODITY_BASE_PRICES[commodity] ?? 0;
  if (!(base > 0)) return typeof globalPrice === "number" && globalPrice > 0 ? globalPrice : 0;
  const ratio =
    typeof globalPrice === "number" && Number.isFinite(globalPrice) && globalPrice > 0 && base > 0
      ? globalPrice / base
      : 1;
  return base * priceRealizationFactor(ratio);
}

export interface ContractMoney {
  /** Reference price the percentage is applied to, per unit. */
  referenceUnitPrice: number;
  /** Price per unit after the percentage. */
  unitPrice: number;
  /** Units delivered per turn at the full cap. */
  unitsPerTurn: number;
  /** Money moved per turn at the full cap. */
  valuePerTurn: number;
  /** Money over the whole fixed term at the full cap, null when open ended. */
  valueOverTerm: number | null;
}

/**
 * Money terms of a contract. The volume cap is a daily figure but contracts
 * settle every turn, so one turn moves 1/TURNS_PER_DAY of the cap.
 */
export function contractMoney(args: {
  volumeCapPerDay: number;
  pricePremium: number;
  referenceUnitPrice: number;
  durationTurns?: number | null;
}): ContractMoney {
  const unitPrice = args.referenceUnitPrice * (1 + args.pricePremium);
  const unitsPerTurn = args.volumeCapPerDay / TURNS_PER_DAY;
  const valuePerTurn = unitsPerTurn * unitPrice;
  const term =
    typeof args.durationTurns === "number" && args.durationTurns > 0 ? args.durationTurns : null;
  return {
    referenceUnitPrice: args.referenceUnitPrice,
    unitPrice,
    unitsPerTurn,
    valuePerTurn,
    valueOverTerm: term === null ? null : valuePerTurn * term,
  };
}
