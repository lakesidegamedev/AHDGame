/**
 * Purchase conversion includes the source monetary authority's spread policy.
 * purchaseConversionSpend covers rounding losses without exceeding the wallet;
 * fixed euro settlement charges no spread.
 */
import {
  MARKET_MAKER_SPREAD,
  clampForexSpreadStrength,
  type CurrencyCode,
} from "@/lib/constants/currencies";
import {
  euroLedgerSpendForTarget,
  euroLedgerCrossRate,
  type EuroMonetaryUnion,
} from "../euro/rules";

export function purchaseConversionRequired(
  target: number,
  crossRate: number,
  fixedSettlement: boolean,
  spreadStrength?: number
): number {
  return fixedSettlement
    ? euroLedgerSpendForTarget(target, crossRate)
    : target / ((1 - MARKET_MAKER_SPREAD * clampForexSpreadStrength(spreadStrength)) * crossRate);
}

export function purchaseConversionSpend(
  target: number,
  crossRate: number,
  balance: number,
  fixedSettlement: boolean,
  spreadStrength?: number
): number {
  if (!Number.isFinite(crossRate) || crossRate <= 0) return Math.max(0, balance);
  const required = purchaseConversionRequired(target, crossRate, fixedSettlement, spreadStrength);
  const buffer = fixedSettlement ? 0 : Math.max(1, Math.ceil(1 / crossRate));
  return Math.min(balance, required + buffer);
}

/**
 * What the market maker actually credits for `spend`: the fee rounds to whole
 * source units, the output rounds to whole target units (floors under fixed
 * euro settlement, which charges no fee).
 */
export function purchaseConversionDelivered(
  spend: number,
  crossRate: number,
  fixedSettlement: boolean,
  spreadStrength?: number
): number {
  if (fixedSettlement) return Math.floor(spend * crossRate);
  const fee = Math.round(spend * MARKET_MAKER_SPREAD * clampForexSpreadStrength(spreadStrength));
  return Math.round((spend - fee) * crossRate);
}

/**
 * Smallest practical spend whose delivered amount is at least `target` under
 * the market maker's real rounding. The closed form in purchaseConversionRequired
 * ignores rounding and can land a few units short, which used to strand a
 * conversion when the following exact debit failed.
 */
export function purchaseConversionMinimumSpend(
  target: number,
  crossRate: number,
  fixedSettlement: boolean,
  spreadStrength?: number
): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  if (!Number.isFinite(crossRate) || crossRate <= 0) return Number.NaN;
  const effectiveRate = fixedSettlement
    ? crossRate
    : (1 - MARKET_MAKER_SPREAD * clampForexSpreadStrength(spreadStrength)) * crossRate;
  let spend =
    Math.ceil(
      purchaseConversionRequired(target, crossRate, fixedSettlement, spreadStrength) * 100
    ) / 100;
  for (let step = 0; step < 32; step++) {
    const shortBy =
      target - purchaseConversionDelivered(spend, crossRate, fixedSettlement, spreadStrength);
    if (shortBy <= 0) return spend;
    spend = Math.ceil((spend + Math.max(shortBy / effectiveRate, 0.01)) * 100) / 100;
  }
  // Unreachable for finite inputs; fall back to the generous wallet buffer.
  return spend + Math.max(1, Math.ceil(1 / crossRate));
}

export function purchaseSpreadRate(
  from: CurrencyCode,
  to: CurrencyCode,
  union?: EuroMonetaryUnion,
  strengths?: Partial<Record<CurrencyCode, number>> | null
): number {
  if (from === to || euroLedgerCrossRate(union, from, to) != null) return 0;
  const member =
    union && Object.values(union.members).some((entry) => entry?.ledgerCurrency === from);
  const policyCurrency = member && union ? union.anchorCurrency : from;
  return MARKET_MAKER_SPREAD * clampForexSpreadStrength(strengths?.[policyCurrency]);
}
