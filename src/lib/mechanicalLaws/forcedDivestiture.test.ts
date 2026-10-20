import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { EquityMarketPool } from "@/lib/db/types";
import { makeCorporation } from "@/lib/test-utils/factories";
import { executeForcedDivestiture, bookValuePerShareAnchor } from "./forcedDivestiture";

vi.mock("@/lib/equities/marketPool", () => ({
  readEquityPool: vi.fn(),
  debitEquityPoolGated: vi.fn(),
  refundEquityPoolDebit: vi.fn(),
}));
vi.mock("@/lib/corporations/shareholderOps", () => ({ debitSharesFromCorp: vi.fn() }));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn() }));

import {
  debitEquityPoolGated,
  readEquityPool,
  refundEquityPoolDebit,
} from "@/lib/equities/marketPool";
import { debitSharesFromCorp } from "@/lib/corporations/shareholderOps";
import { emitTx } from "@/lib/financialTxLog/emit";

const mockedReadPool = vi.mocked(readEquityPool);
const mockedDebitPool = vi.mocked(debitEquityPoolGated);
const mockedRefundPool = vi.mocked(refundEquityPoolDebit);
const mockedDebitShares = vi.mocked(debitSharesFromCorp);
const mockedEmitTx = vi.mocked(emitTx);

const now = new Date("2026-10-21T00:00:00Z");
const fxByCurrency = new Map<CurrencyCode, number>([["USD", 1]]);
const pool = { _id: "USD", cashLocal: 100_000 } as unknown as EquityMarketPool;

function fakeDb() {
  const updateOne = vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 }));
  const collection = vi.fn(() => ({ updateOne }));
  return { db: { collection } as unknown as Db, collection, updateOne };
}

const targetId = new ObjectId();
const parentId = new ObjectId();

function fixtures(holderShares = 800) {
  const target = makeCorporation({
    _id: targetId,
    name: "Subsidiary Co",
    countryId: "US",
    liquidCurrencyCode: "USD",
    totalShares: 1000,
    fundamentalSharePrice: 40,
    shareholders: [
      {
        corporationId: parentId,
        shares: holderShares,
        avgCostPerShare: 2,
        avgCostBasisUnit: "anchor",
      },
    ],
  });
  const parent = makeCorporation({
    _id: parentId,
    name: "Parent Group",
    countryId: "US",
    liquidCurrencyCode: "USD",
  });
  return { target, parent };
}

beforeEach(() => {
  mockedReadPool.mockReset();
  mockedDebitPool.mockReset();
  mockedRefundPool.mockReset();
  mockedDebitShares.mockReset();
  mockedEmitTx.mockReset();
  mockedReadPool.mockResolvedValue(pool);
  mockedDebitPool.mockResolvedValue({ ok: true, cashAfter: 100_000 });
  mockedDebitShares.mockResolvedValue(500);
});

