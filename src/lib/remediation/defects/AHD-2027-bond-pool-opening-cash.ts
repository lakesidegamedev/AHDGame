import type { Db, ObjectId } from "mongodb";
import { BOND_POOL_M2_SHARE } from "@/lib/bonds/marketPool";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { homeCurrency } from "@/lib/moneySupply/rules/assemble";
import { bondMarketPoolsCollection } from "@/lib/db/repositories/bondMarketPools";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { healBackupsCollection } from "@/lib/db/repositories/healBackups";
import { healRunsCollection } from "@/lib/db/repositories/healRuns";
import { ledgerEntriesCollection } from "@/lib/db/repositories/ledgerEntries";
import { moneySupplySnapshotsCollection } from "@/lib/db/repositories/moneySupplySnapshots";
import { runRequiredTransaction } from "@/lib/db/runRequiredTransaction";
import { accountId } from "@/lib/ledger/accounts";
import { finalizeLedgerEntry } from "@/lib/ledger/emit";
import { ledgerTurnFromClock } from "@/lib/ledger/ledgerTurn";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import type { Defect, HealBackup, HealPlan, HealRun } from "../types";

export const DEFECT_ID = "AHD-2027-bond-pool-opening-cash";
const PRESET = "2027-default";
const OPENING_DAY = "2026-11-15";
const CUTOFF = "2026-11-20T00:00:00Z";
const USD_ADJUSTMENT_RUN = "run_2026-11-19130549_7825d8a1";
const USD_ADJUSTMENT_CASH = 1_377_715_376_327.51;
const USD_ADJUSTMENT_CLOCK_TURN = 64;

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
  usdAdjustment?: UsdAdjustment;
}

interface UsdAdjustment {
  amount: number;
  appliedAt: Date;
  backupId: ObjectId;
}

