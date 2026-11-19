import type { Db } from "mongodb";
import { BOND_POOL_M2_SHARE } from "@/lib/bonds/marketPool";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { homeCurrency } from "@/lib/moneySupply/rules/assemble";
import { bondMarketPoolsCollection } from "@/lib/db/repositories/bondMarketPools";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { ledgerEntriesCollection } from "@/lib/db/repositories/ledgerEntries";
import { moneySupplySnapshotsCollection } from "@/lib/db/repositories/moneySupplySnapshots";
import { runRequiredTransaction } from "@/lib/db/runRequiredTransaction";
import { accountId } from "@/lib/ledger/accounts";
import { finalizeLedgerEntry } from "@/lib/ledger/emit";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import type { Defect, HealPlan } from "../types";

export const DEFECT_ID = "AHD-2027-bond-pool-opening-cash";
const PRESET = "2027-default";
const OPENING_DAY = "2026-11-15";
const CUTOFF = "2026-11-20T00:00:00Z";

interface FundingSource {
  id: string;
  balance: number;
}

interface SourceDebit extends FundingSource {
  amount: number;
}

/** Apportion in whole local units so even very large balances remain exact. */
export function allocateOpeningFunding(amount: number, sources: FundingSource[]): SourceDebit[] {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid opening allocation");
  const sorted = sources
    .filter(({ balance }) => Number.isFinite(balance) && balance >= 1)
    .sort((a, b) => a.id.localeCompare(b.id));
  const zero = BigInt(0);
  let available = sorted.reduce((sum, source) => sum + BigInt(Math.floor(source.balance)), zero);
  let remaining = BigInt(amount);
  if (available < remaining)
    throw new Error("External deposits cannot cover the opening allocation");
  return sorted.flatMap((source) => {
    const balance = BigInt(Math.floor(source.balance));
    const debit = (remaining * balance) / available;
    remaining -= debit;
    available -= balance;
    return debit > zero ? [{ ...source, amount: Number(debit) }] : [];
  });
}

interface Transfer {
  currency: CurrencyCode;
  before: number;
  amount: number;
  localPerAnchor: number;
  debits: SourceDebit[];
}

interface Payload {
  turn: number;
  transfers: Transfer[];
}

async function openingRows(db: Db) {
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { preset: 1, currentTurn: 1 } }
  );
  if (state?.preset !== PRESET) return null;
  const snapshots = await moneySupplySnapshotsCollection(db)
    .find({ turn: 0 }, { projection: { currencyCode: 1, m2: 1, createdAt: 1 } })
    .sort({ currencyCode: 1 })
    .toArray();
  if (
    !snapshots.length ||
    snapshots.some((s) => !s.createdAt?.toISOString().startsWith(OPENING_DAY))
  ) {
    return null;
  }
  const pools = await bondMarketPoolsCollection(db)
    .find({}, { projection: { cashLocal: 1, lifetime: 1 } })
    .toArray();
  const byCurrency = new Map(pools.map((pool) => [pool._id, pool]));
  if (
    byCurrency.size !== snapshots.length ||
    snapshots.some((s) => !byCurrency.has(s.currencyCode))
  ) {
    throw new Error("Opening snapshots and existing currency pools must match exactly");
  }
  return { turn: state.currentTurn, snapshots, pools: byCurrency };
}

async function detect(db: Db) {
  const rows = await openingRows(db);
  const pending = rows
    ? rows.snapshots.filter(
        (s) =>
          rows.pools.get(s.currencyCode)?.lifetime?.openingAllocationIn !==
          Math.round(s.m2 * BOND_POOL_M2_SHARE)
      )
    : [];
  return { affected: pending.length, sample: pending.slice(0, 10).map((s) => s.currencyCode) };
}

