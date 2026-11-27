import { MARKET_MAKER_SPREAD } from "@/lib/constants/currencies";

/** Rates are native units per anchor; revenue belongs to the bank's home denomination. */
export function reserveExchangeQuote(
  amount: number,
  fromRate: number,
  toRate: number,
  homeRate: number
) {
  if (
    ![amount, fromRate, toRate, homeRate].every((n) => Number.isFinite(n) && n > 0) ||
    !Number.isSafeInteger(amount)
  )
    return null;
  const spreadFee = Math.max(1, Math.round(amount * MARKET_MAKER_SPREAD));
  const receivedAmount = Math.round(((amount - spreadFee) / fromRate) * toRate);
  const revenueHome = Math.floor((spreadFee / 2 / fromRate) * homeRate);
  if (
    !Number.isSafeInteger(receivedAmount) ||
    receivedAmount <= 0 ||
    !Number.isSafeInteger(revenueHome) ||
    revenueHome < 0
  )
    return null;
  return { spreadFee, receivedAmount, revenueHome, rate: toRate / fromRate };
}
