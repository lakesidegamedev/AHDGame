import { ObjectId, type Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  CASH_AT_WATERFALL,
  DEFECT_ID,
  SHORTFALL,
  defect,
} from "./AHD-1749-monroe-bank-restoration";
import type { HealContext } from "../types";

const emitTxBulk = vi.fn();
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: async (...args: unknown[]) => emitTxBulk(...args),
  loadTxThresholds: async () => ({}),
}));

const CORP = "6ae2d9eed7873dea7ec4eaea";
const RECORD_ID = `deposit-book-return:${CORP}:failure:601`;
const EVENT_ID = `bank-failure:${CORP}:583`;
const PLAYER_BOOK = 22_150.23;
const PAYOUT = 8_902_829.224930469;
const FUND = 1_193_196.6375411293;
const ctx = (): HealContext => ({
  env: "prod",
  dryRun: false,
  runId: "run-1749",
  now: new Date("2026-11-02T00:00:00Z"),
});

function record(extraLeg = false) {
  return {
    _id: RECORD_ID,
    status: "applied",
    legs: [
      {
        kind: "debit",
        amount: CASH_AT_WATERFALL,
        collection: "corporations",
        filter: { _id: new ObjectId(CORP) },
        path: "bankCharter.cashReserves",
        applied: true,
      },
      {
        kind: "debit",
        amount: FUND,
        collection: "depositInsuranceFunds",
        filter: { _id: "USD" },
        path: "balance",
        applied: true,
      },
      {
        kind: "credit",
        amount: PAYOUT,
        collection: "centralBanks",
        filter: { _id: "US" },
        path: "externalBroadMoney",
        applied: true,
      },
      ...(extraLeg
        ? [
            {
              kind: "credit",
              amount: 1,
              collection: "mystery",
              filter: { _id: "x" },
              path: "balance",
              applied: true,
            },
          ]
        : []),
    ],
    projections: [
      {
        projection: {
          collection: "centralBanks",
          filter: { _id: "US" },
          update: { $inc: { householdSavingsLiability: PLAYER_BOOK } },
        },
      },
      {
        projection: {
          collection: "depositInsuranceFunds",
          filter: { _id: "USD" },
          update: {
            $inc: {
              payoutsLifetime: FUND,
              treasuryBackstopLifetime: 0,
              measuredGrossClaimsSincePricingStart: FUND,
              measuredPaidClaimsSincePricingStart: 1,
            },
          },
        },
      },
    ],
  };
}

function seed(recordDoc: ReturnType<typeof record> = record()): InMemoryDb {
  const memory = createInMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 610 }]);
  memory.seed("corporations", [
    {
      _id: new ObjectId(CORP),
      name: "Monroe Indrustry",
      liquidCapital: 999_999,
      bankCharter: {
        type: "universal",
        status: "failed",
        currency: "USD",
        charteredTurn: 583,
        postedCapital: 1_666_667,
        cashReserves: 0,
        npcDeposits: 0,
        playerDeposits: 0,
        totalDeposits: 0,
        totalLoans: 0,
        failedTurn: 601,
        depositorsResolvedTurn: 601,
        insuranceResolutionTurn: 601,
        insuranceMeasuredClaimTurn: 601,
        reserveFloor: 0,
        capitalStanding: "undercapitalized",
      },
    },
  ]);
  memory.seed("centralBanks", [
    { _id: "US", externalBroadMoney: 100_000_000, householdSavingsLiability: 5_000_000 },
  ]);
  memory.seed("depositInsuranceFunds", [
    {
      _id: "USD",
      balance: 2_000_000,
      payoutsLifetime: 5_000_000,
      treasuryBackstopLifetime: 0,
      measuredGrossClaimsSincePricingStart: 5_000_000,
      measuredPaidClaimsSincePricingStart: 3,
    },
  ]);
  memory.seed("bankMoneyMoves", [recordDoc]);
  memory.seed("bankFailurePoliticalEvents", [
    { _id: EVENT_ID, bankId: CORP, charteredTurn: 583, countryId: "US", paidTurn: 601 },
  ]);
  return memory;
}
const db = (m: InMemoryDb) => m as unknown as Db;
const corp = (m: InMemoryDb) => m.collection("corporations").docs[0] as any;
const cb = (m: InMemoryDb) => m.collection("centralBanks").docs[0] as any;
const fund = (m: InMemoryDb) => m.collection("depositInsuranceFunds").docs[0] as any;

describe("AHD-1749 Monroe bank restoration", () => {
  it("detects, plans, reopens, conserves money, deletes the failure event and is idempotent", async () => {
    const memory = seed();
    vi.clearAllMocks();
    expect((await defect.detect(db(memory), ctx())).affected).toBe(1);
    const planned = await defect.plan(db(memory), ctx());
    expect(planned.affected).toBe(1);
    expect(planned.moneyDelta).toBe(SHORTFALL);
    expect(planned.notes?.join(" ")).toMatch(/restored equity 262,548/);

    const applied = await defect.apply(db(memory), planned, ctx());
    expect(applied.documentsUpdated).toBe(1);
    const charter = corp(memory).bankCharter;
    expect(charter.status).toBe("active");
    expect(charter.type).toBe("universal");
    expect(charter.npcDeposits).toBeCloseTo(PAYOUT - PLAYER_BOOK, 6);
    expect(charter.playerDeposits).toBe(0);
    expect(charter.totalDeposits).toBeCloseTo(PAYOUT - PLAYER_BOOK, 6);
    expect(charter.cashReserves).toBeCloseTo(CASH_AT_WATERFALL - PLAYER_BOOK + SHORTFALL, 6);
    expect(corp(memory).liquidCapital).toBe(999_999);
    expect(cb(memory).externalBroadMoney).toBeCloseTo(100_000_000 - (PAYOUT - PLAYER_BOOK), 6);
    expect(cb(memory).householdSavingsLiability).toBe(5_000_000);
    expect(fund(memory).balance).toBeCloseTo(2_000_000 + FUND, 6);
    expect(fund(memory).payoutsLifetime).toBeCloseTo(5_000_000 - FUND, 6);
    expect(fund(memory).measuredPaidClaimsSincePricingStart).toBe(2);
    expect(memory.collection("bankFailurePoliticalEvents").docs).toHaveLength(0);
    expect(emitTxBulk).toHaveBeenCalledTimes(1);
    const entries = emitTxBulk.mock.calls[0][1] as {
      type: string;
      amount: number;
      meta: Record<string, unknown>;
    }[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "restitution_credit", amount: SHORTFALL });
    expect(entries[0].meta).toMatchObject({
      ticket: 1749,
      defectId: DEFECT_ID,
      fundedBy: "game_mint",
    });
    expect(await defect.verify(db(memory), ctx())).toMatchObject({ ok: true, remaining: 0 });

    const replanned = await defect.plan(db(memory), ctx());
    expect(replanned.affected).toBe(0);
    expect(replanned.moneyDelta).toBe(0);
    expect((await defect.apply(db(memory), replanned, ctx())).documentsUpdated).toBe(0);
  });

  it("refuses to plan when the frozen record has an unknown leg", async () => {
    const memory = seed(record(true));
    const planned = await defect.plan(db(memory), ctx());
    expect(planned.moneyDelta).toBe(0);
    expect(planned.notes?.join(" ")).toMatch(/refused/i);
  });
});
