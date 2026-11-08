import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { markNationalIndexFunds } from "./nationalIndexFunds";

const hook = vi.hoisted(() => ({ subscribe: () => {} }));
vi.mock("@/lib/indexFunds/fundValuation", () => ({
  loadQueuedRedemptionUnitsByFundId: async () => {
    hook.subscribe();
    return new Map();
  },
}));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: vi.fn(),
  loadTxThresholds: async () => ({}),
}));

function fundFixture() {
  return {
    _id: new ObjectId(),
    slug: "fr_national",
    name: "France",
    anchorCurrencyCode: "EUR",
    quotedNav: 100,
    unitSupply: 100,
    cashAnchor: 10_000,
    nationalIndex: { entityId: "FR" },
    backingRatio: 1,
    updatedAt: undefined as Date | undefined,
  };
}

type Fund = ReturnType<typeof fundFixture>;

/** A funds collection whose writes honour the filter, like the real one. */
function fakeDb(actual: Fund, beforeFirstWrite: () => void = () => {}) {
  let writes = 0;
  return {
    collection: () => ({
      find: () => ({ toArray: async () => [{ ...actual }] }),
      bulkWrite: async (ops: any[]) => {
        if (writes++ === 0) beforeFirstWrite();
        let matchedCount = 0;
        for (const op of ops) {
          const { filter, update } = op.updateOne;
          if (filter.unitSupply !== undefined && filter.unitSupply !== actual.unitSupply) continue;
          if (filter.quotedNav !== undefined && filter.quotedNav !== actual.quotedNav) continue;
          matchedCount++;
          Object.assign(actual, update.$set);
          actual.cashAnchor += update.$inc?.cashAnchor ?? 0;
        }
        return { matchedCount };
      },
      insertMany: async () => ({}),
    }),
  };
}

const MARK = [{ countryId: "FR", displayName: "France", currencyCode: "EUR", nav: 110 }];

describe("national index fund marking", () => {
  it("keeps cash equal to all unit claims if a subscription arrives while reading queued units", async () => {
    const actual = fundFixture();
    hook.subscribe = () => {
      actual.unitSupply += 10;
      actual.cashAnchor += 1000;
    };
    await markNationalIndexFunds(fakeDb(actual) as never, MARK, 7);
    expect(actual.cashAnchor).toBe(actual.quotedNav * actual.unitSupply);
    hook.subscribe = () => {};
  });

  it("re-prices when a subscription lands between the last read and the write", async () => {
    const actual = fundFixture();
    const db = fakeDb(actual, () => {
      actual.unitSupply += 10;
      actual.cashAnchor += 1000;
    });
    const result = await markNationalIndexFunds(db as never, MARK, 7);
    expect(result.marked).toBe(1);
    expect(actual.quotedNav).toBe(110);
    expect(actual.cashAnchor).toBe(110 * 110);
  });
});
