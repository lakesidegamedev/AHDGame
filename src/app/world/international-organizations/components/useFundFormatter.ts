"use client";

import { useCallback } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import { formatFundAmount } from "./fundCurrency";

/**
 * Formats a fund-currency amount in whatever currency the viewer asked for.
 *
 * Used for informational money only. Balances and inputs must stay in their
 * denominated units; see `CurrencyContext.formatPriceIn`.
 *
 * `formatAmount` works in anchor units, so multiply the fund-currency figure
 * by the anchor-per-fund-unit rate first. That rate MUST come from the server,
 * which resolves it for the active era; deriving it locally would price past
 * eras at present-day rates. Without it the fund's own currency stands in.
 */
export function useFundFormatter(fund: {
  usdToFundRate?: number;
  currencyCountryId?: CountryId;
  /** OrgInfluenceView's name for the fund country — same meaning as above. */
  fundCurrencyCountryId?: CountryId;
  currencyCode?: string;
}): (localAmount: number) => string {
  const { formatAmount } = useCurrency();
  const countryId = fund.currencyCountryId ?? fund.fundCurrencyCountryId;
  const code =
    fund.currencyCode ?? (countryId ? (COUNTRY_CURRENCY_MAP[countryId] ?? "USD") : "USD");
  const rate = fund.usdToFundRate;
  return useCallback(
    (localAmount: number) =>
      rate
        ? formatAmount(localAmount * rate, code as CurrencyCode)
        : formatFundAmount(localAmount, code),
    [formatAmount, rate, code]
  );
}
