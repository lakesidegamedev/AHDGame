/** Resolve a fiscal transfer from live wallet denominations; missing quotes refuse settlement. */
import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import {
  COUNTRY_CURRENCY_MAP,
  ZOD_CURRENCY_ENUM,
  type CurrencyCode,
} from "@/lib/constants/currencies";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";

export type FxScalePair =
  /**
   * Currencies differ and both sides have a usable rate. Carries the codes and
   * the loaded rate table so a caller converting individual balances (wallet
   * relabeling, `convertCorpCurrency`) does not re-derive or re-load them.
   */
  | {
      kind: "convert";
      scale: number;
      oldCurrency: CurrencyCode;
      newCurrency: CurrencyCode;
      fxByCurrency: Map<CurrencyCode, number>;
    }
  /** Forex disabled, or the two countries share a currency: nothing converts. */
  | { kind: "no-conversion" }
  /** Currencies differ but a usable rate is missing: policy is the caller's. */
  | { kind: "missing-rate" };

export async function loadFxScalePair(
  db: Db,
  fromCountryId: CountryId,
  toCountryId: CountryId,
  currencies?: { fromCurrency?: string; toCurrency?: string }
): Promise<FxScalePair> {
  for (const code of [currencies?.fromCurrency, currencies?.toCurrency])
    if (code != null && !ZOD_CURRENCY_ENUM.includes(code as CurrencyCode))
      throw new Error("Fiscal transfer currency is invalid");
  if (!(await isForexEnabled())) return { kind: "no-conversion" };

  const oldCurrency =
    (currencies?.fromCurrency as CurrencyCode | undefined) ?? COUNTRY_CURRENCY_MAP[fromCountryId];
  const newCurrency =
    (currencies?.toCurrency as CurrencyCode | undefined) ?? COUNTRY_CURRENCY_MAP[toCountryId];
  if (!oldCurrency || !newCurrency || oldCurrency === newCurrency) {
    return { kind: "no-conversion" };
  }

  const fxByCurrency = await loadFxRatesByCurrency(db);
  const fromRate = fxByCurrency.get(oldCurrency);
  const toRate = fxByCurrency.get(newCurrency);
  if (
    fromRate === undefined ||
    toRate === undefined ||
    !Number.isFinite(fromRate) ||
    !Number.isFinite(toRate) ||
    fromRate <= 0 ||
    toRate <= 0
  ) {
    return { kind: "missing-rate" };
  }
  return { kind: "convert", scale: toRate / fromRate, oldCurrency, newCurrency, fxByCurrency };
}

export async function resolveMergeFxScale(
  db: Db,
  fromCountryId: CountryId,
  toCountryId: CountryId,
  currencies?: { fromCurrency?: string; toCurrency?: string }
): Promise<number> {
  const pair = await loadFxScalePair(db, fromCountryId, toCountryId, currencies);
  if (pair.kind === "convert") return pair.scale;
  if (pair.kind === "missing-rate")
    throw new Error(
      `Exchange rate unavailable for ${fromCountryId}->${toCountryId} fiscal transfer`
    );
  return 1;
}
