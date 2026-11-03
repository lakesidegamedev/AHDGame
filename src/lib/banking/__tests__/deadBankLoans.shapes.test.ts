/**
 * Every loan shape a wound-up bank leaves behind, serviced by the same moves.
 *
 * A dead bank's book is three books in one: named loans to players, household
 * tranches paid from the currency's pool, and collateralised construction
 * loans that own a lease, a loan lock and a pledge. The named book has been one
 * journaled move since #4975; the other two were still paying the per-loan
 * delivery chain, a claim and a handful of writes each, which is where a
 * production turn spent its banking stage.
 *
 * These tests pin what the new shape has to preserve, and they can only be seen
 * by comparison: the exact state the per-loan path left, that the household
 * pool is spent tranche by tranche, that a construction pledge is released
 * only by the payment that closes it and marked defaulted only by the one that
 * writes it off, and that a crash anywhere the journal can stop resumes to the
 * same state.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash, type FaultPlan } from "@/lib/test-utils/faultyDb";
import { resetRecordAuditBufferForTest } from "@/lib/audit/recordAudit";
import type { BankLoan } from "@/lib/db/types/bank";
import { MONEY_MOVE_COLLECTION } from "@/lib/banking/moneyMove";
import { ensureFund } from "@/lib/banking/insurance";
import { resumeSettlement } from "@/lib/banking/settlementJournal";
import { recoverConstructionServiceLeases } from "@/lib/banking/constructionServiceLease";
import {
  findDeadBanksWithLoans,
  processDeadBankLoans,
  recoveryTargetFor,
  type DeadBankLoanSummary,
} from "@/lib/banking/deadBankLoans";
import { servicePlayerLoan } from "@/lib/banking/namedLoanBook";
import { serviceDeadNpcBulkLoan } from "@/lib/turn/bankingTurn";
import { emitTxBulk, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const TURN = 55;

const OPEN = new ObjectId();
const CLOSED = new ObjectId();
const RESOLVED = new ObjectId();

const NAMED_CHAR = new ObjectId();
const CASH_LATE = new ObjectId();
const NAMED_CORP = new ObjectId();
const CONSTR_A = new ObjectId();
const CONSTR_B = new ObjectId();
const CONSTR_C = new ObjectId();

const SECTOR_FINAL = new ObjectId();
const SECTOR_DEFAULT = new ObjectId();
const SECTOR_LATE = new ObjectId();

const L_NAMED_A = new ObjectId();
const L_NAMED_B = new ObjectId();
const L_NAMED_CORP = new ObjectId();
const L_NPC_1 = new ObjectId();
const L_NPC_2 = new ObjectId();
const L_NPC_CLOSED = new ObjectId();
const L_CONSTR_PLAIN = new ObjectId();
const L_CONSTR_FINAL = new ObjectId();
const L_CONSTR_DEFAULT = new ObjectId();
const L_CONSTR_LATE = new ObjectId();
const L_NAMED_LATE = new ObjectId();
const L_ALREADY = new ObjectId();

const CB_US = "US";

function freshIds(count: number): ObjectId[] {
  return Array.from({ length: count }, () => new ObjectId());
}

afterEach(() => resetRecordAuditBufferForTest());

function charter(status: string, extra: Record<string, unknown> = {}) {
  return {
    type: "retail",
    status,
    currency: "USD",
    charteredTurn: 1,
    cashReserves: 0,
    ...extra,
  };
}

function namedLoan(
  bankId: ObjectId,
  borrowerType: "character" | "corporation",
  borrowerId: ObjectId,
  id: ObjectId,
  overrides: Partial<BankLoan> = {}
): BankLoan & Record<string, unknown> {
  return {
    _id: id,
    bankCorporationId: bankId,
    charteredTurn: 1,
    borrowerType,
    borrowerId,
    currency: "USD",
    principal: 500,
    outstanding: 500,
    ratePercent: 0,
    termTurns: 10,
    originatedTurn: 55,
    status: "current",
    ...overrides,
  } as BankLoan & Record<string, unknown>;
}

function npcLoan(
  bankId: ObjectId,
  id: ObjectId,
  overrides: Partial<BankLoan> = {}
): BankLoan & Record<string, unknown> {
  return {
    _id: id,
    bankCorporationId: bankId,
    charteredTurn: 1,
    borrowerType: "npcBulk",
    currency: "USD",
    principal: 1_000,
    outstanding: 1_000,
    ratePercent: 6,
    creditBand: "A",
    termTurns: 48,
    originatedTurn: 55,
    status: "current",
    ...overrides,
  } as BankLoan & Record<string, unknown>;
}

function constructionLoan(
  bankId: ObjectId,
  borrowerId: ObjectId,
  id: ObjectId,
  sectorId: ObjectId,
  claimId: string,
  overrides: Partial<BankLoan> = {}
): BankLoan & Record<string, unknown> {
  return {
    _id: id,
    bankCorporationId: bankId,
    charteredTurn: 1,
    borrowerType: "corporation",
    borrowerId,
    currency: "USD",
    principal: 400,
    outstanding: 400,
    ratePercent: 0,
    termTurns: 1,
    originatedTurn: 55,
    status: "current",
    constructionCollateral: {
      sectorId,
      claimId,
      quotedCostLocal: 10_000,
      constructionCostLocal: 10_000,
    },
    ...overrides,
  } as BankLoan & Record<string, unknown>;
}

function sector(id: ObjectId, loanId: ObjectId, bankId: ObjectId, claimId: string) {
  return {
    _id: id,
    corporationId: CONSTR_A,
    constructionFinancing: {
      claimId,
      loanId: String(loanId),
      bankId: String(bankId),
      charteredTurn: 1,
      status: "building",
      escrowLocal: 0,
    },
  };
}

/** The servicing closure the banking turn injects. */
async function runBatched(db: Db, turn = TURN): Promise<DeadBankLoanSummary> {
  return processDeadBankLoans(
    db,
    turn,
    async (loanRow, bank, target, trackInsuranceRecovery, txEntries, prefetch) => {
      if (loanRow.borrowerType === "npcBulk") {
        const recovered = await serviceDeadNpcBulkLoan(
          db,
          turn,
          loanRow,
          bank.currency,
          target,
          trackInsuranceRecovery,
          prefetch?.householdPool
        );
        return {
          collected: recovered.collected,
          interestCollected: recovered.interest,
          principalRepaid: recovered.principal,
          writtenOff: recovered.writtenOff,
          ...(recovered.replayed ? { replayed: true } : {}),
        };
      }
      const serviced = await servicePlayerLoan(
        db,
        turn,
        bank.corporationId,
        loanRow,
        bank.currency,
        bank.name,
        target,
        trackInsuranceRecovery,
        txEntries,
        prefetch?.borrower
      );
      return {
        collected: serviced.bankCredit,
        interestCollected: serviced.interestCollected,
        principalRepaid: serviced.principalRepaid,
        writtenOff: serviced.writtenOff,
        paidLocal: serviced.paidLocal,
        replayed: serviced.replayed,
        partial: serviced.partial,
      };
    }
  );
}

