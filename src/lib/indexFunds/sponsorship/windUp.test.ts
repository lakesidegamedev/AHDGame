import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { IndexFund, IndexFundPosition } from "@/lib/db/types/indexFund";

vi.mock("@/lib/db/sessionDb", () => ({
  withSessionDb: async (db: Db, work: (tx: Db) => Promise<unknown>) => work(db),
  afterCommit: async (_db: Db, effect: () => Promise<unknown>) => effect(),
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn() }));
vi.mock("@/lib/financialTxLog/atomicCashGuard", () => ({
  creditCorpLiquidCapital: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/currency/corporationCapital", () => ({
  anchorToCorpCapital: (a: number) => a,
  anchorToCorpLiquidCapital: (a: number) => a,
  corpCapitalToAnchor: (a: number) => a,
  loadFxRatesRecord: vi.fn().mockResolvedValue({}),
  getCorpFxRate: vi.fn().mockResolvedValue(1),
  resolveCorpLiquidCurrencyCode: () => "USD",
}));
vi.mock("@/lib/indexFunds/fundRedemptionLiquidity", () => ({
  sellFundHoldingsForRedemptionCash: vi.fn().mockResolvedValue({
    cashRaisedAnchor: 0,
    sharesSold: 0,
    salesExecuted: 0,
  }),
}));
vi.mock("@/lib/bonds/sellFundBondUnits", () => ({
  sellFundBondHoldingsForCash: vi
    .fn()
    .mockResolvedValue({ proceedsAnchor: 0, unitsSold: 0, bondsTouched: 0 }),
}));
vi.mock("@/lib/indexFunds/processQueuedRedemptions", () => ({
  processQueuedRedemptions: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/indexFunds/fundValuation", () => ({
  loadQueuedRedemptionUnitsByFundId: vi.fn().mockResolvedValue(new Map()),
  loadOpenOrdersEscrowByFundId: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/indexFunds/fundShareOrders", () => ({
  cancelFundShareOrder: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/indexFunds/subscriptions", () => ({
  refundQueuedSubscriptionsForFund: vi.fn().mockResolvedValue(0),
}));
// Mirrors the real contract: a fund_reserve position is the fund's own units
// and is never paid out. `payFundHoldersCash` settles a whole book in one call
// in production; the shim below keeps this suite's per-holder assertions valid.
vi.mock("./holderPayout", async () => {
  const payFundHolderCash = vi.fn(
    async (
      _db: unknown,
      _fund: unknown,
      position: { holderKind: string },
      _payoutAnchor?: number
    ) => position.holderKind !== "fund_reserve"
  );
  return {
    payFundHolderCash,
    payFundHoldersCash: vi.fn(
      async (
        db: unknown,
        fund: unknown,
        payouts: Array<{
          position: { holderKind: string };
          payoutAnchor: number;
        }>
      ) => {
        const paid: Array<{ holderKind: string }> = [];
        const unpaid: Array<{ holderKind: string }> = [];
        let distributedAnchor = 0;
        for (const { position, payoutAnchor } of payouts) {
          if (await payFundHolderCash(db, fund, position, payoutAnchor)) {
            paid.push(position);
            distributedAnchor += payoutAnchor;
          } else if (position.holderKind !== "fund_reserve") unpaid.push(position);
        }
        return { paid, unpaid, distributedAnchor };
      }
    ),
  };
});

import { creditCorpLiquidCapital } from "@/lib/financialTxLog/atomicCashGuard";
import { sellFundHoldingsForRedemptionCash } from "@/lib/indexFunds/fundRedemptionLiquidity";
import { sellFundBondHoldingsForCash } from "@/lib/bonds/sellFundBondUnits";
import { payFundHolderCash } from "./holderPayout";
import { processQueuedRedemptions } from "@/lib/indexFunds/processQueuedRedemptions";
import { loadQueuedRedemptionUnitsByFundId } from "@/lib/indexFunds/fundValuation";
import { advanceWindDowns, beginWindUp, completeWindUp } from "./windUp";
import { cancelFundShareOrder } from "@/lib/indexFunds/fundShareOrders";
import { refundQueuedSubscriptionsForFund } from "@/lib/indexFunds/subscriptions";