async function plan(db: Db): Promise<HealPlan> {
  const rows = await openingRows(db);
  if (!rows)
    return { affected: 0, moneyDelta: 0, touched: [], summary: "Opening world is out of scope" };
  const banks = await centralBanksCollection(db)
    .find({}, { projection: { countryId: 1, externalBroadMoney: 1 } })
    .toArray();
  const rates = await loadFxRatesByCurrency(db);
  const transfers: Transfer[] = [];
  for (const opening of rows.snapshots) {
    const currency = opening.currencyCode;
    const pool = rows.pools.get(currency);
    if (!pool) throw new Error(`Missing bond pool for ${currency}`);
    const amount = Math.round(opening.m2 * BOND_POOL_M2_SHARE);
    if (pool.lifetime?.openingAllocationIn === amount) continue;
    if (pool.lifetime?.openingAllocationIn !== undefined) {
      throw new Error(`Opening allocation marker disagrees with the snapshot for ${currency}`);
    }
    const localPerAnchor = rates.get(currency) ?? (currency === "USD" ? 1 : 0);
    if (!Number.isFinite(localPerAnchor) || localPerAnchor <= 0) {
      throw new Error(`Missing exchange rate for ${currency}`);
    }
    if (!Number.isFinite(pool.cashLocal) || pool.cashLocal < 0) {
      throw new Error(`Invalid pool balance for ${currency}`);
    }
    const sources = banks
      .filter((bank) => homeCurrency(bank.countryId, PRESET) === currency)
      .map((bank) => ({ id: String(bank._id), balance: bank.externalBroadMoney ?? 0 }));
    transfers.push({
      currency,
      before: pool.cashLocal,
      amount,
      localPerAnchor,
      debits: allocateOpeningFunding(amount, sources),
    });
  }
  const payload: Payload = { turn: rows.turn, transfers };
  return {
    affected: transfers.length,
    moneyDelta: 0,
    summary: `Restore opening cash to ${transfers.length} pools from deposits in the same currencies`,
    touched: [
      { collection: "centralBanks", ids: transfers.flatMap((t) => t.debits.map((s) => s.id)) },
      { collection: "bondMarketPools", ids: transfers.map((t) => t.currency) },
    ],
    notes: transfers.map(
      (t) => `${t.currency}: ${t.before} + ${t.amount} = ${t.before + t.amount}`
    ),
    payload,
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title: "Restore 2027 opening bond market cash",
  severity: "P1",
  seedFix: { status: "fixed", files: ["src/lib/migrations/startupMigrations.ts"] },
  codeFix: { issue: 6895, pr: 6902, requiredCommit: "3c42014e5ab1186859dca6ed658e46c77d3edde8" },
  envs: ["prod", "sandbox"],
  worldsStartedBefore: CUTOFF,
  idempotent: true,
  guards: ["turn-lock-free", "max-affected:14", "money-conserving"],
  detect,
  plan,
  async apply(db, approved, ctx) {
    const { turn, transfers } = approved.payload as Payload;
    if (!transfers.length) return { documentsModified: 0, notes: [] };
    const ledgerRows = transfers.map(({ amount, currency, localPerAnchor, debits }) =>
      finalizeLedgerEntry({
        turn: turn + 1,
        createdAt: ctx.now,
        txType: "bond_pool_inflow",
        emitSite: DEFECT_ID,
        legs: [
          {
            account: accountId("bond_pool", currency, currency),
            amount,
            currencyCode: currency,
            anchorAmount: amount / localPerAnchor,
            role: "primary",
          },
          ...debits.map((source) => ({
            account: accountId("external_deposits", source.id, currency),
            amount: -source.amount,
            currencyCode: currency,
            anchorAmount: -source.amount / localPerAnchor,
            role: "contra" as const,
          })),
        ],
      })
    );
    // The deposits and dealer balances must commit together, including the audit entries.
    await runRequiredTransaction(
      async (session) => {
        const state = await gameStateCollection(db).findOne(
          { _id: "current", preset: PRESET, currentTurn: turn, isProcessing: false },
          { session, projection: { nextScheduledTurn: 1, paused: 1 } }
        );
        if (
          !state ||
          (!state.paused &&
            state.nextScheduledTurn &&
            +state.nextScheduledTurn - Date.now() < 60_000)
        ) {
          throw new Error("Wait for a safe window between turns");
        }
        for (const { currency, amount, before, debits } of transfers) {
          const debit = await centralBanksCollection(db).bulkWrite(
            debits.map((source) => ({
              updateOne: {
                filter: { _id: source.id, externalBroadMoney: source.balance },
                update: { $inc: { externalBroadMoney: -source.amount } },
              },
            })),
            { session }
          );
          if (debit.matchedCount !== debits.length)
            throw new Error(`Funding source changed for ${currency}`);
          const credit = await bondMarketPoolsCollection(db).updateOne(
            {
              _id: currency,
              cashLocal: before,
              "lifetime.openingAllocationIn": { $exists: false },
            },
            {
              $inc: { cashLocal: amount, "lifetime.openingAllocationIn": amount },
              $set: { updatedAt: ctx.now },
            },
            { session }
          );
          if (credit.modifiedCount !== 1) throw new Error(`Pool changed for ${currency}`);
        }
        await ledgerEntriesCollection(db).insertMany(ledgerRows, { session });
      },
      { client: db.client }
    );
    return {
      documentsModified:
        transfers.length + transfers.reduce((count, t) => count + t.debits.length, 0),
      insertedIds: [
        { collection: "ledgerEntries", ids: ledgerRows.map((row) => row._id.toHexString()) },
      ],
      notes: approved.notes ?? [],
    };
  },
  async verify(db) {
    const rows = await openingRows(db);
    if (!rows) return { ok: true, remaining: 0, notes: ["Opening world is out of scope"] };
    const invalid = rows.snapshots.filter(
      (s) =>
        rows.pools.get(s.currencyCode)?.lifetime?.openingAllocationIn !==
        Math.round(s.m2 * BOND_POOL_M2_SHARE)
    );
    return {
      ok: invalid.length === 0,
      remaining: invalid.length,
      notes: invalid.length
        ? invalid.map((s) => s.currencyCode)
        : ["All opening allocations recorded"],
    };
  },
};
