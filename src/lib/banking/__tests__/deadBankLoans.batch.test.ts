/**
 * A dead bank's loan book in one journaled move.
 *
 * The per-loan path paid the whole delivery chain per loan: a claim, a debit,
 * a credit, the loan record and an acknowledgement for each write. A wound-up
 * bank with hundreds of loans therefore spent thousands of round trips on one
 * turn stage. The batch keeps the same decisions, the same money and the same
 * loan records, and pays that chain once for the book.
 *
 * These tests pin the three things that can only be seen by comparison: that
 * the batch leaves exactly the state the per-loan path left, that a crash at
 * any point the journal can stop at resumes to the same state, and what the
 * change is worth in round trips.
 */

import { afterEach, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash, type FaultPlan, type WriteOp } from "@/lib/test-utils/faultyDb";
import { resetRecordAuditBufferForTest } from "@/lib/audit/recordAudit";
import type { BankLoan } from "@/lib/db/types/bank";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { MONEY_MOVE_COLLECTION } from "@/lib/banking/moneyMove";
import { ensureFund } from "@/lib/banking/insurance";
import { resumeSettlement } from "@/lib/banking/settlementJournal";
import {
  findDeadBanksWithLoans,
  processDeadBankLoans,
  recoveryTargetFor,
  type DeadBankLoanSummary,
} from "@/lib/banking/deadBankLoans";
import { servicePlayerLoan } from "@/lib/banking/namedLoanBook";
import { loanServiceTransition } from "@/lib/banking/rules/loanServicing";
import { batchedLoanServiceMove } from "@/lib/banking/loanServiceBatch";
import { emitTxBulk, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";

const TURN = 55;
const OPEN = new ObjectId();
const CLOSED = new ObjectId();
const LIVE = new ObjectId();

const C1 = new ObjectId();
const C2 = new ObjectId();
const C3 = new ObjectId();
const C4 = new ObjectId();
const C5 = new ObjectId();

const ids = (count: number) => Array.from({ length: count }, () => new ObjectId());
const LOAN_IDS = ids(12);
const BOOK_IDS = ids(20);
const CURRENCY_IDS = {
  character: new ObjectId(),
  corporation: new ObjectId(),
  characterLoan: new ObjectId(),
  usdLoan: new ObjectId(),
  eurLoan: new ObjectId(),
};

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

function character(name: string, balance: number) {
  return { name, currencyBalances: { personal: { USD: balance } } };
}

function loan(
  bankId: ObjectId,
  borrowerType: "character" | "corporation",
  borrowerId: ObjectId,
  id: ObjectId,
  overrides: Partial<BankLoan> = {}
): BankLoan {
  return {
    _id: id,
    bankCorporationId: bankId,
    charteredTurn: 1,
    borrowerType,
    borrowerId,
    currency: "USD",
    principal: 1_000,
    outstanding: 1_000,
    ratePercent: 0,
    termTurns: 20,
    originatedTurn: 55,
    status: "current",
    ...overrides,
  } as BankLoan;
}

/**
 * Two dead banks and a live one. Every loan shape that moves differently is
 * present once: a full payment, a partial that turns into a default, a loan
 * that has to see its borrower's earlier debit, a closed loan, and a borrower
 * with loans at both dead banks.
 */
function makeWorld(): InMemoryDb {
  const db = createInMemoryDb();
  db.seed("corporations", [
    {
      _id: OPEN,
      name: "Failed Open",
      countryId: "US",
      bankCharter: { ...charter("failed"), cashReserves: 100, totalLoans: 3_000 },
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
        totalLoans: 9_999,
      },
    },
    { _id: LIVE, name: "Live", countryId: "US", bankCharter: charter("active") },
    { _id: C2, name: "Second Borrower", countryId: "US", liquidCapital: 500 },
    { _id: C5, name: "Cross Bank Borrower", countryId: "US", liquidCapital: 60 },
  ]);
  db.seed("characters", [
    { _id: C1, ...character("Casey", 70) },
    { _id: C3, ...character("Cleo", 1_000) },
    { _id: C4, ...character("Cory", 20) },
  ]);
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
  db.seed("bankLoans", [
    // C1 pays the first instalment and then defaults on the second, with the
    // second loan seeing exactly what the first left behind.
    loan(OPEN, "character", C1, LOAN_IDS[0]),
    loan(OPEN, "character", C1, LOAN_IDS[1], { arrearsTurns: 7 }),
    // One corporation with two loans and one already closed: its debit is the
    // sum of both payments, and the closed loan moves no cash at all.
    loan(OPEN, "corporation", C2, LOAN_IDS[2]),
    loan(OPEN, "corporation", C2, LOAN_IDS[3], { outstanding: 2_000, principal: 2_000 }),
    loan(OPEN, "corporation", C2, LOAN_IDS[4], { outstanding: 0, principal: 0 }),
    // Recovered after the estate closed, so the payment lands in the fund and
    // counts in the measured cohort.
    loan(CLOSED, "character", C3, LOAN_IDS[5], { ratePercent: 6 }),
    loan(CLOSED, "character", C4, LOAN_IDS[6], { ratePercent: 6 }),
    // The same corporation borrows at both dead banks: the second book must see
    // the first book's debit.
    loan(OPEN, "corporation", C5, LOAN_IDS[7]),
    loan(CLOSED, "corporation", C5, LOAN_IDS[8], { outstanding: 500, principal: 500 }),
    // Neither of these is serviced this turn: one already stamped, one written
    // off. The live bank's loan belongs to the normal pass.
    loan(OPEN, "character", C1, LOAN_IDS[9], { lastProcessedTurn: TURN }),
    loan(OPEN, "character", C1, LOAN_IDS[10], { status: "defaulted" }),
    loan(LIVE, "character", C1, LOAN_IDS[11]),
  ]);
  return db;
}