const SPONSOR = new ObjectId();

function makeFund(over: Partial<IndexFund> = {}): IndexFund {
  return {
    _id: new ObjectId(),
    slug: "sponsored-nit",
    name: "Northern Industrial Trust",
    tickerSymbol: "NIT",
    scope: "country",
    kind: "broad",
    anchorCurrencyCode: "USD",
    status: "active",
    quotedNav: 100,
    unitSupply: 1_000,
    reserveUnits: 0,
    cashAnchor: 100_000,
    targetConstituents: [],
    holdings: [],
    sponsorCorporationId: SPONSOR,
    sponsorName: "Sponsor Co",
    expenseRatioAnnual: 0.01,
    seedCapitalAnchor: 10_000_000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as IndexFund;
}

function makeDb(opts: {
  positions?: Partial<IndexFundPosition>[];
  windingDown?: IndexFund[];
  sponsorExists?: boolean;
  corporations?: Array<{ _id: ObjectId; name: string }>;
  claimed?: boolean;
  fund?: IndexFund;
  bondsRemaining?: () => number;
  queuedRedemptions?: () => number;
  openFundOrders?: Array<{ _id: ObjectId }>;
}) {
  const fundUpdate = vi.fn().mockResolvedValue({ modifiedCount: opts.claimed === false ? 0 : 1 });
  const positionsUpdateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  const txInsert = vi.fn().mockResolvedValue({ acknowledged: true });
  const centralBanksUpdate = vi.fn().mockResolvedValue({ matchedCount: 1 });
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "indexFunds")
        return {
          updateOne: fundUpdate,
          findOne: async () =>
            opts.fund ?? opts.windingDown?.[0] ?? makeFund({ status: "winding_down" }),
          find: () => ({ toArray: () => Promise.resolve(opts.windingDown ?? []) }),
        };
      if (name === "indexFundPositions")
        return {
          find: () => ({ toArray: () => Promise.resolve(opts.positions ?? []) }),
          updateMany: positionsUpdateMany,
        };
      if (name === "bonds")
        return {
          countDocuments: vi.fn(async () => opts.bondsRemaining?.() ?? 0),
          aggregate: vi.fn(() => ({
            toArray: async () =>
              (opts.bondsRemaining?.() ?? 0) > 0
                ? (opts.windingDown ?? []).map((f) => ({ _id: f._id }))
                : [],
          })),
        };
      if (name === "indexFundTransactions") return { insertOne: txInsert };
      if (name === "indexFundRedemptionQueue")
        return { countDocuments: vi.fn(async () => opts.queuedRedemptions?.() ?? 0) };
      if (name === "shareOrders")
        return {
          find: () => ({ toArray: async () => opts.openFundOrders ?? [] }),
          countDocuments: vi.fn(async () => (opts.openFundOrders ?? []).length),
        };
      if (name === "corporations")
        return {
          findOne: vi
            .fn()
            .mockResolvedValue(
              opts.sponsorExists === false ? null : { _id: SPONSOR, name: "Sponsor Co" }
            ),
          find: () => ({ toArray: async () => opts.corporations ?? [] }),
          bulkWrite: vi.fn().mockResolvedValue({ matchedCount: 0 }),
        };
      if (name === "centralBanks") return { updateOne: centralBanksUpdate };
      return { countDocuments: vi.fn().mockResolvedValue(0) };
    }),
  } as unknown as Db;
  return { db, fundUpdate, positionsUpdateMany, txInsert, centralBanksUpdate };
}

