import { ObjectId, type Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  DEFECT_ID,
  RESTITUTION_CEILING,
  defect,
  readResolution,
} from "./AHD-1910-greenbaum-bank-restoration";
import type { HealContext } from "../types";

const emitTxBulk = vi.fn();
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: async (...args: unknown[]) => emitTxBulk(...args),
  loadTxThresholds: async () => ({}),
}));

const CORP = "6afa8647be03f6a256650f3d";
const RECORD_ID = `deposit-book-return:${CORP}:failure:229`;
const EVENT_ID = `bank-failure:${CORP}:184`;
// The frozen turn-229 resolution, as recorded on prod.
const CB_REPAID = 45_135_054;
const FROM_VAULT = 614_878_193.1164434;
const FROM_FUND = 187_197_746.2456682;
const FROM_TREASURY = 77_980_407.26187512;
const PAYOUT = 880_056_346.6239867;
const RECEIPTS = [6_355_142.515762742, 6_193_422.987533358];
const LOANS = [30_304_486.32354234, 42_267_291.80318873, 153_454_740.61];
const ctx = (): HealContext => ({
  env: "prod",
  dryRun: false,
  runId: "run-1910",
  now: new Date("2026-11-27T00:00:00Z"),
});

function record(extraLeg = false) {
  return {
    _id: RECORD_ID,
    status: "applied",
    legs: [
      {
        kind: "debit",
        amount: CB_REPAID,
        collection: "corporations",
        path: "bankCharter.cashReserves",
      },
      { kind: "burn", amount: CB_REPAID },
      {
        kind: "debit",
        amount: FROM_VAULT,
        collection: "corporations",
        path: "bankCharter.cashReserves",
      },
      { kind: "debit", amount: FROM_FUND, collection: "depositInsuranceFunds", path: "balance" },
      {
        kind: "debit",
        amount: FROM_TREASURY,
        collection: "federalBudget",
        path: "treasuryCashLocal",
      },
      { kind: "credit", amount: PAYOUT, collection: "centralBanks", path: "externalBroadMoney" },
      ...(extraLeg ? [{ kind: "credit", amount: 1, collection: "mystery", path: "balance" }] : []),
    ],
    projections: [
      {
        projection: {
          collection: "federalBudget",
          filter: { _id: "CA" },
          update: { $inc: { treasuryBalance: -FROM_TREASURY } },
        },
      },
      {
        projection: {
          collection: "federalBudget",
          filter: { _id: "CA" },
          update: {
            $inc: {
              "spending.byCategory.depositInsurance": FROM_TREASURY,
              "spending.total": FROM_TREASURY,
              surplus: -FROM_TREASURY,
            },
          },
        },
      },
      {
        projection: {
          collection: "depositInsuranceFunds",
          filter: { _id: "CAD" },
          update: {
            $inc: {
              payoutsLifetime: FROM_FUND + FROM_TREASURY,
              treasuryBackstopLifetime: FROM_TREASURY,
              measuredGrossClaimsSincePricingStart: FROM_FUND + FROM_TREASURY,
              measuredPaidClaimsSincePricingStart: 1,
            },
          },
        },
      },
      {
        projection: {
          collection: "centralBanks",
          filter: { _id: "CA" },
          update: { $inc: { netMoneyCreatedLifetime: -CB_REPAID } },
        },
      },
    ],
  };
}

