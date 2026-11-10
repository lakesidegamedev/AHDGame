/**
 * Import tariffs on a funded producer turn (gameConfig.producerTariffStage).
 *
 * Each importing country gets one tariff account. The tariffs its buyers owe
 * are settled with the market as closing transfers into that account, so the
 * settlement receipt freezes and witnesses them with every other balance
 * change. After settlement the account is emptied into the country's Treasury
 * cash (or, for a country with no budget, out of the world economy). The rates
 * and amounts come from tariffRules.
 */
import { producerTrades } from "@/lib/market/producerMarket/rules";
import type {
  EconomyResult,
  SettlementCloseTransfer,
} from "@/lib/market/producerMarket/settlement";
import { fundedTariffs, type ImportTariffTable } from "@/lib/market/producerMarket/tariffRules";
import { tariffRevenueMoves } from "@/lib/market/producerMarket/liveFundingRules";
import type { MoneyMove } from "@/lib/banking/moneyMove";
import {
  automationLevyTransfers,
  type PlantLevy,
} from "@/lib/market/producerMarket/levyCloseRules";
import type { ProducerWalletScope } from "./producerWallets";

/** Countries that can collect a tariff this turn: every importer in the table. */
export function tariffImporters(table: ImportTariffTable | undefined): string[] {
  if (!table) return [];
  const out = new Set<string>();
  for (const key of Object.keys(table)) {
    const [, , importer] = JSON.parse(key) as [string, string, string];
    if (importer) out.add(importer);
  }
  return [...out].sort();
}

/** One tariff account per importer with a known currency. */
export function tariffCollectorScopes(
  table: ImportTariffTable | undefined,
  currencyOf: (countryId: string) => ProducerWalletScope["currency"] | undefined,
  /** Countries that also collect automation levies through the same account. */
  levyCountries: Iterable<string> = []
): ProducerWalletScope[] {
  const countries = new Set([...tariffImporters(table), ...levyCountries]);
  return [...countries].sort().flatMap((countryId) => {
    const currency = currencyOf(countryId);
    return currency ? [{ kind: "tariffCollector" as const, countryId, currency }] : [];
  });
}

export interface TariffClose {
  transfers: SettlementCloseTransfer[];
  paidByAccount: Map<string, number>;
  meta: {
    collectedByImporter: Record<string, number>;
    paid: number;
    shortfall: number;
  };
}

/**
 * The tariff each buyer owes on this turn's settled cross-border sales, as
 * closing transfers to its country's tariff account, capped at the buyer's
 * closing cash. `closingCash` is reduced in place so later closing transfers
 * plan from what is really left.
 */
export function tariffsAtClose(input: {
  market: EconomyResult;
  table: ImportTariffTable;
  collectorOf: (countryId: string) => string | null;
  closingCash: Map<string, number>;
}): TariffClose {
  const result = fundedTariffs({
    trades: producerTrades(input.market.tradeReceipt),
    table: input.table,
    collectorOf: input.collectorOf,
    cashOf: (id) => input.closingCash.get(id) ?? 0,
  });
  let paid = 0;
  for (const t of result.transfers) {
    paid += t.amount;
    input.closingCash.set(
      t.fromAccountId,
      (input.closingCash.get(t.fromAccountId) ?? 0) - t.amount
    );
    input.closingCash.set(t.toAccountId, (input.closingCash.get(t.toAccountId) ?? 0) + t.amount);
  }
  return {
    transfers: result.transfers.map((t) => ({
      reason: "import_tariff",
      fromAccountId: t.fromAccountId,
      toAccountId: t.toAccountId,
      amountAnchor: t.amount,
    })),
    paidByAccount: result.paidByAccount,
    meta: {
      collectedByImporter: Object.fromEntries(result.collectedByImporter),
      paid,
      shortfall: result.shortfall,
    },
  };
}

export interface LevyCloseResult {
  transfers: SettlementCloseTransfer[];
  paidByAccount: Map<string, number>;
  meta: { collectedByCountry: Record<string, number>; paid: number; shortfall: number };
}

/**
 * Automation levies owed on this turn's settled input purchases, as closing transfers from
 * the paying company to its country's collection account. `closingCash` is reduced in place
 * so later closing transfers plan from what is really left.
 */
export function automationLevyAtClose(input: {
  market: EconomyResult;
  levyByPlant: ReadonlyMap<string, PlantLevy>;
  collectorOf: (countryId: string) => string | null;
  closingCash: Map<string, number>;
}): LevyCloseResult {
  const close = automationLevyTransfers({
    trades: producerTrades(input.market.tradeReceipt),
    levyByPlant: input.levyByPlant,
    collectorOf: input.collectorOf,
    cashOf: (id) => input.closingCash.get(id) ?? 0,
  });
  let paid = 0;
  for (const t of close.transfers) {
    paid += t.amount;
    input.closingCash.set(
      t.fromAccountId,
      (input.closingCash.get(t.fromAccountId) ?? 0) - t.amount
    );
    input.closingCash.set(t.toAccountId, (input.closingCash.get(t.toAccountId) ?? 0) + t.amount);
  }
  return {
    transfers: close.transfers.map((t) => ({
      reason: "automation_levy",
      fromAccountId: t.fromAccountId,
      toAccountId: t.toAccountId,
      amountAnchor: t.amount,
    })),
    paidByAccount: close.paidByAccount,
    meta: {
      collectedByCountry: Object.fromEntries(close.collectedByCountry),
      paid,
      shortfall: close.shortfall,
    },
  };
}

/** Empties each tariff account: into Treasury cash where the country has a budget. */
export function tariffSweepMoves(input: {
  worldEpoch: string;
  turn: number;
  collectors: readonly { countryId: string; walletId: string; currency: string }[];
  heldLocal: ReadonlyMap<string, number>;
  budgetIdOf: (countryId: string) => string | null;
  rateOf: (currency: string) => number;
}): MoneyMove[] {
  return tariffRevenueMoves(
    input.worldEpoch,
    input.turn,
    input.collectors.flatMap((c) => {
      const held = input.heldLocal.get(c.walletId) ?? 0;
      if (!(Number.isFinite(held) && held > 0)) return [];
      return [
        {
          countryId: c.countryId,
          walletId: c.walletId,
          amountLocal: held,
          currencyCode: c.currency,
          localPerAnchor: input.rateOf(c.currency),
          budgetId: input.budgetIdOf(c.countryId),
        },
      ];
    })
  );
}