/**
 * The per-loan path this change replaced: one settlement per loan, serial, with
 * the borrower read once per cohort and the household pool read once per loan.
 * It is the oracle every batch is compared against.
 */
async function serviceBookPerLoan(db: Db): Promise<void> {
  const banks = await findDeadBanksWithLoans(db);
  const loans = await db
    .collection<BankLoan>("bankLoans")
    .find({
      bankCorporationId: { $in: banks.map((bank) => bank.corporationId) },
      status: { $in: ["current", "arrears"] },
      lastProcessedTurn: { $ne: TURN },
    })
    .toArray();

  const characterIds = new Map<string, ObjectId>();
  const corporationIds = new Map<string, ObjectId>();
  for (const loanRow of loans) {
    if (!loanRow.borrowerId) continue;
    if (loanRow.borrowerType === "character")
      characterIds.set(String(loanRow.borrowerId), loanRow.borrowerId);
    else if (loanRow.borrowerType === "corporation")
      corporationIds.set(String(loanRow.borrowerId), loanRow.borrowerId);
  }
  type CharacterRow = {
    _id: ObjectId;
    name?: string;
    currencyBalances?: { personal?: Record<string, number> };
  };
  type CorporationRow = { _id: ObjectId; name?: string; liquidCapital?: number };
  const [characters, corporations] = await Promise.all([
    characterIds.size
      ? db
          .collection<CharacterRow>("characters")
          .find(
            { _id: { $in: [...characterIds.values()] } },
            { projection: { name: 1, "currencyBalances.personal": 1 } }
          )
          .toArray()
      : Promise.resolve([] as CharacterRow[]),
    corporationIds.size
      ? db
          .collection<CorporationRow>("corporations")
          .find(
            { _id: { $in: [...corporationIds.values()] } },
            { projection: { name: 1, liquidCapital: 1 } }
          )
          .toArray()
      : Promise.resolve([] as CorporationRow[]),
  ]);
  const byCharacter = new Map(characters.map((row) => [String(row._id), row]));
  const byCorporation = new Map(corporations.map((row) => [String(row._id), row]));
  const borrowerState = new Map<string, { available: number; name: string }>();
  for (const loanRow of loans) {
    if (!loanRow.borrowerId) continue;
    const key = `${loanRow.borrowerType}:${String(loanRow.borrowerId)}:${loanRow.currency}`;
    if (borrowerState.has(key)) continue;
    if (loanRow.borrowerType === "character") {
      const row = byCharacter.get(String(loanRow.borrowerId));
      if (!row) continue;
      borrowerState.set(key, {
        available: Math.max(0, row.currencyBalances?.personal?.[loanRow.currency] ?? 0),
        name: row.name ?? "Borrower",
      });
    } else {
      const row = byCorporation.get(String(loanRow.borrowerId));
      if (!row) continue;
      borrowerState.set(key, {
        available: Math.max(0, row.liquidCapital ?? 0),
        name: row.name ?? "Borrower",
      });
    }
  }

  const funds = new Map<string, Awaited<ReturnType<typeof ensureFund>>>();
  for (const bank of banks) {
    const target = recoveryTargetFor(bank);
    let trackInsuranceRecovery = false;
    if (bank.resolved || bank.historyId) {
      let fund = funds.get(bank.currency);
      if (!fund) {
        fund = await ensureFund(db, bank.currency);
        funds.set(bank.currency, fund);
      }
      trackInsuranceRecovery =
        typeof bank.measuredClaimTurn === "number" &&
        typeof fund.pricingEvidenceStartTurn === "number" &&
        bank.measuredClaimTurn >= fund.pricingEvidenceStartTurn;
    }
    const txEntries: TxInput[] = [];
    for (const loanRow of loans) {
      if (String(loanRow.bankCorporationId) !== String(bank.corporationId)) continue;
      if (loanRow.borrowerType === "npcBulk") {
        // The serial pass read the pool per tranche, so each one spends what
        // the previous one left.
        await serviceDeadNpcBulkLoan(
          db,
          TURN,
          loanRow,
          bank.currency,
          target,
          trackInsuranceRecovery
        );
        continue;
      }
      const key = `${loanRow.borrowerType}:${String(loanRow.borrowerId)}:${loanRow.currency}`;
      const preloaded = borrowerState.get(key);
      const serviced = await servicePlayerLoan(
        db,
        TURN,
        bank.corporationId,
        loanRow,
        bank.currency,
        bank.name,
        target,
        trackInsuranceRecovery,
        txEntries,
        preloaded
      );
      if (preloaded) {
        if (serviced.replayed || serviced.partial) borrowerState.delete(key);
        else if (serviced.paidLocal > 0)
          preloaded.available = Math.max(0, preloaded.available - serviced.paidLocal);
      }
    }
    if (txEntries.length > 0) await emitTxBulk(db, txEntries, await loadTxThresholds(db));
  }
}

