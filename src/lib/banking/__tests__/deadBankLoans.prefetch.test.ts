/**
 * Dead-bank loans are serviced from one borrower read for the whole cohort.
 *
 * The serial path read the borrower once per loan. Batching those reads into
 * one query per collection is only safe if the decisions still see the running
 * balance a borrower's earlier loan left behind, so this pins that: the same
 * fixture serviced through the prefetched path must produce exactly the loans,
 * cash and summary the per-loan reads produced.
 */
import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { BankLoan } from "@/lib/db/types/bank";
import type { Corporation } from "@/lib/db/types";
import { MONEY_MOVE_COLLECTION } from "@/lib/banking/moneyMove";
import { processDeadBankLoans } from "@/lib/banking/deadBankLoans";
import { servicePlayerLoan } from "@/lib/banking/namedLoanBook";

const DEAD_BANK = new ObjectId();
const OTHER_DEAD_BANK = new ObjectId();
const BORROWER = new ObjectId();
const SECOND_BORROWER = new ObjectId();
const TURN = 55;

function charter(extra: Record<string, unknown> = {}) {
  return {
    type: "retail",
    status: "failed",
    currency: "USD",
    charteredTurn: 1,
    cashReserves: 0,
    ...extra,
  };
}

function loan(
  bankId: ObjectId,
  borrowerId: ObjectId,
  id: ObjectId,
  overrides: Partial<BankLoan> = {}
): BankLoan {
  return {
    _id: id,
    bankCorporationId: bankId,
    charteredTurn: 1,
    borrowerType: "corporation",
    borrowerId,
    currency: "USD",
    principal: 1_000,
    outstanding: 1_000,
    ratePercent: 6,
    termTurns: 20,
    originatedTurn: 1,
    status: "current",
    ...overrides,
  } as BankLoan;
}

// Fixed ids: the two runs below must be comparable document for document.
const LOAN_IDS = [0, 1, 2, 3].map(() => new ObjectId());

function makeWorld(): InMemoryDb {
  const db = createInMemoryDb();
  db.seed("corporations", [
    { _id: DEAD_BANK, name: "Failed One", countryId: "US", bankCharter: charter() },
    {
      _id: OTHER_DEAD_BANK,
      name: "Failed Two",
      countryId: "US",
      bankCharter: charter(),
    },
    { _id: BORROWER, name: "Borrower Corp", countryId: "US", liquidCapital: 70 },
    { _id: SECOND_BORROWER, name: "Second Borrower", countryId: "US", liquidCapital: 400 },
  ]);
  db.seed("depositInsuranceFunds", [{ _id: "USD", balance: 0 }]);
  // Two loans to the same borrower in one dead book (the second must see the
  // first one's debit), one to another borrower, one in the other dead book.
  db.seed("bankLoans", [
    loan(DEAD_BANK, BORROWER, LOAN_IDS[0]),
    loan(DEAD_BANK, BORROWER, LOAN_IDS[1]),
    loan(DEAD_BANK, SECOND_BORROWER, LOAN_IDS[2]),
    loan(OTHER_DEAD_BANK, BORROWER, LOAN_IDS[3]),
  ] as unknown as Parameters<InMemoryDb["seed"]>[1]);
  return db;
}

/**
 * Count the collection calls a run makes. One call per operation is the shape
 * of a database round trip, which is what the batching is here to remove.
 */
function countingDb(inner: InMemoryDb): {
  db: Db;
  total: () => number;
  of: (op: string) => number;
} {
  const counts = new Map<string, number>();
  const counted = new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop !== "collection") return Reflect.get(target, prop, receiver);
      return (name: string) =>
        new Proxy(target.collection(name), {
          get(collection, key) {
            const value = Reflect.get(collection, key, collection);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
              const label = `${name}.${String(key)}`;
              counts.set(label, (counts.get(label) ?? 0) + 1);
              return (value as (...callArgs: unknown[]) => unknown).apply(collection, args);
            };
          },
        });
    },
  });
  return {
    db: counted as unknown as Db,
    total: () => [...counts.values()].reduce((sum, count) => sum + count, 0),
    of: (op: string) => counts.get(op) ?? 0,
  };
}

