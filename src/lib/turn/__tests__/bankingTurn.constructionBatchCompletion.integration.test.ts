/**
 * A construction servicing batch whose borrower debit was refused by the
 * balance guard: the bank is credited only what was really taken, the loans of
 * the borrowers who paid advance, the refused borrower's loans do not, and the
 * bank's lease and the loans' locks are released.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash, InjectedCrash } from "@/lib/test-utils/faultyDb";
import type { BankCharter, BankLoan } from "@/lib/db/types/bank";
import { originateLoan } from "@/lib/banking/lending";
import { recoverBankingSettlements } from "@/lib/banking/recovery";
import { processBankingTurn } from "../bankingTurn";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));

const START = 100;
const PRINCIPAL = 9_600;
const TERM = 8;

async function world() {
  const db = createInMemoryDb();
  const native = db as unknown as Db;
  const bankId = new ObjectId();
  const borrowers = [new ObjectId(), new ObjectId(), new ObjectId()];
  db.seed("gameConfig", [
    {
      _id: "default",
      privateBankingEnabled: true,
      bankConstructionFinanceEnabled: true,
      treasuryCashLedgerEnabled: true,
    },
  ]);
  db.seed("gameState", [{ _id: "current", currentTurn: START, preset: "2019-default" }]);
  db.seed("centralBanks", [
    {
      _id: "US",
      countryId: "US",
      primeRate: 4,
      inflationHistory: [{ turn: 1, rate: 0 }],
      externalBroadMoney: 0,
      bankReserveRequirement: 0.1,
    },
  ]);
  db.seed("corporations", [
    {
      _id: bankId,
      name: "Completion Bank",
      type: "financial",
      countryId: "US",
      liquidCapital: 0,
      liquidCurrencyCode: "USD",
      userId: new ObjectId(),
      bankCharter: {
        type: "investment",
        status: "active",
        currency: "USD",
        charteredTurn: 1,
        postedCapital: 1_000_000,
        cashReserves: 1_000_000,
        npcDeposits: 0,
        totalDeposits: 0,
        totalLoans: 0,
        depositOffset: 0,
        lendingOffset: 0,
        blacklist: {},
      } satisfies BankCharter,
    },
    ...borrowers.map((_id, i) => ({
      _id,
      name: `Borrower ${i}`,
      type: "manufacturing",
      countryId: "US",
      liquidCapital: 1_000_000,
      liquidCurrencyCode: "USD",
      userId: new ObjectId(),
    })),
  ]);
  db.seed(
    "corporationHistory",
    borrowers.flatMap((corporationId) =>
      Array.from({ length: 12 }, (_, i) => ({
        _id: new ObjectId(),
        corporationId,
        turn: START - 11 + i,
        income: 200_000,
      }))
    )
  );
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(native);
  // Two construction loans per borrower.
  const loans: ObjectId[] = [];
  for (const borrower of borrowers) {
    for (const claimId of [`a-${borrower}`, `b-${borrower}`]) {
      const originated = await originateLoan(
        native,
        bankId,
        { type: "corporation", id: borrower },
        PRINCIPAL,
        TERM
      );
      if (!originated.ok) throw new Error(originated.error);
      loans.push(originated.loan._id);
      await db.collection("bankLoans").updateOne(
        { _id: originated.loan._id },
        {
          $set: {
            constructionCollateral: {
              claimId,
              sectorId: new ObjectId(),
              quotedCostLocal: 20_000,
              constructionCostLocal: 20_000,
            },
          },
        }
      );
    }
  }
  const key = `loan-service-construction-batch:${bankId}:${START + 1}`;
  const corp = (id: ObjectId) =>
    db.collection("corporations").docs.find((d) => (d._id as ObjectId).equals(id)) as unknown as {
      liquidCapital: number;
      bankCharter?: BankCharter;
      bankConstructionFunding?: unknown;
    };
  const loan = (id: ObjectId) =>
    db
      .collection("bankLoans")
      .docs.find((d) => (d._id as ObjectId).equals(id)) as unknown as BankLoan;
  const journal = () =>
    db.collection("bankMoneyMoves").docs.find((d) => d._id === key) as unknown as {
      status: string;
      legs: { kind: string; amount: number; applied: boolean; refusal?: string }[];
    };
  const cash = (id: ObjectId) => corp(id).liquidCapital;
  const money = () =>
    (
      db.collection("corporations").docs as { liquidCapital: number; bankCharter?: BankCharter }[]
    ).reduce((sum, c) => sum + c.liquidCapital + (c.bankCharter?.cashReserves ?? 0), 0);
  const startCash = borrowers.map(cash);
  const startMoney = money();
  return {
    db,
    native,
    bankId,
    borrowers,
    loans,
    key,
    corp,
    loan,
    journal,
    cash,
    money,
    startCash,
    startMoney,
  };
}

/** The batch claim lands, then the second borrower's cash vanishes: its debit is refused. */
function drainOnClaim(db: InMemoryDb, key: string, borrower: ObjectId): Db {
  return {
    collection: (name: string) => {
      const target = db.collection(name);
      if (name !== "bankMoneyMoves") return target;
      return new Proxy(target, {
        get(obj, prop, receiver) {
          const value = Reflect.get(obj, prop, receiver);
          if (prop !== "insertOne") return typeof value === "function" ? value.bind(obj) : value;
          return async (doc: { _id: string }, ...rest: unknown[]) => {
            if (doc._id === key)
              await db
                .collection("corporations")
                .updateOne({ _id: borrower }, { $set: { liquidCapital: 0 } });
            return (value as (...a: unknown[]) => Promise<unknown>).call(obj, doc, ...rest);
          };
        },
      });
    },
  } as unknown as Db;
}