/**
 * The settlement protocol stamps the documents it touches with its own receipt
 * bookkeeping, and the ledger row names the journal key that delivered it. The
 * batches change those, and only those; everything economic has to match.
 */
const SETTLEMENT_BOOKKEEPING = new Set([
  "updatedAt",
  "createdAt",
  "expiresAt",
  "settledKeys",
  "moneyMoveRevision",
  "settlementProjectionRevision",
  "pendingMoneyMoveReceipt",
  "pendingSettlementProjection",
]);

function plain(value: unknown): unknown {
  if (value instanceof ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(plain);
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SETTLEMENT_BOOKKEEPING.has(key))
        .map(([key, child]) => [key, plain(child)])
    );
  }
  return value;
}

function economicState(inner: InMemoryDb, options: { ledger?: boolean } = {}) {
  const documents = (collection: string) =>
    [...inner.collection(collection).docs]
      .map((row) => plain(row) as Record<string, unknown>)
      .sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const ledger =
    options.ledger === false
      ? []
      : [...inner.collection("financialTxLog").docs]
          .map((row) => {
            const { _id: _ledgerId, ...copy } = plain(row) as Record<string, unknown> & {
              meta?: { loanId?: string; settlementId?: string };
            };
            if (copy.meta) {
              const { settlementId: _settlementId, ...meta } = copy.meta;
              copy.meta = meta;
            }
            return copy;
          })
          .sort((a, b) =>
            `${String((a.meta as { loanId?: string })?.loanId)}:${String(a.amount)}`.localeCompare(
              `${String((b.meta as { loanId?: string })?.loanId)}:${String(b.amount)}`
            )
          );
  return {
    characters: documents("characters"),
    corporations: documents("corporations"),
    centralBanks: documents("centralBanks"),
    funds: documents("depositInsuranceFunds"),
    sectors: documents("corporateSectors"),
    loans: documents("bankLoans"),
    ledger,
  };
}

/** One proxy that counts every collection call, which is one round trip. */
function countingDb(inner: InMemoryDb): { db: Db; total: () => number } {
  let total = 0;
  const db = new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop !== "collection") return Reflect.get(target, prop, receiver);
      return (name: string) =>
        new Proxy(target.collection(name), {
          get(collection, key) {
            const value = Reflect.get(collection, key, collection);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
              total += 1;
              return (value as (...callArgs: unknown[]) => unknown).apply(collection, args);
            };
          },
        });
    },
  }) as unknown as Db;
  return { db, total: () => total };
}

function row(world: InMemoryDb, collection: string, id: ObjectId | string) {
  return world.collection(collection).docs.find((doc) => {
    const value = doc._id as ObjectId | string | undefined;
    return value instanceof ObjectId ? value.equals(id) : value === id;
  }) as Record<string, unknown> | undefined;
}

