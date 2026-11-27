import { withSessionDb, afterCommit, unboundDb } from "@/lib/db/sessionDb";
import { CURRENCY_ANCHOR_COUNTRY } from "@/lib/constants/currencyCodes";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { invalidateCorpFxRateCache } from "@/lib/currency/corporationCapital";
/**
 * Apply a one-shot FX depreciation to a country's exchange rate.
 *
 * AHD stores `exchangeRates.rate` as "local currency per 1 internal unit", so a
 * higher rate means a weaker local currency. A 40% depreciation is a 1.4x
 * multiplier on `rate`.
 *
 * Subsequent FX history snapshots are folded by the existing FX pipeline; we
 * do not write a `rateHistory` entry here.
 *
 * NOTE: this intentionally bypasses hardPeg / interventionPolicy checks. A
 * sovereign default override is more authoritative than an admin peg or chair
 * band. The existing FX pipeline will reconcile on the next turn snapshot.
 */

import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";

import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";

export async function applyExchangeRateDepreciation(
  db: Db,
  countryId: CountryId,
  percent: number
): Promise<{ ok: boolean; previousRate?: number; newRate?: number }> {
  return withSessionDb(db, async (db) => {
    const source = await exchangeRatesCollection(db).findOne({ _id: countryId });
    if (!source) return { ok: false };
    const currency = source.currencyCode ?? COUNTRY_CURRENCY_MAP[countryId];
    const authorityId = CURRENCY_ANCHOR_COUNTRY[currency];
    const row =
      authorityId && authorityId !== countryId
        ? await exchangeRatesCollection(db).findOne({ _id: authorityId })
        : source;
    if (!row) return { ok: false };

    const previousRate = row.rate;
    const newRate = previousRate * (1 + percent);
    if (!Number.isFinite(newRate) || newRate <= 0) return { ok: false };

    await exchangeRatesCollection(db).updateMany(
      { $or: [{ _id: row._id }, { currencyCode: currency }] },
      { $set: { rate: newRate, updatedAt: new Date() } }
    );

    await afterCommit(db, () => invalidateCorpFxRateCache(unboundDb(db)));
    return { ok: true, previousRate, newRate };
  });
}