async function run(usePrefetchedBorrower: boolean) {
  const inner = makeWorld();
  const counted = countingDb(inner);
  const summary = await processDeadBankLoans(
    counted.db,
    TURN,
    async (loanRow, bank, target, trackInsuranceRecovery, _txEntries, prefetch) => {
      const serviced = await servicePlayerLoan(
        counted.db,
        TURN,
        bank.corporationId,
        loanRow,
        bank.currency,
        bank.name,
        target,
        trackInsuranceRecovery,
        undefined,
        usePrefetchedBorrower ? prefetch?.borrower : undefined
      );
      return {
        collected: serviced.bankCredit,
        paidLocal: serviced.paidLocal,
        replayed: serviced.replayed,
        partial: serviced.partial,
      };
    }
  );
  const byId = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(a._id) < String(b._id) ? -1 : 1;
  // Settlement writes stamp `updatedAt` with the wall clock; the comparison is
  // about money and book state, not when the test ran.
  const withoutStamp = <T extends Record<string, unknown>>(rows: T[]) =>
    rows.map(({ updatedAt: _updatedAt, ...rest }) => rest).sort(byId);
  return {
    summary,
    loans: withoutStamp([...inner.collection("bankLoans").docs]),
    corporations: withoutStamp([...inner.collection("corporations").docs]),
    journalRows: inner.collection(MONEY_MOVE_COLLECTION).docs.length,
    totalCalls: counted.total(),
  };
}

describe("dead-bank loans serviced from a cohort-wide borrower read", () => {
  it("produces exactly what a fresh read per loan produced", async () => {
    const batched = await run(true);
    const serial = await run(false);

    // The point of the change: the serial path paid one borrower read per
    // serviced loan, the batched one pays one per collection for the cohort.
    expect(batched.totalCalls).toBeLessThan(serial.totalCalls);

    expect(batched.summary).toEqual(serial.summary);
    expect(batched.loans).toEqual(serial.loans);
    expect(batched.corporations).toEqual(serial.corporations);
    expect(batched.journalRows).toBe(serial.journalRows);
  });

  it("charges the second loan of a borrower against the first loan's debit", async () => {
    const batched = await run(true);
    const serial = await run(false);

    // Both paths collect the same money, and the same amount left the borrower:
    // a stale prefetched balance would have collected more from it.
    const borrower = batched.corporations.find((row) => (row._id as ObjectId).equals(BORROWER)) as
      Corporation | undefined;
    const serialBorrower = serial.corporations.find((row) =>
      (row._id as ObjectId).equals(BORROWER)
    ) as Corporation | undefined;
    expect(borrower?.liquidCapital).toBe(serialBorrower?.liquidCapital);
    expect(batched.summary.loansServiced).toBe(4);
  });

  it("hands each loan the running balance, and drops it after a replay", async () => {
    const collect = async (replayFirst: boolean) => {
      const db = makeWorld();
      const seen: Array<{ available?: number }> = [];
      const serviced: string[] = [];
      await processDeadBankLoans(
        db as unknown as Db,
        TURN,
        async (loanRow, _bank, _target, _track, _txEntries, prefetch) => {
          seen.push({ available: prefetch?.borrower?.available });
          const paid = 40;
          serviced.push(loanRow._id.toHexString());
          return {
            collected: paid,
            paidLocal: paid,
            replayed: replayFirst && serviced.length === 1,
          };
        }
      );
      return seen;
    };

    // The second loan of the same borrower sees the 70 minus the first debit.
    expect((await collect(false)).map((row) => row.available)).toEqual([70, 30, 400, 0]);
    // A replay may have changed the balance behind the snapshot, so that
    // borrower's next loan falls back to the loan path's own read.
    expect((await collect(true)).map((row) => row.available)).toEqual([
      70,
      undefined,
      400,
      undefined,
    ]);
  });
});