describe("beginWindUp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to wind up a system fund, which has no sponsor", async () => {
    const { db } = makeDb({});
    const r = await beginWindUp(db, makeFund({ sponsorCorporationId: undefined }), 100);
    expect(r.ok).toBe(false);
  });

  it("is idempotent once a wind-up is already running", async () => {
    const { db, fundUpdate } = makeDb({});
    const r = await beginWindUp(db, makeFund({ status: "winding_down" }), 100);
    expect(r.ok).toBe(true);
    expect(fundUpdate).not.toHaveBeenCalled();
  });

  it("loses the race rather than restarting a fund someone else closed", async () => {
    const { db } = makeDb({ claimed: false });
    const r = await beginWindUp(db, makeFund(), 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });
});

describe("completeWindUp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pays holders at what the cash actually supports, not the last quote", async () => {
    // Marked at NAV 100 × 1,000 units = 100,000, but the portfolio only sold
    // for 80,000. Holders take that loss here; nobody covers an unfundable
    // quote.
    const positions = [{ _id: new ObjectId(), units: 1_000, holderKind: "character" as const }];
    const fund = makeFund({ status: "winding_down", cashAnchor: 80_000, quotedNav: 100 });
    const { db } = makeDb({ positions, fund });
    await completeWindUp(db, fund, 200);

    const payout = vi.mocked(payFundHolderCash).mock.calls[0][3];
    expect(payout).toBe(80_000);
  });

  it("returns the sponsor only what is left after holders are paid", async () => {
    const positions = [{ _id: new ObjectId(), units: 500, holderKind: "character" as const }];
    // 500 units against 100,000 cash → NAV 200, holders take 100,000, nothing
    // remains for the sponsor even though they seeded ₳10m.
    const fund = makeFund({ status: "winding_down", cashAnchor: 100_000, unitSupply: 500 });
    const { db } = makeDb({ positions, fund });
    await completeWindUp(db, fund, 200);
    expect(vi.mocked(creditCorpLiquidCapital)).not.toHaveBeenCalled();
  });

  it("does not pay the fund's own reserve units, and returns their share to the sponsor", async () => {
    // Half the units are the fund's own reserve. Those are not a liability to
    // anyone, so the cash behind them is what the sponsor gets back.
    const positions = [
      { _id: new ObjectId(), units: 500, holderKind: "character" as const },
      { _id: new ObjectId(), units: 500, holderKind: "fund_reserve" as const },
    ];
    const fund = makeFund({ status: "winding_down", cashAnchor: 100_000, unitSupply: 1_000 });
    const { db } = makeDb({ positions, fund });
    await completeWindUp(db, fund, 200);
    // NAV = 100,000 / 1,000 = 100. The character takes 50,000; the reserve's
    // 50,000 falls through to the sponsor.
    expect(vi.mocked(creditCorpLiquidCapital)).toHaveBeenCalledWith(db, SPONSOR, 50_000);
  });

  it("returns the whole balance to the sponsor when no units are held", async () => {
    const fund = makeFund({ status: "winding_down", cashAnchor: 250_000, unitSupply: 0 });
    const { db } = makeDb({ positions: [], fund });
    await completeWindUp(db, fund, 200);
    expect(vi.mocked(creditCorpLiquidCapital)).toHaveBeenCalledWith(db, SPONSOR, 250_000);
  });

  it("delists the fund and zeroes its units", async () => {
    const fund = makeFund({ status: "winding_down", cashAnchor: 0, unitSupply: 0 });
    const { db, fundUpdate, positionsUpdateMany } = makeDb({ positions: [], fund });
    await completeWindUp(db, fund, 200);
    const set = fundUpdate.mock.calls[0][1].$set;
    expect(set.status).toBe("delisted");
    expect(set.unitSupply).toBe(0);
    expect(set.cashAnchor).toBe(0);
    expect(positionsUpdateMany).toHaveBeenCalled();
  });
});

