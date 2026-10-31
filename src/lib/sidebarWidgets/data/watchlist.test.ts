import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { loadWatchlist } from "./watchlist";

function cursor(rows: unknown[]) {
  return { toArray: vi.fn().mockResolvedValue(rows) };
}

function fakeDb(collections: Record<string, Record<string, unknown>>): Db {
  return { collection: (name: string) => collections[name] ?? {} } as unknown as Db;
}

const userId = new ObjectId().toString();

describe("loadWatchlist", () => {
  it("returns no rows without reading markets when nothing is watched", async () => {
    const corporations = { find: vi.fn() };
    const db = fakeDb({
      users: { findOne: vi.fn().mockResolvedValue({ widgetWatchlist: [] }) },
      corporations,
    });
    expect(await loadWatchlist(db, userId)).toEqual({ rows: [] });
    expect(corporations.find).not.toHaveBeenCalled();
  });

  it("prices companies and commodities against the previous turn, in saved order", async () => {
    const acme = new ObjectId();
    const quiet = new ObjectId();
    const corpHistoryFind = vi
      .fn()
      .mockReturnValue(cursor([{ corporationId: acme, sharePrice: 10 }]));
    const priceHistoryFind = vi
      .fn()
      .mockReturnValue(cursor([{ commodity: "oil", globalPrice: 50 }]));
    const db = fakeDb({
      users: {
        findOne: vi.fn().mockResolvedValue({
          widgetWatchlist: [
            { kind: "commodity", id: "oil" },
            { kind: "corporation", id: "4" },
            { kind: "corporation", id: "9" },
            { kind: "corporation", id: "77" },
            { kind: "commodity", id: "steel" },
          ],
        }),
      },
      gameState: { findOne: vi.fn().mockResolvedValue({ _id: "current", currentTurn: 20 }) },
      corporations: {
        find: vi.fn().mockReturnValue(
          cursor([
            {
              _id: acme,
              sequentialId: 4,
              name: "Acme",
              tickerSymbol: "ACM",
              sharePrice: 11,
              liquidCurrencyCode: "GBP",
            },
            { _id: quiet, sequentialId: 9, name: "Quiet Ltd", sharePrice: 3, isPrivate: true },
          ])
        ),
      },
      commodityPrices: {
        find: vi.fn().mockReturnValue(
          cursor([
            { commodity: "oil", globalPrice: 45, basePrice: 40 },
            { commodity: "steel", globalPrice: 120, basePrice: 100 },
          ])
        ),
      },
      corporationHistory: { find: corpHistoryFind },
      commodityPriceHistory: { find: priceHistoryFind },
    });

    const { rows } = await loadWatchlist(db, userId);

    expect(corpHistoryFind.mock.calls[0][0]).toEqual({
      corporationId: { $in: [acme, quiet] },
      turn: 19,
    });
    expect(priceHistoryFind.mock.calls[0][0]).toEqual({
      commodity: { $in: ["oil", "steel"] },
      turn: 19,
    });
    expect(rows).toEqual([
      {
        kind: "commodity",
        id: "oil",
        name: "Crude Oil",
        ticker: null,
        value: 45,
        currencyCode: null,
        change: expect.closeTo(-10, 5),
      },
      {
        kind: "corporation",
        id: "4",
        name: "Acme",
        ticker: "ACM",
        value: 11,
        currencyCode: "GBP",
        change: expect.closeTo(10, 5),
      },
      // Private companies have no share price to follow.
      {
        kind: "corporation",
        id: "9",
        name: "Quiet Ltd",
        ticker: null,
        value: null,
        currencyCode: null,
        change: null,
      },
      // A company that no longer exists stays listed so it can be removed.
      {
        kind: "corporation",
        id: "77",
        name: null,
        ticker: null,
        value: null,
        currencyCode: null,
        change: null,
      },
      {
        kind: "commodity",
        id: "steel",
        name: "Steel & Metals",
        ticker: null,
        value: 120,
        currencyCode: null,
        change: null,
      },
    ]);
  });
});