/**
 * Three books on two dead banks.
 *
 * OPEN is an unresolved failed estate, so its instalments land in its own
 * reserves and its construction loans hold the bank epoch. CLOSED has already
 * been resolved and measured, so everything it recovers goes to the insurer.
 * Between them: a named character whose second loan sees the first one's
 * debit, a named corporation, two household tranches drawing on one short
 * pool, a tranche with an almost empty pool, a construction borrower with a
 * plain loan and a closing construction loan, one construction default, and a
 * construction loan recovered after the estate closed.
 */
function makeWorld(): InMemoryDb {
  const db = createInMemoryDb();
  db.seed("corporations", [
    {
      _id: OPEN,
      name: "Failed Open",
      countryId: "US",
      bankCharter: { ...charter("failed"), cashReserves: 100, totalLoans: 5_000 },
    },
    {
      _id: CLOSED,
      name: "Failed Closed",
      countryId: "US",
      bankCharter: {
        ...charter("failed", {
          depositorsResolvedTurn: 5,
          insuranceResolutionTurn: 5,
          insuranceMeasuredClaimTurn: 5,
        }),
        cashReserves: 0,
        totalLoans: 9_000,
      },
    },
    { _id: NAMED_CORP, name: "Named Corp", countryId: "US", liquidCapital: 60 },
    { _id: CONSTR_A, name: "Builder A", countryId: "US", liquidCapital: 450 },
    { _id: CONSTR_B, name: "Builder B", countryId: "US", liquidCapital: 0 },
    { _id: CONSTR_C, name: "Builder C", countryId: "US", liquidCapital: 100 },
  ]);
  db.seed("characters", [
    { _id: NAMED_CHAR, name: "Nadia", currencyBalances: { personal: { USD: 100 } } },
    { _id: CASH_LATE, name: "Late", currencyBalances: { personal: { USD: 25 } } },
  ]);
  db.seed("centralBanks", [{ _id: CB_US, externalBroadMoney: 70 }]);
  db.seed("depositInsuranceFunds", [
    {
      _id: "USD",
      balance: 0,
      insuredCap: 5_000_000,
      premiumsCollectedLifetime: 0,
      payoutsLifetime: 0,
      treasuryBackstopLifetime: 0,
      measuredGrossClaimsSincePricingStart: 0,
      measuredRecoveriesSincePricingStart: 0,
      measuredPaidClaimsSincePricingStart: 0,
      pricingEvidenceStartTurn: 5,
    },
  ]);
  db.seed("corporateSectors", [
    sector(SECTOR_FINAL, L_CONSTR_FINAL, OPEN, "claim-final"),
    sector(SECTOR_DEFAULT, L_CONSTR_DEFAULT, OPEN, "claim-default"),
    sector(SECTOR_LATE, L_CONSTR_LATE, CLOSED, "claim-late"),
  ]);
  db.seed("bankLoans", [
    // OPEN: two named character loans, each due 50 and 30 against 100.
    namedLoan(OPEN, "character", NAMED_CHAR, L_NAMED_A),
    namedLoan(OPEN, "character", NAMED_CHAR, L_NAMED_B, { outstanding: 300, principal: 300 }),
    // OPEN: a corporation due 50 against 60.
    namedLoan(OPEN, "corporation", NAMED_CORP, L_NAMED_CORP, {
      outstanding: 200,
      principal: 200,
      termTurns: 4,
    }),
    // OPEN: two household tranches share a 70 pool.
    npcLoan(OPEN, L_NPC_1),
    npcLoan(OPEN, L_NPC_2),
    // OPEN: a construction borrower with a plain loan and the loan that closes
    // its pledge, both in one borrower group and one pool of 450.
    namedLoan(OPEN, "corporation", CONSTR_A, L_CONSTR_PLAIN, {
      outstanding: 100,
      principal: 100,
      termTurns: 1,
    }),
    constructionLoan(OPEN, CONSTR_A, L_CONSTR_FINAL, SECTOR_FINAL, "claim-final", {
      outstanding: 300,
      principal: 300,
    }),
    // OPEN: a construction loan that cannot pay and defaults this turn.
    constructionLoan(OPEN, CONSTR_B, L_CONSTR_DEFAULT, SECTOR_DEFAULT, "claim-default", {
      outstanding: 500,
      principal: 500,
      arrearsTurns: 7,
      termTurns: 10,
    }),
    // CLOSED: a named loan and a construction loan, both partly paid into the
    // insurance fund and counted in its measured cohort.
    namedLoan(CLOSED, "character", CASH_LATE, L_NAMED_LATE),
    npcLoan(CLOSED, L_NPC_CLOSED, { outstanding: 600, principal: 600 }),
    constructionLoan(CLOSED, CONSTR_C, L_CONSTR_LATE, SECTOR_LATE, "claim-late", {
      outstanding: 400,
      principal: 400,
    }),
    // Already serviced this turn: nothing may touch it again.
    namedLoan(OPEN, "character", NAMED_CHAR, L_ALREADY, { lastProcessedTurn: TURN }),
  ]);
  return db;
}