describe("wind-up when a corporation no longer exists", () => {
  beforeEach(() => vi.clearAllMocks());

  it("escheats the sponsor residual to the central bank reserve instead of freezing", async () => {
    // The sponsor corporation was deleted while the fund was winding down.
    // Nothing is owed to anyone, so the residual follows unowned equity to the
    // country's central bank reserve instead of throwing every turn.
    const fund = makeFund({
      status: "winding_down",
      cashAnchor: 250_000,
      unitSupply: 0,
      countryId: "US",
    });
    const { db, fundUpdate, centralBanksUpdate } = makeDb({
      positions: [],
      fund,
      sponsorExists: false,
    });

    await completeWindUp(db, fund, 200);

    expect(centralBanksUpdate).toHaveBeenCalledTimes(1);
    expect(centralBanksUpdate.mock.calls[0][1].$inc.reserveBalance).toBe(250_000);
    expect(vi.mocked(creditCorpLiquidCapital)).not.toHaveBeenCalled();
    expect(fundUpdate.mock.calls.at(-1)![1].$set.status).toBe("delisted");
  });

  it("escheats a dead corporate holder's slice without gifting it to the sponsor", async () => {
    const missing = new ObjectId();
    const positions = [
      { _id: new ObjectId(), units: 500, holderKind: "character" as const },
      {
        _id: new ObjectId(),
        units: 500,
        holderKind: "corporation" as const,
        corporationId: missing,
      },
    ];
    const fund = makeFund({
      status: "winding_down",
      cashAnchor: 100_000,
      unitSupply: 1_000,
      countryId: "US",
    });
    const { db, centralBanksUpdate } = makeDb({ positions, fund, corporations: [] });

    await completeWindUp(db, fund, 200);

    // NAV = 100. The character takes their 50,000; the dead holder's 50,000
    // goes to the reserve, so it never falls through to the sponsor.
    expect(vi.mocked(payFundHolderCash)).toHaveBeenCalledWith(db, fund, positions[0], 50_000);
    expect(centralBanksUpdate.mock.calls[0][1].$inc.reserveBalance).toBe(50_000);
    expect(vi.mocked(creditCorpLiquidCapital)).not.toHaveBeenCalled();
  });

  it("ignores a dead holder whose units are worth nothing", async () => {
    const positions = [
      {
        _id: new ObjectId(),
        units: 10,
        holderKind: "corporation" as const,
        corporationId: new ObjectId(),
      },
    ];
    const fund = makeFund({
      status: "winding_down",
      cashAnchor: 0,
      unitSupply: 10,
      countryId: "US",
    });
    const { db, centralBanksUpdate, fundUpdate } = makeDb({ positions, fund, corporations: [] });

    await completeWindUp(db, fund, 200);

    expect(centralBanksUpdate).not.toHaveBeenCalled();
    expect(fundUpdate.mock.calls.at(-1)![1].$set.status).toBe("delisted");
  });

  it("keeps the paid_units fraction when escheating a dead holder's slice", async () => {
    const positions = [
      { _id: new ObjectId(), units: 1, holderKind: "character" as const },
      {
        _id: new ObjectId(),
        units: 2,
        holderKind: "corporation" as const,
        corporationId: new ObjectId(),
      },
    ];
    const fund = makeFund({
      status: "winding_down",
      cashAnchor: 10,
      unitSupply: 3,
      seedAccounting: "paid_units",
      countryId: "US",
    });
    const { db, centralBanksUpdate } = makeDb({ positions, fund, corporations: [] });

    await completeWindUp(db, fund, 200);

    // NAV = 10/3; the dead holder's 2 units are worth 20/3, not a floored 6.
    expect(centralBanksUpdate.mock.calls[0][1].$inc.reserveBalance).toBeCloseTo(20 / 3, 9);
    expect(vi.mocked(creditCorpLiquidCapital)).not.toHaveBeenCalled();
  });

  it("floors a legacy seed slice the same way live holders are paid", async () => {
    const positions = [
      { _id: new ObjectId(), units: 1, holderKind: "character" as const },
      {
        _id: new ObjectId(),
        units: 2,
        holderKind: "corporation" as const,
        corporationId: new ObjectId(),
      },
    ];
    const fund = makeFund({
      status: "winding_down",
      cashAnchor: 10,
      unitSupply: 3,
      seedAccounting: "legacy_residual",
      countryId: "US",
    });
    const { db, centralBanksUpdate } = makeDb({ positions, fund, corporations: [] });

    await completeWindUp(db, fund, 200);

    // NAV = 10/3. Character 3 + dead holder 6 = 9 distributed; the 1 left over
    // is the sponsor's legacy residual.
    expect(centralBanksUpdate.mock.calls[0][1].$inc.reserveBalance).toBe(6);
    expect(vi.mocked(creditCorpLiquidCapital)).toHaveBeenCalledWith(db, SPONSOR, 1);
  });
});