async function stuckBatch() {
  const w = await world();
  const refused = w.borrowers[1];
  const refusedCash = w.cash(refused);
  await processBankingTurn(drainOnClaim(w.db, w.key, refused), START + 1);
  return { ...w, refused, refusedCash };
}

describe("construction batch with a refused borrower debit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts out stuck: partial journal, lease and locks held", async () => {
    const w = await stuckBatch();
    expect(w.journal().status).toBe("partial");
    expect(w.journal().legs.filter((l) => l.refusal)).toHaveLength(1);
    expect(w.corp(w.bankId).bankConstructionFunding).toBeDefined();
    expect(w.loan(w.loans[2]).constructionSettlementOwner).toBe(w.key);
  });

  it("credits the bank only what was taken and advances only the borrowers who paid", async () => {
    const w = await stuckBatch();
    const bankBefore = w.corp(w.bankId).bankCharter!.cashReserves ?? 0;
    const summary = await recoverBankingSettlements(w.native, START + 2);
    expect(summary.stillPartial).toEqual([]);
    // The third borrower's debit had not been tried when the refusal stopped the move.
    const paid = [0, 2].reduce((sum, i) => sum + (w.startCash[i] - w.cash(w.borrowers[i])), 0);
    expect(paid).toBeGreaterThan(0);

    expect(w.corp(w.bankId).bankCharter!.cashReserves! - bankBefore).toBeCloseTo(paid, 6);
    // Nothing created or lost beyond the cash that vanished from the refused borrower.
    expect(w.money()).toBeCloseTo(w.startMoney - w.refusedCash, 6);
    for (const id of w.loans.slice(0, 2).concat(w.loans.slice(4))) {
      expect(w.loan(id).lastProcessedTurn).toBe(START + 1);
      expect(w.loan(id).outstanding).toBeLessThan(PRINCIPAL);
    }
    for (const id of w.loans.slice(2, 4)) {
      expect(w.loan(id).lastProcessedTurn).toBeUndefined();
      expect(w.loan(id).outstanding).toBe(PRINCIPAL);
    }
    for (const id of w.loans) expect(w.loan(id).constructionSettlementOwner).toBeUndefined();
    expect(w.corp(w.bankId).bankConstructionFunding).toBeUndefined();
    const book = w.loans.reduce((sum, id) => sum + w.loan(id).outstanding, 0);
    expect(w.corp(w.bankId).bankCharter!.totalLoans).toBeCloseTo(book, 6);
    expect(w.journal().status).toBe("applied");
    expect(w.journal().legs.every((l) => l.applied)).toBe(true);
    // The refused debit stays on the record as the audit trail.
    expect(
      (w.journal() as unknown as { supersededDebits: unknown[] }).supersededDebits
    ).toHaveLength(1);
  });

  it.each([
    [
      "before the bank is credited",
      (args: unknown[]) =>
        JSON.stringify((args[1] as { $inc?: unknown }).$inc ?? {}).includes("cashReserves"),
    ],
    [
      "after the bank is credited, before the loans advance",
      (args: unknown[]) =>
        JSON.stringify((args[1] as { $set?: unknown }).$set ?? {}).includes("lastProcessedTurn"),
    ],
  ] as const)("is exactly once when recovery crashes %s", async (_label, matches) => {
    const w = await stuckBatch();
    const bankBefore = w.corp(w.bankId).bankCharter!.cashReserves ?? 0;
    const crash = withInjectedCrash(w.db, { op: "updateOne", onCall: 1, matches });
    await expect(recoverBankingSettlements(crash.db, START + 2)).rejects.toBeInstanceOf(
      InjectedCrash
    );
    const summary = await recoverBankingSettlements(w.native, START + 2);
    expect(summary.stillPartial).toEqual([]);
    await recoverBankingSettlements(w.native, START + 3);
    const paid = [0, 2].reduce((sum, i) => sum + (w.startCash[i] - w.cash(w.borrowers[i])), 0);
    expect(paid).toBeGreaterThan(0);
    expect(w.corp(w.bankId).bankCharter!.cashReserves! - bankBefore).toBeCloseTo(paid, 6);
    for (const id of w.loans.slice(2, 4)) expect(w.loan(id).lastProcessedTurn).toBeUndefined();
    for (const id of w.loans.slice(0, 2)) expect(w.loan(id).lastProcessedTurn).toBe(START + 1);
    expect(w.corp(w.bankId).bankConstructionFunding).toBeUndefined();
    const book = w.loans.reduce((sum, id) => sum + w.loan(id).outstanding, 0);
    expect(w.corp(w.bankId).bankCharter!.totalLoans).toBeCloseTo(book, 6);
  });

  it("leaves a batch whose credit was refused alone", async () => {
    const w = await stuckBatch();
    const record = w.db.collection("bankMoneyMoves").docs.find((d) => d._id === w.key) as {
      legs: { kind: string; refusal?: string }[];
    };
    record.legs.find((l) => l.kind === "credit")!.refusal = "credit guard failed";
    const summary = await recoverBankingSettlements(w.native, START + 2);
    expect(summary.stillPartial.map((r) => r.key)).toContain(w.key);
    expect(w.corp(w.bankId).bankConstructionFunding).toBeDefined();
    expect(w.journal().status).toBe("partial");
    expect(w.loan(w.loans[0]).lastProcessedTurn).toBeUndefined();
  });

  it("leaves a batch whose credit already landed alone", async () => {
    const w = await stuckBatch();
    const record = w.db.collection("bankMoneyMoves").docs.find((d) => d._id === w.key) as {
      legs: { kind: string; applied: boolean }[];
    };
    record.legs.find((l) => l.kind === "credit")!.applied = true;
    const summary = await recoverBankingSettlements(w.native, START + 2);
    expect(summary.stillPartial.map((r) => r.key)).toContain(w.key);
    expect(w.corp(w.bankId).bankConstructionFunding).toBeDefined();
    expect(w.loan(w.loans[0]).lastProcessedTurn).toBeUndefined();
  });

  it("services the refused borrower once on the next turn", async () => {
    const w = await stuckBatch();
    await recoverBankingSettlements(w.native, START + 2);
    await w.db
      .collection("corporations")
      .updateOne({ _id: w.refused }, { $set: { liquidCapital: w.refusedCash } });
    const moneyBefore = w.money();
    await processBankingTurn(w.native, START + 2);
    for (const id of w.loans) {
      expect(w.loan(id).lastProcessedTurn).toBe(START + 2);
      expect(w.loan(id).constructionSettlementOwner).toBeUndefined();
    }
    expect(w.corp(w.bankId).bankConstructionFunding).toBeUndefined();
    expect(w.money()).toBeCloseTo(moneyBefore, 6);
    // The refused borrower paid one instalment per loan, not two.
    const settled = (
      w.db.collection("bankMoneyMoves").docs as {
        _id: string;
        legs?: { kind: string; applied: boolean; amount: number; filter?: { _id: unknown } }[];
      }[]
    )
      .filter((m) => m._id.startsWith("loan-service-construction-batch:"))
      .flatMap((m) => m.legs ?? [])
      .filter(
        (l) => l.kind === "debit" && l.applied && String(l.filter?._id) === String(w.refused)
      );
    expect(settled).toHaveLength(1);
    expect(w.refusedCash - w.cash(w.refused)).toBeCloseTo(settled[0].amount, 6);
    const book = w.loans.reduce((sum, id) => sum + w.loan(id).outstanding, 0);
    expect(w.corp(w.bankId).bankCharter!.totalLoans).toBeCloseTo(book, 6);
  });
});