describe("a dead bank's book, every shape, as journaled moves", () => {
  it("leaves exactly the state the per-loan path left", async () => {
    const batchedWorld = makeWorld();
    const perLoanWorld = makeWorld();
    const summary = await runBatched(batchedWorld as unknown as Db);
    await serviceBookPerLoan(perLoanWorld as unknown as Db);

    expect(economicState(batchedWorld)).toEqual(economicState(perLoanWorld));

    // Stated outright as well, so a shared mistake cannot hide in a green
    // comparison.
    const pool = row(batchedWorld, "centralBanks", CB_US) as { externalBroadMoney: number };
    // Short by design: the pool pays what it holds and the rest is capped.
    expect(pool.externalBroadMoney).toBeCloseTo(1.83, 2);

    // The closing construction payment released its pledge, the default marked
    // its own, and the recovered one kept its pledge for foreclosure.
    const released = row(batchedWorld, "corporateSectors", SECTOR_FINAL) as {
      constructionFinancing: { status: string };
    };
    expect(released.constructionFinancing.status).toBe("released");
    const defaulted = row(batchedWorld, "corporateSectors", SECTOR_DEFAULT) as {
      constructionFinancing: { status: string; defaultedTurn: number };
    };
    expect(defaulted.constructionFinancing.status).toBe("building");
    expect(defaulted.constructionFinancing.defaultedTurn).toBe(TURN);
    const retained = row(batchedWorld, "corporateSectors", SECTOR_LATE) as {
      constructionFinancing: { status: string; defaultedTurn?: number };
    };
    expect(retained.constructionFinancing.status).toBe("building");
    expect(retained.constructionFinancing.defaultedTurn).toBeUndefined();

    const closedLoan = row(batchedWorld, "bankLoans", L_CONSTR_FINAL) as Record<string, unknown>;
    expect(closedLoan).toMatchObject({ outstanding: 0, status: "repaid", lastProcessedTurn: TURN });
    const writtenOff = row(batchedWorld, "bankLoans", L_CONSTR_DEFAULT) as Record<string, unknown>;
    expect(writtenOff).toMatchObject({ status: "defaulted", lastProcessedTurn: TURN });

    // The unresolved estate took its borrowers' cash; the resolved one paid the
    // insurer that stood behind it, and its measured recoveries are the same
    // cash.
    const open = row(batchedWorld, "corporations", OPEN) as {
      bankCharter: { cashReserves: number };
    };
    expect(open.bankCharter.cashReserves).toBeCloseTo(682.44, 2);
    const fund = row(batchedWorld, "depositInsuranceFunds", "USD") as {
      balance: number;
      measuredRecoveriesSincePricingStart: number;
    };
    expect(fund.balance).toBeCloseTo(140.73, 2);
    expect(fund.measuredRecoveriesSincePricingStart).toBeCloseTo(fund.balance, 6);
    // The summary routes each recovery to where the cash actually landed.
    expect(summary.loansServiced).toBe(11);
    expect(summary.recoveredToEstate).toBeCloseTo(582.44, 2);
    expect(summary.recoveredToInsurer).toBeCloseTo(140.73, 2);
  });

  it("sums the household pool into one guarded debit per currency", async () => {
    const world = makeWorld();
    await runBatched(world as unknown as Db);
    const move = row(
      world,
      MONEY_MOVE_COLLECTION,
      `dead-bank-loan-service-batch:${OPEN.toHexString()}:1:${TURN}`
    ) as {
      legs: Array<{
        kind: string;
        collection: string;
        amount: number;
        filter?: { externalBroadMoney?: { $gte?: number } };
      }>;
    };
    // One debit for both tranches, guarded by exactly the amount it takes.
    const pool = move.legs.filter((leg) => leg.collection === "centralBanks");
    expect(pool).toHaveLength(1);
    expect(pool[0]!.kind).toBe("debit");
    expect(pool[0]!.amount).toBeGreaterThan(0);
    expect(pool[0]!.amount).toBeLessThan(70);
    expect(pool[0]!.filter?.externalBroadMoney?.$gte).toBe(pool[0]!.amount);

    // Both tranches were serviced against the running pool, not against the
    // same snapshot, and the pool was spent exactly once.
    const first = row(world, "bankLoans", L_NPC_1) as Record<string, unknown>;
    const second = row(world, "bankLoans", L_NPC_2) as Record<string, unknown>;
    expect(first.lastProcessedTurn).toBe(TURN);
    expect(second.lastProcessedTurn).toBe(TURN);
    expect(Number(first.outstanding)).toBeLessThan(1_000);
    expect(Number(second.outstanding)).toBeLessThan(1_000);
    expect(
      (row(world, "centralBanks", CB_US) as { externalBroadMoney: number }).externalBroadMoney
    ).toBeCloseTo(1.83, 2);
  });

  it("falls back to one loan at a time when the household guard refuses", async () => {
    const world = makeWorld();
    const moves = world.collection(MONEY_MOVE_COLLECTION);
    const insertOne = moves.insertOne.bind(moves);
    // Another writer drains the pool between the prefetch and the claim, which
    // is exactly what the pooled debit's guard exists to catch.
    let drained = false;
    moves.insertOne = (async (doc: Parameters<typeof insertOne>[0]) => {
      if (!drained) {
        drained = true;
        await world
          .collection("centralBanks")
          .updateOne({ _id: CB_US }, { $set: { externalBroadMoney: 0 } });
      }
      return insertOne(doc);
    }) as typeof moves.insertOne;

    const summary = await runBatched(world as unknown as Db);

    // The move was refused before it moved anything, so each loan retried on
    // its own key, including the household tranche, which then found an empty
    // pool and only advanced its record.
    const refused = row(
      world,
      MONEY_MOVE_COLLECTION,
      `dead-bank-loan-service-batch:${OPEN.toHexString()}:1:${TURN}`
    ) as { status: string; legs: Array<{ applied?: boolean }> };
    expect(refused.status).toBe("rejected");
    expect(refused.legs.every((leg) => leg.applied !== true)).toBe(true);
    for (const loanId of [L_NPC_1, L_NPC_2]) {
      expect(
        row(world, MONEY_MOVE_COLLECTION, `npc-loan-service:${loanId.toHexString()}:${TURN}`)
      ).toBeDefined();
      const tranche = row(world, "bankLoans", loanId) as Record<string, unknown>;
      expect(tranche.lastProcessedTurn).toBe(TURN);
      // No cash was there to pay it, so only the expected default moved it.
      expect(Number(tranche.outstanding)).toBeGreaterThan(999);
    }
    // Eleven serviced: the twelfth loan was stamped before the pass began.
    expect(summary.loansServiced).toBe(11);
  });

  it("counts round trips per loan before and after the batches", async () => {
    // The production shape: one big book of all three kinds, not a handful of
    // loans spread over two banks, so the fixed cost of a move is amortised the
    // way the turn amortises it.
    const makeBigBook = () => {
      const world = createInMemoryDb();
      const borrowers = freshIds(10);
      const builders = freshIds(10);
      const sectorIds = freshIds(10);
      const constructionIds = freshIds(10);
      world.seed("corporations", [
        {
          _id: OPEN,
          name: "Failed Open",
          countryId: "US",
          bankCharter: { ...charter("failed"), cashReserves: 0, totalLoans: 20_000 },
        },
        ...builders.map((id, index) => ({
          _id: id,
          name: `Builder ${index}`,
          countryId: "US",
          liquidCapital: 1_000,
        })),
      ]);
      world.seed(
        "characters",
        borrowers.map((id, index) => ({
          _id: id,
          name: `Borrower ${index}`,
          currencyBalances: { personal: { USD: 1_000 } },
        }))
      );
      world.seed("centralBanks", [{ _id: CB_US, externalBroadMoney: 10_000 }]);
      world.seed(
        "corporateSectors",
        sectorIds.map((id, index) => sector(id, constructionIds[index]!, OPEN, `claim-${index}`))
      );
      world.seed("bankLoans", [
        ...borrowers.map((id, index) =>
          namedLoan(OPEN, "character", id, new ObjectId(), {
            outstanding: 500,
            principal: 500,
            termTurns: 10 + index,
          })
        ),
        ...Array.from({ length: 7 }, (_, index) =>
          npcLoan(OPEN, new ObjectId(), { creditBand: undefined, ratePercent: 4 + index })
        ),
        ...builders.map((id, index) =>
          constructionLoan(OPEN, id, constructionIds[index]!, sectorIds[index]!, `claim-${index}`, {
            outstanding: 400,
            principal: 400,
            termTurns: 20,
          })
        ),
      ]);
      return world;
    };
    const LOANS = 27;

    const beforeWorld = makeBigBook();
    const before = countingDb(beforeWorld);
    const beforeStarted = Date.now();
    await serviceBookPerLoan(before.db);
    const beforeMs = Date.now() - beforeStarted;

    const afterWorld = makeBigBook();
    const after = countingDb(afterWorld);
    const afterStarted = Date.now();
    await runBatched(after.db);
    const afterMs = Date.now() - afterStarted;

    expect(beforeWorld.collection("bankLoans").docs).toHaveLength(LOANS);
    expect(afterWorld.collection("bankLoans").docs).toHaveLength(LOANS);
    expect(before.total()).toBeGreaterThan(after.total());
    expect(before.total() / LOANS).toBeGreaterThan(10);
    expect(after.total() / LOANS).toBeLessThan(8);
    console.log(
      `dead-bank book: ${before.total()} -> ${after.total()} round trips ` +
        `(${(before.total() / LOANS).toFixed(1)} -> ${(after.total() / LOANS).toFixed(1)} per loan), ` +
        `${beforeMs} ms -> ${afterMs} ms`
    );
  });
});