async function readUsdAdjustment(db: Db, turn: number): Promise<UsdAdjustment | undefined> {
  const run = await healRunsCollection<HealRun>(db).findOne({ _id: USD_ADJUSTMENT_RUN });
  if (!run || run.status === "rolled-back") return undefined;
  if (
    run.status !== "succeeded" ||
    run.env !== "prod" ||
    run.defectId !== "ADHOC-bondMarketPools-06d2a6e0cf" ||
    run.result?.documentsUpdated !== 1 ||
    !run.finishedAt ||
    turn < USD_ADJUSTMENT_CLOCK_TURN
  ) {
    throw new Error("USD adjustment run does not match the audited production write");
  }
  const backup = await healBackupsCollection<HealBackup>(db).findOne({
    runId: run._id,
    defectId: run.defectId,
    collection: "bondMarketPools",
    docId: "USD",
  });
  const priorCash = backup?.doc.cashLocal;
  if (
    !backup ||
    typeof priorCash !== "number" ||
    !Number.isFinite(priorCash) ||
    priorCash < 0 ||
    priorCash >= USD_ADJUSTMENT_CASH
  ) {
    throw new Error("USD adjustment is missing its verified pre-write balance");
  }
  return {
    amount: USD_ADJUSTMENT_CASH - priorCash,
    appliedAt: run.finishedAt,
    backupId: backup._id,
  };
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
  let usdAdjustment: UsdAdjustment | undefined;
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
    if (currency === "USD") {
      usdAdjustment = await readUsdAdjustment(db, rows.turn);
      if (usdAdjustment && pool.cashLocal + amount - usdAdjustment.amount < 0) {
        throw new Error("USD reconciliation would overdraw the pool after restoring opening cash");
      }
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
  const payload: Payload = { turn: rows.turn, transfers, usdAdjustment };
  return {
    affected: transfers.length,
    moneyDelta: usdAdjustment ? -usdAdjustment.amount : 0,
    summary: `Restore opening cash to ${transfers.length} pools from deposits in the same currencies`,
    touched: [
      { collection: "centralBanks", ids: transfers.flatMap((t) => t.debits.map((s) => s.id)) },
      { collection: "bondMarketPools", ids: transfers.map((t) => t.currency) },
      ...(usdAdjustment ? [{ collection: "healRuns", ids: [USD_ADJUSTMENT_RUN] }] : []),
    ],
    notes: transfers.map((t) => {
      const removed = t.currency === "USD" ? (usdAdjustment?.amount ?? 0) : 0;
      return `${t.currency}: ${t.before} + ${t.amount}${removed ? ` - ${removed} (reverse ${USD_ADJUSTMENT_RUN})` : ""} = ${t.before + t.amount - removed}`;
    }),
    payload,
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title: "Restore 2027 opening bond market cash",
  severity: "P1",
  seedFix: { status: "fixed", files: ["src/lib/migrations/startupMigrations.ts"] },
  codeFix: { issue: 6895, pr: 6908, requiredCommit: "3d8d2da39befd44d04bf04911ce05410268fc0da" },
  envs: ["prod", "sandbox"],
  worldsStartedBefore: CUTOFF,
  idempotent: true,
  // Every deposit transfer balances. Only the audited manual USD creation is reversed.
  mintsMoney: true,
  guards: ["turn-lock-free", "max-affected:14", "money-conserving"],
  detect,
  plan,
  async apply(db, approved, ctx) {
    const { turn, transfers, usdAdjustment } = approved.payload as Payload;
    if (!transfers.length) return { documentsModified: 0, notes: [] };
    const ledgerRows = transfers.map(({ amount, currency, localPerAnchor, debits }) =>
      finalizeLedgerEntry({
        turn: ledgerTurnFromClock(turn),
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
    if (usdAdjustment) {
      const rate = transfers.find(({ currency }) => currency === "USD")?.localPerAnchor;
      if (!rate) throw new Error("USD reconciliation requires the USD opening transfer");
      const history = [
        {
          amount: usdAdjustment.amount,
          turn: ledgerTurnFromClock(USD_ADJUSTMENT_CLOCK_TURN),
          at: usdAdjustment.appliedAt,
          txType: "bond_pool_inflow" as const,
          contra: "mint" as const,
        },
        {
          amount: -usdAdjustment.amount,
          turn: ledgerTurnFromClock(turn),
          at: ctx.now,
          txType: "bond_pool_sweep" as const,
          contra: "sink" as const,
        },
      ];
      for (const entry of history) {
        ledgerRows.push(
          finalizeLedgerEntry({
            turn: entry.turn,
            createdAt: entry.at,
            txType: entry.txType,
            emitSite: DEFECT_ID,
            sourceRef: { collection: "healBackups", id: usdAdjustment.backupId },
            legs: [
              {
                account: accountId("bond_pool", "USD", "USD"),
                amount: entry.amount,
                currencyCode: "USD",
                anchorAmount: entry.amount / rate,
                role: "primary",
              },
              {
                account: accountId(entry.contra, "usd_bond_pool_manual_adjustment", "USD"),
                amount: -entry.amount,
                currencyCode: "USD",
                anchorAmount: -entry.amount / rate,
                role: "contra",
              },
            ],
          })
        );
      }
    }
    // The deposits and dealer balances must commit together, including the audit entries.
    await runRequiredTransaction(
      async (session) => {
        const state = await gameStateCollection(db).findOne(
          { _id: "current", preset: PRESET, currentTurn: turn, isProcessing: false },
          { session, projection: { nextScheduledTurn: 1, pausedAt: 1 } }
        );
        if (
          !state ||
          (!state.pausedAt &&
            state.nextScheduledTurn &&
            +state.nextScheduledTurn - Date.now() < 60_000)
        ) {
          throw new Error("Wait for a safe window between turns");
        }
        for (const { currency, amount, before, debits } of transfers) {
          const removed = currency === "USD" ? (usdAdjustment?.amount ?? 0) : 0;
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
              $inc: { cashLocal: amount - removed, "lifetime.openingAllocationIn": amount },
              $set: { updatedAt: ctx.now },
            },
            { session }
          );
          if (credit.modifiedCount !== 1) throw new Error(`Pool changed for ${currency}`);
        }
        if (usdAdjustment) {
          const reversed = await healRunsCollection<HealRun>(db).updateOne(
            { _id: USD_ADJUSTMENT_RUN, status: "succeeded", finishedAt: usdAdjustment.appliedAt },
            { $set: { status: "rolled-back" } },
            { session }
          );
          if (reversed.modifiedCount !== 1) throw new Error("USD adjustment changed during repair");
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