describe("executeForcedDivestiture", () => {
  it("sells the controlling stake down to half at the holder's book value", async () => {
    const { db, updateOne } = fakeDb();
    const { target, parent } = fixtures();

    const outcome = await executeForcedDivestiture(db, {
      target,
      parent,
      exchangeRatesByCurrency: fxByCurrency,
      turn: 120,
      now,
    });

    // 80% of 1000 shares, holding at most 500: 300 shares at 2 anchor each.
    expect(outcome).toEqual({ status: "sold", shares: 300, proceedsAnchor: 600 });
    expect(mockedReadPool).toHaveBeenCalledWith(db, "USD");
    expect(mockedDebitPool).toHaveBeenCalledWith(db, "USD", 600, "salesOut", now);
    expect(mockedDebitShares).toHaveBeenCalledWith(
      db,
      target._id,
      parent._id,
      300,
      { $inc: { publicFloat: 300 }, $set: { updatedAt: now } },
      { requireSufficient: true }
    );
    expect(updateOne).toHaveBeenCalledWith(
      { _id: parent._id },
      { $inc: { liquidCapital: 600 }, $set: { updatedAt: now } }
    );
    expect(mockedEmitTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        type: "stock_trade_sell",
        turn: 120,
        subjectId: parent._id,
        counterpartyId: target._id,
        amount: 600,
        currencyCode: "USD",
        meta: expect.objectContaining({
          corporationId: target._id.toString(),
          shares: 300,
          pricePerShareAnchor: 2,
          forcedDivestiture: true,
        }),
      })
    );
  });

  it("reports noControl when the holder owns half or less", async () => {
    const { db, updateOne } = fakeDb();
    const { target, parent } = fixtures(500);

    const outcome = await executeForcedDivestiture(db, {
      target,
      parent,
      exchangeRatesByCurrency: fxByCurrency,
      turn: 120,
      now,
    });

    expect(outcome).toEqual({ status: "noControl" });
    expect(mockedReadPool).not.toHaveBeenCalled();
    expect(mockedDebitPool).not.toHaveBeenCalled();
    expect(mockedDebitShares).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("reports noControl when the parent holds no shares at all", async () => {
    const { db } = fakeDb();
    const { target, parent } = fixtures();
    target.shareholders = [{ corporationId: new ObjectId(), shares: 800 }];

    const outcome = await executeForcedDivestiture(db, {
      target,
      parent,
      exchangeRatesByCurrency: fxByCurrency,
      turn: 120,
      now,
    });

    expect(outcome).toEqual({ status: "noControl" });
  });

  it("refuses when the country has no equity market pool", async () => {
    const { db } = fakeDb();
    const { target, parent } = fixtures();
    mockedReadPool.mockResolvedValue(null);

    const outcome = await executeForcedDivestiture(db, {
      target,
      parent,
      exchangeRatesByCurrency: fxByCurrency,
      turn: 120,
      now,
    });

    expect(outcome).toEqual({ status: "refused", why: "noPool" });
    expect(mockedDebitPool).not.toHaveBeenCalled();
    expect(mockedDebitShares).not.toHaveBeenCalled();
  });

  it("defers with poolShort and moves no shares when the pool cannot pay", async () => {
    const { db, updateOne } = fakeDb();
    const { target, parent } = fixtures();
    mockedDebitPool.mockResolvedValue({ ok: false });

    const outcome = await executeForcedDivestiture(db, {
      target,
      parent,
      exchangeRatesByCurrency: fxByCurrency,
      turn: 120,
      now,
    });

    expect(outcome).toEqual({ status: "deferred", why: "poolShort" });
    expect(mockedDebitShares).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("refunds the pool and defers when the share debit moves nothing", async () => {
    const { db, updateOne } = fakeDb();
    const { target, parent } = fixtures();
    mockedDebitShares.mockResolvedValue(-1);

    const outcome = await executeForcedDivestiture(db, {
      target,
      parent,
      exchangeRatesByCurrency: fxByCurrency,
      turn: 120,
      now,
    });

    expect(outcome).toEqual({ status: "deferred", why: "sharesMoved" });
    expect(mockedRefundPool).toHaveBeenCalledWith(db, "USD", 600, "salesOut", now);
    expect(updateOne).not.toHaveBeenCalled();
    expect(mockedEmitTx).not.toHaveBeenCalled();
  });
});

describe("bookValuePerShareAnchor", () => {
  it("uses the holder's anchor cost basis when it has one", () => {
    const perShare = bookValuePerShareAnchor(
      { avgCostPerShare: 2, avgCostBasisUnit: "anchor" },
      { fundamentalSharePrice: 40 },
      4
    );
    expect(perShare).toBe(2);
  });

  it("falls back to the fundamental price converted at the target's fx rate", () => {
    const perShare = bookValuePerShareAnchor({}, { fundamentalSharePrice: 300 }, 3);
    expect(perShare).toBe(100);
  });

  it("ignores a legacy (non anchor) average cost basis", () => {
    const perShare = bookValuePerShareAnchor(
      { avgCostPerShare: 7 },
      { fundamentalSharePrice: 300 },
      3
    );
    expect(perShare).toBe(100);
  });

  it("returns 0 when neither an anchor basis nor a price is available", () => {
    expect(bookValuePerShareAnchor({}, { fundamentalSharePrice: 0 }, 3)).toBe(0);
    expect(bookValuePerShareAnchor({}, { fundamentalSharePrice: 300 }, 0)).toBe(0);
    expect(bookValuePerShareAnchor({ avgCostPerShare: 0, avgCostBasisUnit: "anchor" }, {}, 1)).toBe(
      0
    );
  });
});
