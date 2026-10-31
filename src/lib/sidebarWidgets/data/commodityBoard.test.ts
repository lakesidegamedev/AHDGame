import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { BOARD_COMMODITIES, loadCommodityBoard } from "./commodityBoard";

function fakeDb(prices: unknown[], history: unknown[]) {
  const priceFind = vi.fn((_filter: unknown, _options?: unknown) => ({
    toArray: vi.fn().mockResolvedValue(prices),
  }));
  const historyFind = vi.fn((_filter: unknown, _options?: unknown) => ({
    toArray: vi.fn().mockResolvedValue(history),
  }));
  const db = {
    collection: (name: string) =>
      name === "commodityPrices" ? { find: priceFind } : { find: historyFind },
  } as unknown as Db;
  return { db, priceFind, historyFind };
}

describe("loadCommodityBoard", () => {
  it("builds rows in board order with a trend ending at the live price", async () => {
    const { db, priceFind, historyFind } = fakeDb(
      [
        { commodity: "steel", globalPrice: 110, turn: 30 },
        { commodity: "oil", globalPrice: 50, turn: 30 },
      ],
      [
        { commodity: "oil", turn: 28, globalPrice: 40 },
        { commodity: "oil", turn: 29, globalPrice: 45 },
        { commodity: "steel", turn: 29, globalPrice: 100 },
      ]
    );
    const data = await loadCommodityBoard(db);
    expect(priceFind.mock.calls[0]![0]).toEqual({ commodity: { $in: [...BOARD_COMMODITIES] } });
    expect(historyFind).toHaveBeenCalledTimes(1);
    expect(historyFind.mock.calls[0]![0]).toEqual({
      commodity: { $in: ["steel", "oil"] },
      turn: { $gt: 18, $lt: 30 },
    });
    expect(data?.turn).toBe(30);
    expect(data?.rows.map((row) => row.commodity)).toEqual(["oil", "steel"]);
    expect(data?.rows[0]).toMatchObject({
      label: expect.any(String),
      price: 50,
      series: [40, 45, 50],
      change: expect.closeTo(11.11, 1),
    });
    expect(data?.rows[1]).toMatchObject({ series: [100, 110], change: expect.closeTo(10, 5) });
  });

  it("leaves the change empty without history and returns null without prices", async () => {
    const withoutHistory = fakeDb([{ commodity: "coal", globalPrice: 5, turn: 2 }], []);
    expect((await loadCommodityBoard(withoutHistory.db))?.rows[0]).toMatchObject({
      change: null,
      series: [5],
    });
    expect(await loadCommodityBoard(fakeDb([], []).db)).toBeNull();
  });
});
