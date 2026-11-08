import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { readCorpEconomicAnchor, writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import {
  fxRateForCorpFromMap,
  fxRateForSectorHostFromMap,
  resolveCorpLiquidCurrencyCode,
  resolveSectorHostCurrencyCode,
} from "@/lib/currency/corporationCapital";

/**
 * Host → ₳ → corp restatement for the corporation detail view.
 *
 * Sector economic fields are stored in each sector's HOST-state currency, but
 * every figure on the page is shown in the corp's home currency. Restating
 * through the anchor keeps the sector rows, totals, profit and workers
 * single-currency; it is the identity for domestic sectors, where host and
 * corp currency match.
 *
 * Pure and testable on its own; this must stay single-currency and is a spot
 * that has generated bugs.
 */
export interface SectorCurrencyRestatement {
  /** The corp's own currency, which every figure on the page is stated in. */
  corpCurrency: CurrencyCode | undefined;
  /** The corp's FX rate against the anchor. Callers restating non-sector
   *  anchor amounts (pensions, portfolio) need the same pair. */
  corpRate: number;
  /** Restate a host-currency sector field into ₳. */
  toAnchor: (amount: number, sector: Pick<CorporateSector, "countryId">) => number;
  /** Restate a host-currency sector field into the corp's currency. */
  toCorpCurrency: (amount: number, sector: Pick<CorporateSector, "countryId">) => number;
}

export function buildSectorCurrencyRestatement(
  corporation: Corporation,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>
): SectorCurrencyRestatement {
  const corpCurrency = resolveCorpLiquidCurrencyCode(corporation);
  const corpRate = fxRateForCorpFromMap(corporation, fxByCurrency);

  const toAnchor = (amount: number, sector: Pick<CorporateSector, "countryId">): number =>
    readCorpEconomicAnchor(
      amount,
      resolveSectorHostCurrencyCode(sector, corporation),
      fxRateForSectorHostFromMap(sector, corporation, fxByCurrency)
    );

  return {
    corpCurrency,
    corpRate,
    toAnchor,
    toCorpCurrency: (amount, sector) =>
      writeCorpEconomicLocal(toAnchor(amount, sector), corpCurrency, corpRate),
  };
}
