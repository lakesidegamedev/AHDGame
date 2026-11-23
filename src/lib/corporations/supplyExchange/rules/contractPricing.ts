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
  /** Money moved per day (24 turns) at the full cap. */
  valuePerDay: number;
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
    valuePerDay: Math.max(0, args.volumeCapPerDay) * unitPrice,
    valueOverTerm: term === null ? null : valuePerTurn * term,
  };
}

export interface ContractSides {
  /** Per unit, what a buyer pays on the open market: the billed input price. */
  buyerMarketUnitPrice: number;
  /** Per unit, what a buyer pays under the contract: the billed price plus the premium. */
  buyerContractUnitPrice: number;
  /** Per unit, what a seller realises selling on the open market. */
  sellerMarketUnitPrice: number;
  /** Per unit, what a seller ends up with: the market sale plus the premium side payment. */
  sellerContractUnitPrice: number;
}

/**
 * Both sides of one contract against the open market. The contract does not
 * replace the market sale: the supplier's units still clear at the market
 * price, and the buyer's input bill is still the billed input price. Only the
 * premium, a percentage of the billed input price, moves between the two.
 */
export function contractSides(args: {
  referenceUnitPrice: number;
  marketUnitPrice?: number | null;
  pricePremium: number;
}): ContractSides {
  const premiumPerUnit = args.referenceUnitPrice * args.pricePremium;
  const sellerMarket =
    typeof args.marketUnitPrice === "number" &&
    Number.isFinite(args.marketUnitPrice) &&
    args.marketUnitPrice > 0
      ? args.marketUnitPrice
      : args.referenceUnitPrice;
  return {
    buyerMarketUnitPrice: args.referenceUnitPrice,
    buyerContractUnitPrice: args.referenceUnitPrice + premiumPerUnit,
    sellerMarketUnitPrice: sellerMarket,
    sellerContractUnitPrice: sellerMarket + premiumPerUnit,
  };
}
