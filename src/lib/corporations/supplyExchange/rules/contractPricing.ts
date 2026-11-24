import { COMMODITY_BASE_PRICES, type CommodityType } from "@/lib/constants/commodities";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { priceRealizationFactor } from "@/lib/market/priceRealization";
import {
  SUPPLY_AGREEMENT_PRICE_BAND,
  type SupplyAgreementPriceMode,
} from "@/lib/db/types/supplyAgreement";

/** Fixed price mode: the agreed price may sit this far either side of the market price at signing. */
export const SUPPLY_AGREEMENT_FIXED_PRICE_BAND = 0.25;

/** Market price plus or minus mode: the agreed percentage of market, either side. */
export const SUPPLY_AGREEMENT_INDEXED_BAND = SUPPLY_AGREEMENT_PRICE_BAND;

/** Smallest step a fixed price is stored at. */
const FIXED_PRICE_DECIMALS = 100;

export function roundFixedPrice(price: number): number {
  return Math.round(price * FIXED_PRICE_DECIMALS) / FIXED_PRICE_DECIMALS;
}

/** Legal fixed price range for a market price at signing. */
export function fixedPriceBounds(marketPrice: number): { min: number; max: number } {
  return {
    min: roundFixedPrice(marketPrice * (1 - SUPPLY_AGREEMENT_FIXED_PRICE_BAND)),
    max: roundFixedPrice(marketPrice * (1 + SUPPLY_AGREEMENT_FIXED_PRICE_BAND)),
  };
}

/**
 * Checks the agreed price of a NEW offer against the market price now. Returns
 * a plain refusal for the player, or null when the terms are legal.
 */
export function pricingTermsError(
  terms: {
    priceMode?: SupplyAgreementPriceMode;
    fixedUnitPrice?: number;
    pricePremium?: number;
  },
  marketPrice: number | null | undefined
): string | null {
  if (terms.priceMode === "fixed") {
    const price = terms.fixedUnitPrice;
    if (typeof price !== "number" || !Number.isFinite(price) || !(price > 0)) {
      return "Enter the per-unit price you want to fix.";
    }
    if (!(typeof marketPrice === "number" && Number.isFinite(marketPrice) && marketPrice > 0)) {
      return "There is no market price for this commodity yet, so a set price cannot be agreed.";
    }
    const { min, max } = fixedPriceBounds(marketPrice);
    if (price < min - 1e-9 || price > max + 1e-9) {
      return `A set price must be within ${Math.round(SUPPLY_AGREEMENT_FIXED_PRICE_BAND * 100)}% of the market price. The market is ${marketPrice.toFixed(2)} now, so the price must be between ${min.toFixed(2)} and ${max.toFixed(2)}.`;
    }
    return null;
  }
  if (terms.priceMode === "indexed") {
    const p = terms.pricePremium;
    if (
      typeof p !== "number" ||
      !Number.isFinite(p) ||
      Math.abs(p) > SUPPLY_AGREEMENT_INDEXED_BAND + 1e-9
    ) {
      return `Market price plus or minus must be within ${Math.round(SUPPLY_AGREEMENT_INDEXED_BAND * 100)}% either way.`;
    }
    return null;
  }
  return "Choose how the price works: a set price, or market price plus or minus a percentage.";
}

/** Offset of a fixed price from the market price it was bounded against. */
export function fixedPriceOffset(fixedUnitPrice: number, marketPrice: number): number {
  return marketPrice > 0 ? Math.round((fixedUnitPrice / marketPrice - 1) * 10000) / 10000 : 0;
}

/**
 * The per-unit price a newer-mode contract trades at on one turn, and the
 * per-unit difference payment from buyer to seller (negative: seller pays).
 * Fixed: contract price P, transfer P minus market. Indexed: contract price
 * market times (1 + p), transfer market times p.
 */
export function contractUnitSettlement(args: {
  priceMode: SupplyAgreementPriceMode;
  fixedUnitPrice?: number;
  pricePremium: number;
  marketUnitPrice: number;
}): { contractUnitPrice: number; transferPerUnit: number } {
  const m = args.marketUnitPrice;
  if (args.priceMode === "fixed") {
    const p = args.fixedUnitPrice ?? 0;
    return { contractUnitPrice: p, transferPerUnit: p - m };
  }
  return { contractUnitPrice: m * (1 + args.pricePremium), transferPerUnit: m * args.pricePremium };
}

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

export interface NewModeSides {
  /** Seller nets exactly this per unit delivered. */
  sellerUnitPrice: number;
  /** What the buyer's input bill is per unit at today's market. */
  buyerBillUnitPrice: number;
  /** Per-unit transfer from buyer to seller at today's market (negative: seller pays). */
  transferPerUnit: number;
  /** Buyer's net per unit: the input bill plus the transfer. */
  buyerNetUnitPrice: number;
}

/**
 * Both sides of a fixed or indexed contract at today's market. The seller's
 * sale clears at the market price and the transfer tops it up to the contract
 * price, so the seller nets the contract price. The buyer still pays the
 * billed input price and the transfer on top.
 */
export function newModeSides(args: {
  priceMode: SupplyAgreementPriceMode;
  fixedUnitPrice?: number;
  pricePremium: number;
  marketUnitPrice: number;
  billedUnitPrice: number;
}): NewModeSides {
  const { contractUnitPrice, transferPerUnit } = contractUnitSettlement(args);
  return {
    sellerUnitPrice: contractUnitPrice,
    buyerBillUnitPrice: args.billedUnitPrice,
    transferPerUnit,
    buyerNetUnitPrice: args.billedUnitPrice + transferPerUnit,
  };
}
