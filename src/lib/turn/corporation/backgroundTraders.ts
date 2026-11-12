/**
 * Background countries as funded-market traders (#5702): the shell around
 * `backgroundTradeRules`. One read of the tier snapshot and, only when a world
 * has background countries, one read of their macro documents; one write back
 * of what each sold and bought. A world without background countries pays the
 * tier read and nothing else.
 */
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { loadCountryTiers } from "@/lib/country/countryTier";
import { currencyForCountry } from "@/lib/currency/sectorFxSpread";
import { getMacroCountriesCollection } from "@/lib/db/collections/macroCountries";
import type { BackgroundTradeOutcome } from "@/lib/market/producerMarket/backgroundTradeRules";
import { ACTIVE_MACRO_COUNTRY_FILTER, isActiveMacroCountry } from "@/lib/world/macro/retirement";
import { nextFundedTrade } from "@/lib/world/macro/rules/tradeFeedback";
import type { MacroCountryState } from "@/lib/world/macro/types";
import { producerWalletId, type ProducerWalletScope } from "./producerWallets";

export interface BackgroundTrader {
  countryId: string;
  macroId: MacroCountryState["_id"];
  accountId: string;
  scope: ProducerWalletScope;
  currency: CurrencyCode;
  byCommodity: MacroCountryState["contribution"]["byCommodity"];
  fundedTrade: MacroCountryState["fundedTrade"];
}

export async function loadBackgroundTraders(
  db: Db,
  input: {
    worldEpoch: string;
    /** The country's budget currency, when it has a budget. */
    budgetCurrency: (countryId: string) => CurrencyCode | undefined;
    rates: ReadonlyMap<CurrencyCode, number>;
  }
): Promise<{ traders: BackgroundTrader[]; warnings: string[] }> {
  const tiers = await loadCountryTiers(db);
  if (tiers.backgroundIds.length === 0) return { traders: [], warnings: [] };
  const docs = await (
    await getMacroCountriesCollection(db)
  )
    .find(
      {
        entityId: { $in: tiers.backgroundIds },
        simulationTier: "background-macro",
        ...ACTIVE_MACRO_COUNTRY_FILTER,
      },
      { projection: { entityId: 1, contribution: 1, fundedTrade: 1, retiredAt: 1 } }
    )
    .toArray();
  const traders: BackgroundTrader[] = [];
  const warnings: string[] = [];
  for (const doc of [...docs].sort((a, b) => (a.entityId < b.entityId ? -1 : 1))) {
    if (!isActiveMacroCountry(doc)) continue;
    const countryId = String(doc.entityId);
    const currency = input.budgetCurrency(countryId) ?? currencyForCountry(countryId) ?? undefined;
    const rate = currency ? input.rates.get(currency) : undefined;
    // A country whose currency has no observed rate cannot settle this turn.
    // It sits the turn out rather than failing every player's turn.
    if (!currency || !rate || !Number.isFinite(rate) || rate <= 0) {
      warnings.push(`Background country ${countryId} has no observed currency rate; not trading`);
      continue;
    }
    const scope: ProducerWalletScope = { kind: "backgroundEconomy", countryId, currency };
    traders.push({
      countryId,
      macroId: doc._id,
      accountId: producerWalletId(input.worldEpoch, scope),
      scope,
      currency,
      byCommodity: doc.contribution?.byCommodity ?? {},
      fundedTrade: doc.fundedTrade,
    });
  }
  return { traders, warnings };
}

/** Folds this turn's realised trade into each trader's macro document, in one write. */
export async function recordBackgroundTrade(
  db: Db,
  turn: number,
  traders: readonly BackgroundTrader[],
  outcomes: ReadonlyMap<string, BackgroundTradeOutcome>
): Promise<void> {
  const ops: AnyBulkWriteOperation<MacroCountryState>[] = traders.flatMap((t) => {
    const outcome = outcomes.get(t.countryId);
    if (!outcome) return [];
    return [
      {
        updateOne: {
          filter: { _id: t.macroId },
          update: { $set: { fundedTrade: nextFundedTrade(t.fundedTrade, outcome, turn) } },
        },
      },
    ];
  });
  if (ops.length > 0)
    await (await getMacroCountriesCollection(db)).bulkWrite(ops, { ordered: false });
}
