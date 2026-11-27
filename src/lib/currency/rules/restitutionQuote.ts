import type { CurrencyCode } from "@/lib/constants/currencies";
import { roundSavingsAmount } from "./savingsInterest";

/** Preserve a historical nominal claim while crediting the recipient's current currency. */
export function restitutionQuote(
  sourceAmount: number,
  sourceCurrency: CurrencyCode,
  currencyCode: CurrencyCode,
  rates: ReadonlyMap<CurrencyCode, number>
) {
  const sourceRate = rates.get(sourceCurrency),
    localRate = rates.get(currencyCode);
  if (
    !Number.isFinite(sourceAmount) ||
    sourceAmount < 0 ||
    !sourceRate ||
    !Number.isFinite(sourceRate) ||
    sourceRate <= 0 ||
    !localRate ||
    !Number.isFinite(localRate) ||
    localRate <= 0
  )
    throw new Error("Historical restitution requires valid currency valuations");
  const anchorAmount = sourceAmount / sourceRate;
  return {
    currencyCode,
    sourceAmount,
    sourceCurrency,
    sourceRate,
    localRate,
    anchorAmount,
    amountLocal: roundSavingsAmount(anchorAmount * localRate, currencyCode),
  };
}