/** The servicing closure the banking turn injects. */
async function runBatched(db: Db): Promise<DeadBankLoanSummary> {
  return processDeadBankLoans(
    db,
    TURN,
    async (loanRow, bank, target, trackInsuranceRecovery, txEntries, prefetch) => {
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
 * The per-loan path this change replaced: one settlement per loan, serial,
 * against the cohort-wide borrower read goal 4 introduced. It is the oracle the
 * batch is compared against, and it is still the path every loan the batch
 * cannot express takes.
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
  const borrowerState = new Map<string, { available: number; name: string }>();
  const byCharacter = new Map(characters.map((row) => [String(row._id), row]));
  const byCorporation = new Map(corporations.map((row) => [String(row._id), row]));
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

  const funds = new Map<CurrencyCode, Awaited<ReturnType<typeof ensureFund>>>();
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
 * batch changes those, and only those; everything economic has to match.
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
    funds: documents("depositInsuranceFunds"),
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

describe("a dead bank's book in one journaled move", () => {
  it("leaves exactly the state the per-loan path left", async () => {
    const batchedWorld = makeWorld();
    const perLoanWorld = makeWorld();
    const summary = await runBatched(batchedWorld as unknown as Db);
    await serviceBookPerLoan(perLoanWorld as unknown as Db);

    expect(economicState(batchedWorld)).toEqual(economicState(perLoanWorld));

    // The same fixture, stated outright so a shared mistake in both paths
    // cannot hide inside a green comparison.
    const c1 = batchedWorld.collection("characters").docs.find((row) => row._id.equals(C1)) as {
      currencyBalances: { personal: { USD: number } };
    };
    expect(c1.currencyBalances.personal.USD).toBe(0);
    const open = batchedWorld
      .collection("corporations")
      .docs.find((row) => row._id.equals(OPEN)) as {
      bankCharter: { cashReserves: number; totalLoans: number };
    };
    expect(open.bankCharter.cashReserves).toBe(370);
    expect(open.bankCharter.totalLoans).toBe(1_750);
    const fund = batchedWorld
      .collection("depositInsuranceFunds")
      .docs.find((row) => row._id === "USD") as {
      balance: number;
      measuredRecoveriesSincePricingStart: number;
    };
    expect(fund.balance).toBe(81.25);
    expect(fund.measuredRecoveriesSincePricingStart).toBe(81.25);
    const closedBank = batchedWorld
      .collection("corporations")
      .docs.find((row) => row._id.equals(CLOSED)) as {
      bankCharter: { cashReserves: number; totalLoans: number };
    };
    // No cached loan total moves for a book recovered by the insurer.
    expect(closedBank.bankCharter.totalLoans).toBe(9_999);
    expect(closedBank.bankCharter.cashReserves).toBe(0);
    const defaulted = batchedWorld
      .collection("bankLoans")
      .docs.find((row) => row._id.equals(LOAN_IDS[1])) as Record<string, unknown>;
    expect(defaulted).toMatchObject({
      outstanding: 980,
      status: "defaulted",
      arrearsTurns: 8,
      lastProcessedTurn: TURN,
    });
    expect(summary.loansServiced).toBe(9);
    expect(summary.recoveredToEstate).toBe(270);
    expect(summary.recoveredToInsurer).toBe(81.25);
    expect(summary.interestCollected).toBeCloseTo(2.5, 6);
  });

  it("charges each borrower's later loans against the earlier debit", async () => {
    const batchedWorld = makeWorld();
    const perLoanWorld = makeWorld();
    await runBatched(batchedWorld as unknown as Db);
    await serviceBookPerLoan(perLoanWorld as unknown as Db);

    const balance = (world: InMemoryDb, id: ObjectId) => {
      const row = world.collection("characters").docs.find((doc) => doc._id.equals(id)) as {
        currencyBalances: { personal: { USD: number } };
      };
      return row.currencyBalances.personal.USD;
    };
    // Two instalments of 50 due against 70 of cash: a stale balance would have
    // taken the second 50 in full as well.
    expect(balance(batchedWorld, C1)).toBe(0);
    expect(balance(perLoanWorld, C1)).toBe(0);
    const crossBank = batchedWorld
      .collection("corporations")
      .docs.find((row) => row._id.equals(C5)) as { liquidCapital: number };
    expect(crossBank.liquidCapital).toBe(0);
  });

  it("keeps one debit leg per borrower, not one for the book", () => {
    const bankId = new ObjectId();
    const borrowerA = new ObjectId();
    const borrowerB = new ObjectId();
    const target = {
      collection: "corporations",
      filter: { _id: bankId },
      path: "bankCharter.cashReserves",
      note: "test",
    };
    const row = (borrowerId: ObjectId, id: ObjectId) => {
      const loanRow = loan(bankId, "corporation", borrowerId, id);
      const { decision, transition } = loanServiceTransition({
        loan: loanRow,
        borrowerAvailable: 100,
        turn: TURN,
        creditTarget: target,
        bankId: bankId.toString(),
      });
      return { loan: loanRow, decision, transition, borrowerKey: String(borrowerId) };
    };
    const move = batchedLoanServiceMove(
      [row(borrowerA, new ObjectId()), row(borrowerB, new ObjectId())],
      target,
      { totalLoansFilter: { _id: bankId } }
    );

    // Rules-zone legs address their target with `{ $oid }` refs; keying the
    // merge on the object's string form would debit the whole book from the
    // first borrower.
    const debits = move.legs.filter((leg) => leg.kind === "debit");
    expect(debits).toHaveLength(2);
    expect(new Set(debits.map((debit) => (debit.filter!._id as { $oid: string }).$oid))).toEqual(
      new Set([borrowerA.toHexString(), borrowerB.toHexString()])
    );
    expect(debits.map((debit) => debit.amount).sort()).toEqual([50, 50]);
    const credit = move.legs.find((leg) => leg.kind === "credit")!;
    expect(credit.amount).toBe(100);
    // Both loans' cached-total increments fold into one projection.
    expect(
      move.projections.filter((projection) => projection.collection === "corporations")
    ).toHaveLength(1);
    expect(
      move.projections.filter((projection) => projection.collection === "bankLoans")
    ).toHaveLength(2);
  });

  it("keeps a corporation's cross-currency book on the per-loan path", async () => {
    // The prefetch models a corporation's treasury once per loan currency, so a
    // group spanning currencies would spend the same cash twice if summed.
    const makeCrossCurrencyWorld = () => {
      const world = createInMemoryDb();
      world.seed("corporations", [
        {
          _id: OPEN,
          name: "Failed Open",
          countryId: "US",
          bankCharter: { ...charter("failed"), cashReserves: 0, totalLoans: 2_000 },
        },
        {
          _id: CURRENCY_IDS.corporation,
          name: "Cross Currency",
          countryId: "US",
          liquidCapital: 70,
        },
      ]);
      world.seed("characters", [{ _id: CURRENCY_IDS.character, ...character("Usd Only", 100) }]);
      world.seed("bankLoans", [
        loan(OPEN, "character", CURRENCY_IDS.character, CURRENCY_IDS.characterLoan),
        loan(OPEN, "corporation", CURRENCY_IDS.corporation, CURRENCY_IDS.usdLoan),
        loan(OPEN, "corporation", CURRENCY_IDS.corporation, CURRENCY_IDS.eurLoan, {
          currency: "EUR",
        }),
      ]);
      return world;
    };

    const batchedWorld = makeCrossCurrencyWorld();
    const perLoanWorld = makeCrossCurrencyWorld();
    await runBatched(batchedWorld as unknown as Db);
    await serviceBookPerLoan(perLoanWorld as unknown as Db);

    expect(economicState(batchedWorld)).toEqual(economicState(perLoanWorld));
    const corporation = batchedWorld
      .collection("corporations")
      .docs.find((row) => row._id.equals(CURRENCY_IDS.corporation)) as { liquidCapital: number };
    // The first currency's instalment landed; the second was refused by its
    // debit guard, exactly as the per-loan path refused it before this change.
    expect(corporation.liquidCapital).toBe(20);
    const eurLoan = batchedWorld
      .collection("bankLoans")
      .docs.find((row) => row._id.equals(CURRENCY_IDS.eurLoan)) as Record<string, unknown>;
    expect(eurLoan.outstanding).toBe(1_000);
    expect(eurLoan.lastProcessedTurn).toBeUndefined();
    const keys = batchedWorld.collection(MONEY_MOVE_COLLECTION).docs.map((row) => row._id);
    expect(keys).toContain(`dead-bank-loan-service-batch:${OPEN.toHexString()}:1:${TURN}`);
    expect(keys).toContain(`loan-service:${CURRENCY_IDS.eurLoan.toHexString()}:${TURN}`);
  });

  it("counts round trips per loan before and after the batch", async () => {
    const makeBook = () => {
      const world = createInMemoryDb();
      world.seed("corporations", [
        {
          _id: OPEN,
          name: "Failed Open",
          countryId: "US",
          bankCharter: { ...charter("failed"), cashReserves: 0, totalLoans: 20_000 },
        },
        ...BOOK_IDS.map((id, index) => ({
          _id: id,
          name: `Borrower ${index}`,
          countryId: "US",
          liquidCapital: 100,
        })),
      ]);
      world.seed(
        "bankLoans",
        BOOK_IDS.map((id, index) =>
          loan(OPEN, "corporation", id, new ObjectId(), {
            outstanding: 1_000,
            principal: 1_000,
            originatedTurn: 55,
            termTurns: 20 + index,
          })
        )
      );
      return world;
    };

    const beforeWorld = makeBook();
    const before = countingDb(beforeWorld);
    await serviceBookPerLoan(before.db);

    const afterWorld = makeBook();
    const after = countingDb(afterWorld);
    await runBatched(after.db);

    expect(beforeWorld.collection("bankLoans").docs).toHaveLength(20);
    expect(afterWorld.collection("bankLoans").docs).toHaveLength(20);
    // Measured on this fixture: 509 calls before the batch, 130 after, so
    // 25.5 round trips per loan become 6.5. What remains per loan is the loan
    // record's own protected projection, which the journal cannot merge.
    expect(after.total()).toBeLessThan(before.total());
    expect(before.total() / 20).toBeGreaterThan(20);
    expect(after.total() / 20).toBeLessThan(8);
  });
});

/**
 * A crash at every point the journal can stop at. Each run is resumed the way
 * the turn's own recovery does it: a claim that never landed is simply retried,
 * and a claim that landed is finished from its record.
 */
describe("a crashed dead-bank batch resumes to the per-loan outcome", () => {
  const OPEN_CHARACTERS = ids(5);
  const OPEN_CORPORATIONS = ids(2);
  const CRASH_LOAN_IDS = ids(7);

  function makeCrashWorld(): InMemoryDb {
    const db = createInMemoryDb();
    db.seed("corporations", [
      {
        _id: OPEN,
        name: "Failed Open",
        countryId: "US",
        bankCharter: { ...charter("failed"), cashReserves: 0, totalLoans: 0 },
      },
      ...OPEN_CORPORATIONS.map((id, index) => ({
        _id: id,
        name: `Corporation ${index}`,
        countryId: "US",
        liquidCapital: 100,
      })),
    ]);
    db.seed(
      "characters",
      OPEN_CHARACTERS.map((id, index) => ({ _id: id, ...character(`Character ${index}`, 100) }))
    );
    db.seed("bankLoans", [
      ...OPEN_CHARACTERS.map((id, index) =>
        loan(OPEN, "character", id, CRASH_LOAN_IDS[index]!, {
          originatedTurn: 55,
          termTurns: 20 + index,
        })
      ),
      ...OPEN_CORPORATIONS.map((id, index) =>
        loan(OPEN, "corporation", id, CRASH_LOAN_IDS[OPEN_CHARACTERS.length + index]!, {
          originatedTurn: 55,
          termTurns: 20 + index,
        })
      ),
    ]);
    return db;
  }

  const batchKey = `dead-bank-loan-service-batch:${OPEN.toHexString()}:1:${TURN}`;

  function planAt(
    log: { collection: string; op: WriteOp }[],
    index: number,
    afterWrite: boolean
  ): FaultPlan {
    const entry = log[index]!;
    const onCall = log
      .slice(0, index + 1)
      .filter((row) => row.collection === entry.collection && row.op === entry.op).length;
    return { collection: entry.collection, op: entry.op, onCall, afterWrite };
  }

  it("resumes from a claim that never landed by retrying the pass", async () => {
    const crashed = makeCrashWorld();
    const clean = makeCrashWorld();
    await runBatched(clean as unknown as Db);

    const faulty = withInjectedCrash(crashed, {
      collection: MONEY_MOVE_COLLECTION,
      op: "insertOne",
      onCall: 1,
    });
    await expect(runBatched(faulty.db)).rejects.toThrow();
    faulty.disarm();
    expect(crashed.collection(MONEY_MOVE_COLLECTION).docs).toHaveLength(0);

    await runBatched(crashed as unknown as Db);
    // A retry after an unclaimed pass pays the ledger rows too, because the
    // batch itself still applies.
    expect(economicState(crashed)).toEqual(economicState(clean));
  });

  it("resumes from every stop inside the journal", async () => {
    const clean = makeCrashWorld();
    await runBatched(clean as unknown as Db);

    const probe = withInjectedCrash(makeCrashWorld(), {
      collection: "__never__",
      op: "updateOne",
      onCall: 1,
    });
    await runBatched(probe.db);
    const log = probe.log;

    const claimIndex = log.findIndex(
      (entry) => entry.collection === MONEY_MOVE_COLLECTION && entry.op === "insertOne"
    );
    const debitBulkIndex = log.findIndex(
      (entry) => entry.collection === "characters" && entry.op === "bulkWrite"
    );
    const corporationDebitIndex = log.findIndex(
      (entry) => entry.collection === "corporations" && entry.op === "updateOne"
    );
    const projectionIndex = log.findIndex(
      (entry) => entry.collection === "bankLoans" && entry.op === "updateOne"
    );
    let completionIndex = -1;
    for (let i = log.length - 1; i >= 0; i -= 1)
      if (log[i]!.collection === MONEY_MOVE_COLLECTION && log[i]!.op === "updateOne") {
        completionIndex = i;
        break;
      }
    for (const index of [
      claimIndex,
      debitBulkIndex,
      corporationDebitIndex,
      projectionIndex,
      completionIndex,
    ])
      expect(index).toBeGreaterThanOrEqual(0);

    const stages: [string, FaultPlan][] = [
      ["after the claim", planAt(log, claimIndex, true)],
      ["after the batched debits", planAt(log, debitBulkIndex, true)],
      ["after a corporation debit", planAt(log, corporationDebitIndex, true)],
      [
        "after the summed credit",
        {
          collection: "corporations",
          op: "updateOne",
          onCall: 1,
          afterWrite: true,
          matches: (args: unknown[]) =>
            JSON.stringify(args[1] ?? {}).includes("bankCharter.cashReserves"),
        },
      ],
      ["after the first loan record", planAt(log, projectionIndex, true)],
      ["after the journal completes", planAt(log, completionIndex, true)],
    ];

    for (const [label, plan] of stages) {
      const crashed = makeCrashWorld();
      const faulty = withInjectedCrash(crashed, plan);
      await expect(runBatched(faulty.db), label).rejects.toThrow();
      faulty.disarm();

      const resumed = await resumeSettlement(crashed as unknown as Db, batchKey);
      expect(["applied", "replayed"], label).toContain(resumed.status);
      // The ledger row is written once after the journal applies, on the
      // per-loan path as on this one; a crash between the two is the same
      // at-most-once window and is not compared here.
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
});
