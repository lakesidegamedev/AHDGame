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
import { automationLevyInputPenalty } from "@/lib/automationPolicy/rules";
import { automationPolicyFor } from "@/lib/automationPolicy/policies";
import type { ProducerWalletScope } from "./producerWallets";
import type { CorporationLookups } from "./types";

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
  /** Plants whose countries also collect automation levies through the same account. */
  levies: ReadonlyMap<string, PlantLevy> = new Map()
): ProducerWalletScope[] {
  const countries = new Set([
    ...tariffImporters(table),
    ...[...levies.values()].map((l) => l.countryId),
  ]);
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
    /** Automation levy collected through the same account, when any plant owes one. */
    automationLevy?: {
      collectedByCountry: Record<string, number>;
      paid: number;
      shortfall: number;
    };
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

/** The levy each plant owes on its input purchases, by plan id. */
export function plantLevies(
  planSector: ReadonlyMap<string, string>,
  lookups: Pick<CorporationLookups, "sectorsByCorp" | "automationPolicyByCountry">
): Map<string, PlantLevy> {
  const { sectorsByCorp, automationPolicyByCountry: policyByCountry } = lookups;
  const sectorById = new Map(
    [...sectorsByCorp.values()].flat().map((sector) => [sector._id.toHexString(), sector])
  );
  const out = new Map<string, PlantLevy>();
  if (!policyByCountry) return out;
  for (const [planId, sectorId] of planSector) {
    const sector = sectorById.get(sectorId);
    if (!sector?.countryId) continue;
    const penalty = automationLevyInputPenalty(
      automationPolicyFor(policyByCountry, sector.countryId),
      sector.strategyId
    );
    if (penalty > 0) out.set(planId, { countryId: sector.countryId, penalty });
  }
  return out;
}

/**
 * Import tariffs and automation levies, both paid by companies into the country's collection
 * account as closing transfers. Tariffs come off first, then levies plan from what is left.
 */
export function collectionsAtClose(input: {
  market: EconomyResult;
  table: ImportTariffTable | undefined;
  levyByPlant: ReadonlyMap<string, PlantLevy>;
  collectors: ReadonlyMap<string, string>;
  closingCash: Map<string, number>;
}): TariffClose | null {
  if (!input.table && !input.levyByPlant.size) return null;
  const collectorOf = (c: string) => input.collectors.get(c) ?? null;
  const tariffs = input.table
    ? tariffsAtClose({ ...input, collectorOf, table: input.table })
    : { transfers: [], paidByAccount: new Map<string, number>(), meta: emptyTariffMeta() };
  if (!input.levyByPlant.size) return tariffs;
  const close = automationLevyTransfers({
    trades: producerTrades(input.market.tradeReceipt),
    levyByPlant: input.levyByPlant,
    collectorOf,
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
  const paidByAccount = new Map(tariffs.paidByAccount);
  for (const [id, amount] of close.paidByAccount)
    paidByAccount.set(id, (paidByAccount.get(id) ?? 0) + amount);
  return {
    transfers: [
      ...tariffs.transfers,
      ...close.transfers.map((t) => ({
        reason: "automation_levy",
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        amountAnchor: t.amount,
      })),
    ],
    paidByAccount,
    meta: {
      ...tariffs.meta,
      automationLevy: {
        collectedByCountry: Object.fromEntries(close.collectedByCountry),
        paid,
        shortfall: close.shortfall,
      },
    },
  };
}

function emptyTariffMeta(): TariffClose["meta"] {
  return { collectedByImporter: {}, paid: 0, shortfall: 0 };
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