function seed(recordDoc: ReturnType<typeof record> = record()): InMemoryDb {
  const memory = createInMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 232 }]);
  memory.seed("corporations", [
    {
      _id: new ObjectId(CORP),
      name: "Greenbaum Group",
      liquidCapital: 4_400_267.65,
      bankCharter: {
        type: "universal",
        status: "failed",
        currency: "CAD",
        charteredTurn: 184,
        postedCapital: 0,
        cashReserves: 0,
        npcDeposits: 0,
        playerDeposits: 0,
        totalDeposits: 0,
        totalLoans: 237_980_928.63,
        failedTurn: 229,
        resolutionClaimedTurn: 229,
        depositorsResolvedTurn: 229,
        insuranceResolutionTurn: 229,
        insuranceMeasuredClaimTurn: 229,
        reserveFloor: 0,
        capitalStanding: "adequate",
        capitalRatio: 1.5802,
      },
    },
  ]);
  memory.seed("centralBanks", [
    { _id: "CA", externalBroadMoney: 3_591_773_257_074.94, netMoneyCreatedLifetime: 1_000 },
  ]);
  memory.seed("depositInsuranceFunds", [
    {
      _id: "CAD",
      balance: 16_663_196.63,
      payoutsLifetime: 548_936_947.58,
      treasuryBackstopLifetime: 359_220_957.24,
      measuredGrossClaimsSincePricingStart: 600_000_000,
      measuredPaidClaimsSincePricingStart: 3,
    },
  ]);
  memory.seed("federalBudget", [
    {
      _id: "CA",
      treasuryCashLocal: 1_000_000_000,
      treasuryBalance: 500_000_000,
      surplus: 0,
      spending: { total: 900_000_000, byCategory: { depositInsurance: 100_000_000 } },
    },
  ]);
  memory.seed("bankMoneyMoves", [
    recordDoc,
    ...RECEIPTS.map((amount, i) => ({
      _id: `dead-bank-loan-service-batch:${CORP}:184:${230 + i}`,
      status: "applied",
      legs: [
        { kind: "debit", amount, collection: "centralBanks", path: "externalBroadMoney" },
        { kind: "credit", amount, collection: "depositInsuranceFunds", path: "balance" },
      ],
    })),
    {
      _id: `dead-bank-loan-service-batch:${CORP}:22:230`,
      status: "applied",
      legs: [
        { kind: "credit", amount: 2_036_872, collection: "depositInsuranceFunds", path: "balance" },
      ],
    },
  ]);
  memory.seed("bankLoans", [
    ...LOANS.map((outstanding) => ({
      _id: new ObjectId(),
      bankCorporationId: new ObjectId(CORP),
      charteredTurn: 184,
      status: "current",
      outstanding,
    })),
    {
      _id: new ObjectId(),
      bankCorporationId: new ObjectId(CORP),
      charteredTurn: 22,
      status: "current",
      outstanding: 99_000_000,
    },
  ]);
  memory.seed("bankFailurePoliticalEvents", [
    { _id: EVENT_ID, bankId: CORP, charteredTurn: 184, countryId: "CA" },
    { _id: `bank-failure:${CORP}:22`, bankId: CORP, charteredTurn: 22, countryId: "CA" },
  ]);
  return memory;
}

const db = (m: InMemoryDb) => m as unknown as Db;
const corp = (m: InMemoryDb) => m.collection("corporations").docs[0] as any;
const cb = (m: InMemoryDb) => m.collection("centralBanks").docs[0] as any;
const fund = (m: InMemoryDb) => m.collection("depositInsuranceFunds").docs[0] as any;
const budget = (m: InMemoryDb) => m.collection("federalBudget").docs[0] as any;

const receipts = RECEIPTS.reduce((a, b) => a + b, 0);
const loans = LOANS.reduce((a, b) => a + b, 0);
const gap = Math.ceil((PAYOUT - FROM_VAULT - receipts - loans) * 100) / 100;