/**
 * A crash at every point the journal can stop at. Each run is resumed the way
 * the turn's own recovery does it: a claim that landed is finished from its
 * record, and a lease that outlived its pass is reaped before the next one
 * starts.
 */
describe("a crashed dead-bank move resumes to the per-loan outcome", () => {
  const NPC_CHAR = new ObjectId();
  const NPC_LOAN = new ObjectId();
  const BUILDER = new ObjectId();
  const FINAL_SECTOR = new ObjectId();
  const DEFAULT_BUILDER = new ObjectId();
  const DEFAULT_SECTOR = new ObjectId();
  const FINAL_LOAN = new ObjectId();
  const DEFAULT_LOAN = new ObjectId();
  const RESOLVED_BUILDER = new ObjectId();
  const RESOLVED_SECTOR = new ObjectId();
  const RESOLVED_LOAN = new ObjectId();

  /** A named loan and a household tranche: the one move they share. */
  function makeNamedCrashWorld(): InMemoryDb {
    const db = createInMemoryDb();
    db.seed("corporations", [
      {
        _id: OPEN,
        name: "Failed Open",
        countryId: "US",
        bankCharter: { ...charter("failed"), cashReserves: 0 },
      },
      { _id: NPC_CHAR, name: "Payee", countryId: "US" },
    ]);
    db.seed("characters", [
      { _id: NPC_CHAR, name: "Payee", currencyBalances: { personal: { USD: 100 } } },
    ]);
    db.seed("centralBanks", [{ _id: CB_US, externalBroadMoney: 40 }]);
    db.seed("bankLoans", [
      namedLoan(OPEN, "character", NPC_CHAR, NPC_LOAN),
      npcLoan(OPEN, L_NPC_1, { outstanding: 200, principal: 200 }),
    ]);
    return db;
  }

  /** A closing construction loan and a defaulting one: one construction move. */
  function makeConstructionCrashWorld(): InMemoryDb {
    const db = createInMemoryDb();
    db.seed("corporations", [
      {
        _id: OPEN,
        name: "Failed Open",
        countryId: "US",
        bankCharter: { ...charter("failed"), cashReserves: 0 },
      },
      { _id: BUILDER, name: "Builder", countryId: "US", liquidCapital: 200 },
      { _id: DEFAULT_BUILDER, name: "Defaulting Builder", countryId: "US", liquidCapital: 0 },
    ]);
    db.seed("corporateSectors", [
      sector(FINAL_SECTOR, FINAL_LOAN, OPEN, "claim-final"),
      sector(DEFAULT_SECTOR, DEFAULT_LOAN, OPEN, "claim-default"),
    ]);
    db.seed("bankLoans", [
      constructionLoan(OPEN, BUILDER, FINAL_LOAN, FINAL_SECTOR, "claim-final", {
        outstanding: 100,
        principal: 100,
      }),
      constructionLoan(OPEN, DEFAULT_BUILDER, DEFAULT_LOAN, DEFAULT_SECTOR, "claim-default", {
        outstanding: 100,
        principal: 100,
        arrearsTurns: 7,
      }),
    ]);
    return db;
  }

  /** A construction loan on an estate that has already been resolved. */
  function makeResolvedCrashWorld(): InMemoryDb {
    const db = createInMemoryDb();
    db.seed("corporations", [
      {
        _id: RESOLVED,
        name: "Resolved",
        countryId: "US",
        bankCharter: {
          ...charter("failed", { depositorsResolvedTurn: 5, insuranceResolutionTurn: 5 }),
          cashReserves: 0,
        },
      },
      { _id: RESOLVED_BUILDER, name: "Late Builder", countryId: "US", liquidCapital: 200 },
    ]);
    db.seed("depositInsuranceFunds", [{ _id: "USD", balance: 0, pricingEvidenceStartTurn: 999 }]);
    db.seed("corporateSectors", [sector(RESOLVED_SECTOR, RESOLVED_LOAN, RESOLVED, "claim-late")]);
    db.seed("bankLoans", [
      constructionLoan(RESOLVED, RESOLVED_BUILDER, RESOLVED_LOAN, RESOLVED_SECTOR, "claim-late", {
        outstanding: 100,
        principal: 100,
      }),
    ]);
    return db;
  }

  function planAt(
    log: { collection: string; op: string }[],
    index: number,
    afterWrite: boolean
  ): FaultPlan {
    const entry = log[index]!;
    const onCall = log
      .slice(0, index + 1)
      .filter((row) => row.collection === entry.collection && row.op === entry.op).length;
    return {
      collection: entry.collection,
      op: entry.op as FaultPlan["op"],
      onCall,
      afterWrite,
    };
  }

  it("finishes the named and household move from every journal stop", async () => {
    const clean = makeNamedCrashWorld();
    await runBatched(clean as unknown as Db);
    const log = await (async () => {
      const probe = withInjectedCrash(makeNamedCrashWorld(), {
        collection: "__never__",
        op: "updateOne",
        onCall: 1,
      });
      await runBatched(probe.db);
      return probe.log;
    })();

    const batchKey = `dead-bank-loan-service-batch:${OPEN.toHexString()}:1:${TURN}`;
    const claimIndex = log.findIndex(
      (entry) => entry.collection === MONEY_MOVE_COLLECTION && entry.op === "insertOne"
    );
    const poolDebitIndex = log.findIndex(
      (entry) => entry.collection === "centralBanks" && entry.op === "updateOne"
    );
    const loanProjectionIndex = log.findIndex(
      (entry) => entry.collection === "bankLoans" && entry.op === "updateOne"
    );
    let completionIndex = -1;
    for (let i = log.length - 1; i >= 0; i -= 1)
      if (log[i]!.collection === MONEY_MOVE_COLLECTION && log[i]!.op === "updateOne") {
        completionIndex = i;
        break;
      }
    for (const index of [claimIndex, poolDebitIndex, loanProjectionIndex, completionIndex])
      expect(index).toBeGreaterThanOrEqual(0);

    const stages: [string, FaultPlan][] = [
      ["after the claim", planAt(log, claimIndex, true)],
      ["after the pooled household debit", planAt(log, poolDebitIndex, true)],
      ["after a loan record", planAt(log, loanProjectionIndex, true)],
      ["after the journal completes", planAt(log, completionIndex, true)],
    ];

    for (const [label, plan] of stages) {
      const crashed = makeNamedCrashWorld();
      const faulty = withInjectedCrash(crashed, plan);
      await expect(runBatched(faulty.db), label).rejects.toThrow();
      faulty.disarm();

      const resumed = await resumeSettlement(crashed as unknown as Db, batchKey);
      expect(["applied", "replayed"], label).toContain(resumed.status);
      expect(economicState(crashed, { ledger: false }), label).toEqual(
        economicState(clean, { ledger: false })
      );

      const again = await resumeSettlement(crashed as unknown as Db, batchKey);
      expect(["applied", "replayed"], label).toContain(again.status);
      expect(economicState(crashed, { ledger: false }), label).toEqual(
        economicState(clean, { ledger: false })
      );
    }
  });

  it("finishes the construction move from every journal stop", async () => {
    const clean = makeConstructionCrashWorld();
    await runBatched(clean as unknown as Db);
    const log = await (async () => {
      const probe = withInjectedCrash(makeConstructionCrashWorld(), {
        collection: "__never__",
        op: "updateOne",
        onCall: 1,
      });
      await runBatched(probe.db);
      return probe.log;
    })();

    // Every write of the pass: the lease, the locks, the claim, the debit, the
    // credit, each loan and pledge projection, and the completion.
    expect(log.length).toBeGreaterThan(5);
    const stages: [string, FaultPlan][] = log.map((entry, index) => [
      `after ${index + 1}: ${entry.collection}.${entry.op}`,
      planAt(log, index, true),
    ]);

    for (const [label, plan] of stages) {
      const crashed = makeConstructionCrashWorld();
      const faulty = withInjectedCrash(crashed, plan);
      await expect(runBatched(faulty.db), label).rejects.toThrow();
      faulty.disarm();

      // The next turn's recovery reaps the lease and finishes its journal; a
      // claim that never landed leaves nothing to finish, so the pass retries.
      await recoverConstructionServiceLeases(crashed as unknown as Db, TURN + 1);
      await runBatched(crashed as unknown as Db);
      expect(economicState(crashed, { ledger: false }), label).toEqual(
        economicState(clean, { ledger: false })
      );
      // Nothing is left holding the bank epoch or the loans.
      expect(
        (row(crashed, "corporations", OPEN) as { bankConstructionFunding?: unknown })
          .bankConstructionFunding,
        label
      ).toBeUndefined();
      expect(
        (row(crashed, "bankLoans", FINAL_LOAN) as { constructionSettlementOwner?: string })
          .constructionSettlementOwner,
        label
      ).toBeUndefined();
    }
  });

  it("frees a construction lock a crash left before the claim", async () => {
    // A resolved bank takes no lease, so only the next pass can tell that the
    // lock it left belongs to a move that never claimed its journal.
    const clean = makeResolvedCrashWorld();
    await runBatched(clean as unknown as Db, TURN + 1);

    const crashed = makeResolvedCrashWorld();
    const faulty = withInjectedCrash(crashed, {
      collection: "bankLoans",
      op: "updateMany",
      onCall: 1,
      afterWrite: true,
    });
    await expect(runBatched(faulty.db)).rejects.toThrow();
    faulty.disarm();
    // The lock landed; no journal did.
    expect(
      (row(crashed, "bankLoans", RESOLVED_LOAN) as { constructionSettlementOwner?: string })
        .constructionSettlementOwner
    ).toBe(`dead-bank-construction-service-batch:${RESOLVED.toHexString()}:1:${TURN}`);
    expect(crashed.collection(MONEY_MOVE_COLLECTION).docs).toHaveLength(0);

    await runBatched(crashed as unknown as Db, TURN + 1);
    expect(
      (row(crashed, "bankLoans", RESOLVED_LOAN) as { constructionSettlementOwner?: string })
        .constructionSettlementOwner
    ).toBeUndefined();
    expect(economicState(crashed, { ledger: false })).toEqual(
      economicState(clean, { ledger: false })
    );
  });
});
