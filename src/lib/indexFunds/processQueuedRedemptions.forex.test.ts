/**
 * A forex-enabled pass must resolve one rate per fund currency (#5083).
 *
 * The pass loads every served fund's rate in one read and keys the map on
 * `currencyCode`. When that read projected only `rate`, the driver returned
 * documents without `currencyCode`, every currency lookup missed and the pass
 * deferred every fund with "FX rate unavailable" - paying nothing, claiming
 * nothing, and never stamping a queue row, turn after turn.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { IndexFund, IndexFundRedemptionQueueEntry } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { prepareQueuedRedemptionPass, processQueuedRedemptions } from "./processQueuedRedemptions";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const T0 = new Date("2000-01-01T00:00:00Z");
const RATES: Record<string, number> = { USD: 1.0758397012911238, GBP: 0.492796676261265 };

/**
 * `inMemoryDb` stores documents and ignores projections. The driver does not:
 * an inclusion projection returns only the fields it names (plus `_id`). Apply
 * the same rule on read so this test sees the document production sees.
 */
function withProjectedReads(db: Db): Db {
  const base = db;
  return new Proxy(base as unknown as Record<string, unknown>, {
    get(target, prop) {
      if (prop !== "collection") {
        const value = target[prop as string];
        return typeof value === "function" ? value.bind(base) : value;
      }
      return (name: string) => {
        const coll = (base.collection as unknown as (name: string) => inMemoryCollection)(name);
        return new Proxy(coll, {
          get(c, key) {
            if (key !== "find") {
              const value = (c as unknown as Record<string, unknown>)[key as string];
              return typeof value === "function" ? value.bind(c) : value;
            }
            return (filter: unknown, options?: { projection?: Record<string, number> }) => {
              const find = c.find as unknown as (
                filter: unknown,
                options?: { projection?: Record<string, number> }
              ) => { toArray(): Promise<Record<string, unknown>[]> };
              const cursor = find.call(c, filter, options);
              const projection = options?.projection;
              if (!projection) return cursor;
              const keep = Object.keys(projection).filter((field) => projection[field] === 1);
              const cursorProxy = new Proxy(cursor as unknown as Record<string, unknown>, {
                get(cu, method) {
                  if (method !== "toArray") {
                    const value = cu[method as string];
                    return typeof value === "function" ? value.bind(cursor) : value;
                  }
                  return async () =>
                    (await cursor.toArray()).map((doc) => {
                      const projected: Record<string, unknown> = { _id: doc._id };
                      for (const field of keep) if (field in doc) projected[field] = doc[field];
                      return projected;
                    });
                },
              });
              return cursorProxy;
            };
          },
        });
      };
    },
  }) as unknown as Db;
}

type inMemoryCollection = ReturnType<ReturnType<typeof createInMemoryDb>["collection"]>;

function world() {
  const memory = createInMemoryDb();
  const funds: IndexFund[] = ["USD", "GBP"].map((code, i) => ({
    _id: new ObjectId(),
    slug: `forex-pass-${code.toLowerCase()}`,
    name: `Forex Pass ${code}`,
    tickerSymbol: `FX${i}`,
    scope: "country",
    kind: "broad",
    countryId: code === "USD" ? "US" : "UK",
    anchorCurrencyCode: code as IndexFund["anchorCurrencyCode"],
    status: "active",
    quotedNav: 100,
    unitSupply: 1_000_000,
    reserveUnits: 0,
    cashAnchor: 10_000,
    targetConstituents: [],
    holdings: [],
    createdAt: T0,
    updatedAt: T0,
  }));
  const npps: {
    _id: ObjectId;
    countryId: string;
    name: string;
    nppInvestmentCashAnchor: number;
  }[] = [];
  const entries: IndexFundRedemptionQueueEntry[] = [];
  for (const [fundIndex, fund] of funds.entries()) {
    for (let i = 0; i < 3; i += 1) {
      const npp = {
        _id: new ObjectId(),
        countryId: fund.countryId!,
        name: `NPP ${fundIndex}-${i}`,
        nppInvestmentCashAnchor: 0,
      };
      npps.push(npp);
      entries.push({
        _id: new ObjectId(),
        fundId: fund._id,
        holderKind: "npp",
        nppId: npp._id,
        units: 2,
        requestedNavAnchor: 100,
        requestedAmountAnchor: 200,
        paidAmountAnchor: 0,
        status: "queued",
        unitsBurnedAtRequest: true,
        createdAt: new Date(T0.getTime() + entries.length),
        updatedAt: new Date(T0.getTime() + entries.length),
      });
    }
  }
  memory.seed(
    "indexFunds",
    funds.map((fund) => ({ ...fund }))
  );
  memory.seed(
    "indexFundRedemptionQueue",
    entries.map((entry) => ({ ...entry }))
  );
  memory.seed("npps", npps);
  memory.seed(
    "exchangeRates",
    Object.entries(RATES).map(([currencyCode, rate]) => ({
      _id: currencyCode.slice(1),
      currencyCode,
      rate,
    }))
  );
  memory.seed("gameConfig", [{ _id: "default", ledgerShadow: true }]);
  return { memory, db: withProjectedReads(memory as unknown as Db), funds, entries };
}

describe("queued redemption pass with forex enabled", () => {
  it("resolves a usable rate for every fund currency it serves", async () => {
    const w = world();
    const context = await prepareQueuedRedemptionPass(w.db, w.funds, true);

    for (const [currency, rate] of Object.entries(RATES)) {
      expect(context.fxRateByCurrency.get(currency as CurrencyCode)).toEqual({
        rate,
        ok: true,
      });
    }
  });

  it("pays queues across several funds from one shared pass context", async () => {
    const w = world();
    const context = await prepareQueuedRedemptionPass(w.db, w.funds, true);
    const budget = { claimsLeft: 10 };
    let paid = 0;
    for (const fund of w.funds) {
      paid += await processQueuedRedemptions(w.db, fund, true, 500, true, budget, context);
    }

    expect(paid).toBe(w.entries.length);
    const queue = await w.db
      .collection<IndexFundRedemptionQueueEntry>("indexFundRedemptionQueue")
      .find({})
      .toArray();
    expect(queue.filter((entry) => entry.status !== "paid")).toHaveLength(0);
    expect(queue.filter((entry) => (entry.paidAmountAnchor ?? 0) > 0)).toHaveLength(
      w.entries.length
    );
  });

  it("still defers a fund whose currency has no published rate", async () => {
    const w = world();
    // EUR is served by no exchangeRates row in this world: the pass must keep
    // waiting rather than pay at an assumed rate.
    const eurFund: IndexFund = { ...w.funds[0], anchorCurrencyCode: "EUR" };
    const context = await prepareQueuedRedemptionPass(w.db, [eurFund], true);
    expect(context.fxRateByCurrency.get("EUR")).toEqual({ rate: 1, ok: false });

    const budget = { claimsLeft: 10 };
    const paid = await processQueuedRedemptions(w.db, eurFund, true, 500, true, budget, context);
    expect(paid).toBe(0);
    // Nothing was claimed: an untouched row still carries its request timestamp.
    expect(budget.claimsLeft).toBe(10);
    const queue = await w.db
      .collection<IndexFundRedemptionQueueEntry>("indexFundRedemptionQueue")
      .find({ fundId: eurFund._id })
      .toArray();
    expect(queue).toHaveLength(3);
    for (const entry of queue) {
      expect(entry.status).toBe("queued");
      expect(entry.updatedAt).toEqual(entry.createdAt);
    }
  });
});