describe("AHD-1910 Greenbaum bank restoration", () => {
  it("splits the frozen resolution and leaves the central bank advance retired", () => {
    const read = readResolution(record());
    expect(read).toMatchObject({
      ok: true,
      householdBook: PAYOUT,
      fundCredit: FROM_FUND,
      treasuryCredit: FROM_TREASURY,
    });
    if (!read.ok) throw new Error("unreachable");
    expect(read.bankCashReversal).toBeCloseTo(FROM_VAULT, 6);
    expect(read.treasuryCounters).toMatchObject({ treasuryBalance: -FROM_TREASURY });
  });

  it("reopens the bank, reverses every payer, mints only the gap, and is idempotent", async () => {
    const memory = seed();
    vi.clearAllMocks();
    expect((await defect.detect(db(memory), ctx())).affected).toBe(1);
    const planned = await defect.plan(db(memory), ctx());
    expect(planned.affected).toBe(1);
    expect(planned.moneyDelta).toBeCloseTo(gap, 2);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(RESTITUTION_CEILING);

    const before = {
      ebm: cb(memory).externalBroadMoney,
      fund: fund(memory).balance,
      treasury: budget(memory).treasuryCashLocal,
    };
    const applied = await defect.apply(db(memory), planned, ctx());
    expect(applied.documentsUpdated).toBe(1);

    const charter = corp(memory).bankCharter;
    expect(charter.status).toBe("active");
    expect(charter.npcDeposits).toBeCloseTo(PAYOUT, 6);
    expect(charter.totalDeposits).toBeCloseTo(PAYOUT, 6);
    expect(charter.totalLoans).toBeCloseTo(loans, 6);
    expect(charter.cashReserves).toBeCloseTo(FROM_VAULT + receipts + gap, 6);
    // Net assets close to zero: the restitution exactly fills the hole.
    expect(charter.cashReserves + charter.totalLoans - charter.npcDeposits).toBeGreaterThanOrEqual(
      0
    );
    expect(charter.cashReserves + charter.totalLoans - charter.npcDeposits).toBeLessThan(0.02);
    expect(charter.failedTurn).toBeUndefined();
    expect(charter.depositorsResolvedTurn).toBeUndefined();
    expect(charter.capitalStanding).toBeUndefined();
    expect(corp(memory).liquidCapital).toBe(4_400_267.65);

    // Households return exactly what they were paid; nobody is paid twice.
    expect(before.ebm - cb(memory).externalBroadMoney).toBeCloseTo(PAYOUT, 4);
    expect(cb(memory).netMoneyCreatedLifetime).toBe(1_000);
    expect(fund(memory).balance - before.fund).toBeCloseTo(FROM_FUND - receipts, 4);
    expect(budget(memory).treasuryCashLocal - before.treasury).toBeCloseTo(FROM_TREASURY, 4);
    expect(budget(memory).treasuryBalance).toBeCloseTo(500_000_000 + FROM_TREASURY, 4);
    expect(budget(memory).spending.byCategory.depositInsurance).toBeCloseTo(
      100_000_000 - FROM_TREASURY,
      4
    );
    expect(fund(memory).measuredPaidClaimsSincePricingStart).toBe(2);

    const events = memory.collection("bankFailurePoliticalEvents").docs.map((d: any) => d._id);
    expect(events).toEqual([`bank-failure:${CORP}:22`]);
    expect(emitTxBulk).toHaveBeenCalledTimes(1);
    const entries = emitTxBulk.mock.calls[0][1] as { type: string; amount: number; meta: object }[];
    expect(entries[0]).toMatchObject({ type: "restitution_credit", currencyCode: "CAD" });
    expect(entries[0].amount).toBeCloseTo(gap, 2);
    expect(entries[0].meta).toMatchObject({
      ticket: 1910,
      defectId: DEFECT_ID,
      fundedBy: "game_mint",
    });
    expect(await defect.verify(db(memory), ctx())).toMatchObject({ ok: true, remaining: 0 });

    const replanned = await defect.plan(db(memory), ctx());
    expect(replanned.affected).toBe(0);
    expect((await defect.apply(db(memory), replanned, ctx())).documentsUpdated).toBe(0);
  });

  it("refuses to apply when a loan repayment lands after the plan", async () => {
    const memory = seed();
    const planned = await defect.plan(db(memory), ctx());
    memory.collection("bankMoneyMoves").docs.push({
      _id: `dead-bank-loan-service-batch:${CORP}:184:232`,
      status: "applied",
      legs: [
        { kind: "credit", amount: 6_000_000, collection: "depositInsuranceFunds", path: "balance" },
      ],
    });
    const applied = await defect.apply(db(memory), planned, ctx());
    expect(applied.documentsUpdated).toBe(0);
    expect(applied.notes?.join(" ")).toMatch(/plan again/);
    expect(corp(memory).bankCharter.status).toBe("failed");
  });

  it("refuses an unknown leg or a gap above the approved ceiling", async () => {
    const odd = await defect.plan(db(seed(record(true))), ctx());
    expect(odd.affected).toBe(0);
    expect(odd.notes?.join(" ")).toMatch(/refused/);

    const deep = seed();
    for (const loan of deep.collection("bankLoans").docs as any[]) loan.outstanding /= 2;
    const planned = await defect.plan(db(deep), ctx());
    expect(planned.affected).toBe(0);
    expect(planned.notes?.join(" ")).toMatch(/above the approved/);
  });
});