describe("advanceWindDowns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sells the portfolio first and does not pay anyone while holdings remain", async () => {
    const fund = makeFund({
      status: "winding_down",
      holdings: [{ corporationId: new ObjectId(), shares: 10, lastValueAnchor: 50_000 }],
    });
    const { db } = makeDb({ windingDown: [fund], positions: [] });
    const r = await advanceWindDowns(db, 200);
    expect(r.fundsProcessed).toBe(1);
    expect(r.fundsCompleted).toBe(0);
    expect(vi.mocked(sellFundHoldingsForRedemptionCash)).toHaveBeenCalled();
    expect(vi.mocked(payFundHolderCash)).not.toHaveBeenCalled();
  });

  it("sells bonds before completing and pays out the fresh cash balance", async () => {
    const fund = makeFund({ status: "winding_down", cashAnchor: 10_000 });
    const current = { ...fund };
    let bondsRemaining = 1;
    const { db, fundUpdate } = makeDb({
      windingDown: [fund],
      fund: current,
      bondsRemaining: () => bondsRemaining,
    });
    vi.mocked(sellFundBondHoldingsForCash).mockImplementationOnce(async () => {
      bondsRemaining = 0;
      current.cashAnchor += 5_000;
      return { proceedsAnchor: 5_000, unitsSold: 10, bondsTouched: 1 };
    });
    const r = await advanceWindDowns(db, 200);
    expect(sellFundBondHoldingsForCash).toHaveBeenCalledWith(
      db,
      fund,
      Number.POSITIVE_INFINITY,
      expect.any(Date),
      { turn: 200 }
    );
    expect(r.fundsCompleted).toBe(1);
    expect(r.errors).toEqual([]);
    expect(fundUpdate.mock.calls[0][1].$set.status).toBe("delisted");
    expect(creditCorpLiquidCapital).toHaveBeenCalledWith(db, SPONSOR, 15_000);
  });

  it("waits without an error when bond units remain after a sale", async () => {
    const fund = makeFund({ status: "winding_down" });
    const { db, fundUpdate } = makeDb({ windingDown: [fund], bondsRemaining: () => 1 });
    const r = await advanceWindDowns(db, 200);
    expect(sellFundBondHoldingsForCash).toHaveBeenCalled();
    expect(r.fundsCompleted).toBe(0);
    expect(r.errors).toEqual([]);
    expect(fundUpdate).not.toHaveBeenCalled();
    expect(payFundHolderCash).not.toHaveBeenCalled();
  });

  it("finishes a fund whose portfolio has become cash", async () => {
    const fund = makeFund({ status: "winding_down", holdings: [], cashAnchor: 10_000 });
    const { db } = makeDb({ windingDown: [fund], positions: [] });
    const r = await advanceWindDowns(db, 200);
    expect(r.fundsCompleted).toBe(1);
    expect(processQueuedRedemptions).not.toHaveBeenCalled();
  });

  it("pays queued withdrawals at the NAV the cash supports, then completes", async () => {
    // Stale quote: 186 while the cash backs 1,431,000 / (7,000 + 155 burned) = 200.
    const fund = makeFund({
      status: "winding_down",
      holdings: [],
      cashAnchor: 1_431_000,
      unitSupply: 7_000,
      quotedNav: 186,
    });
    let queued = 3;
    const { db, fundUpdate } = makeDb({
      windingDown: [fund],
      positions: [],
      queuedRedemptions: () => queued,
    });
    vi.mocked(loadQueuedRedemptionUnitsByFundId).mockResolvedValueOnce(
      new Map([[String(fund._id), 155]])
    );
    vi.mocked(processQueuedRedemptions).mockImplementationOnce(async () => {
      queued = 0;
      return 3;
    });

    const r = await advanceWindDowns(db, 356, { forexEnabled: false });

    expect(fundUpdate.mock.calls[0][1].$set.quotedNav).toBeCloseTo(200, 9);
    const [, servedFund, forex, turn] = vi.mocked(processQueuedRedemptions).mock.calls[0];
    expect(servedFund.quotedNav).toBeCloseTo(200, 9);
    expect(forex).toBe(false);
    expect(turn).toBe(356);
    expect(r.errors).toEqual([]);
    expect(r.fundsCompleted).toBe(1);
    expect(fundUpdate.mock.calls.at(-1)![1].$set.status).toBe("delisted");
  });

  it("does not complete while withdrawals are still queued", async () => {
    const fund = makeFund({ status: "winding_down", holdings: [], cashAnchor: 10_000 });
    const { db, fundUpdate } = makeDb({
      windingDown: [fund],
      positions: [{ fundId: fund._id, holderKind: "character", units: 10 }],
      queuedRedemptions: () => 2,
    });
    const r = await advanceWindDowns(db, 356, { forexEnabled: true });
    expect(processQueuedRedemptions).toHaveBeenCalledTimes(1);
    expect(r.fundsCompleted).toBe(0);
    expect(r.errors).toEqual(["NIT: Fund settlement must finish before wind-up"]);
    expect(payFundHolderCash).not.toHaveBeenCalled();
    expect(fundUpdate.mock.calls.every((c) => c[1].$set.status !== "delisted")).toBe(true);
  });

  it("leaves queued withdrawals alone while bonds remain", async () => {
    const fund = makeFund({ status: "winding_down", holdings: [] });
    const { db } = makeDb({
      windingDown: [fund],
      bondsRemaining: () => 1,
      queuedRedemptions: () => 2,
    });
    const r = await advanceWindDowns(db, 356, { forexEnabled: true });
    expect(processQueuedRedemptions).not.toHaveBeenCalled();
    expect(r.errors).toEqual([]);
  });
});

describe("#4219 wind-up clears settlement blockers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels resting fund orders and refunds queued subscriptions before completing", async () => {
    const orderId = new ObjectId();
    const openOrders = [{ _id: orderId }];
    const fund = makeFund({ status: "winding_down", holdings: [], cashAnchor: 10_000 });
    const { db, fundUpdate } = makeDb({
      windingDown: [fund],
      positions: [],
      openFundOrders: openOrders,
    });

    // First pass: the order is still on the book, so completion must wait. The
    // helpers are the only things that can clear it.
    const blocked = await advanceWindDowns(db, 356, { forexEnabled: true });
    expect(cancelFundShareOrder).toHaveBeenCalledWith(db, orderId, 356);
    expect(refundQueuedSubscriptionsForFund).toHaveBeenCalledWith(db, fund._id, 356);
    expect(blocked.fundsCompleted).toBe(0);

    // Cancelling (mocked) removes the order; the next pass finishes the fund
    // instead of repeating the warning forever.
    openOrders.length = 0;
    const done = await advanceWindDowns(db, 357, { forexEnabled: true });
    expect(done.fundsCompleted).toBe(1);
    expect(done.errors).toEqual([]);
    expect(fundUpdate.mock.calls.at(-1)![1].$set.status).toBe("delisted");
  });

  it("does not repeat the warning when the blockers are gone", async () => {
    const fund = makeFund({ status: "winding_down", holdings: [], cashAnchor: 10_000 });
    const { db } = makeDb({ windingDown: [fund], positions: [], openFundOrders: [] });
    const r = await advanceWindDowns(db, 356, { forexEnabled: true });
    expect(r.errors).not.toContain("NIT: Fund settlement must finish before wind-up");
  });
});
