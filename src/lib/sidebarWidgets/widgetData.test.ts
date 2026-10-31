import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { loadSidebarWidgetData } from "./widgetData";

function fakeDb(collections: Record<string, Record<string, unknown>>): Db {
  return {
    collection: (name: string) => collections[name] ?? {},
  } as unknown as Db;
}

const viewer = { userId: new ObjectId().toString(), isAdmin: false, isModerator: false };

describe("loadSidebarWidgetData", () => {
  it("returns null for staff queues to players and for unresolved home tickers", async () => {
    const data = await loadSidebarWidgetData(
      fakeDb({}),
      ["staffQueues", "stockTicker:home"],
      viewer
    );
    expect(data).toEqual({ staffQueues: null, "stockTicker:home": null });
  });

  it("counts every staff queue for moderators and links them to the moderator panel", async () => {
    const count = (n: number) => ({ countDocuments: vi.fn().mockResolvedValue(n) });
    const data = await loadSidebarWidgetData(
      fakeDb({ wikiPages: count(2), altClusters: count(3), playerContentReports: count(1) }),
      ["staffQueues"],
      { ...viewer, isModerator: true }
    );
    expect(data.staffQueues).toEqual({
      admin: false,
      wikiReview: 2,
      altClusters: 3,
      playerReports: 1,
    });
  });

  it("builds a ticker with the change since the previous turn and a price trend", async () => {
    const id = new ObjectId();
    const historyFind = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { corporationId: id, turn: 9, sharePrice: 10 },
        { corporationId: id, turn: 8, sharePrice: 9 },
      ]),
    });
    const db = fakeDb({
      stockExchangeSnapshots: {
        findOne: vi.fn().mockResolvedValue({
          exchangeName: "NYSE",
          turn: 10,
          listings: [
            {
              _id: id,
              sequentialId: 4,
              name: "Acme",
              tickerSymbol: "ACM",
              sharePrice: 11,
              liquidCurrencyCode: "USD",
            },
          ],
        }),
      },
      corporationHistory: { find: historyFind },
    });
    const data = await loadSidebarWidgetData(
      db,
      ["stockTicker:nyse", "stockTicker:nowhere"],
      viewer
    );
    expect(data["stockTicker:nyse"]).toMatchObject({
      exchangeName: "NYSE",
      rows: [
        {
          sequentialId: 4,
          ticker: "ACM",
          sharePrice: 11,
          change: expect.closeTo(10, 5),
          series: [9, 10, 11],
        },
      ],
    });
    // One history read for every row, bounded to the last 12 turns.
    expect(historyFind).toHaveBeenCalledTimes(1);
    expect(historyFind.mock.calls[0]![0]).toEqual({
      corporationId: { $in: [id] },
      turn: { $gt: -2, $lt: 10 },
    });
    expect(data["stockTicker:nowhere"]).toBeNull();
  });

  it("loads the viewer's watchlist", async () => {
    const findOne = vi.fn().mockResolvedValue({ widgetWatchlist: [] });
    const data = await loadSidebarWidgetData(fakeDb({ users: { findOne } }), ["watchlist"], viewer);
    expect(data.watchlist).toEqual({ rows: [] });
    expect(findOne.mock.calls[0][0]).toEqual({ _id: new ObjectId(viewer.userId) });
  });

  it("leaves the change empty when the previous turn is missing", async () => {
    const id = new ObjectId();
    const db = fakeDb({
      stockExchangeSnapshots: {
        findOne: vi.fn().mockResolvedValue({
          exchangeName: "NYSE",
          turn: 10,
          listings: [{ _id: id, sequentialId: 4, name: "Acme", sharePrice: 11 }],
        }),
      },
      corporationHistory: {
        find: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([{ corporationId: id, turn: 7, sharePrice: 10 }]),
        }),
      },
    });
    const data = await loadSidebarWidgetData(db, ["stockTicker:nyse"], viewer);
    expect(data["stockTicker:nyse"]).toMatchObject({
      rows: [{ change: null, series: [10, 11] }],
    });
  });

  it("builds my company with share price, cash and income series", async () => {
    const characterId = new ObjectId();
    const corpId = new ObjectId();
    const db = fakeDb({
      users: { findOne: vi.fn().mockResolvedValue({ activeCharacterId: characterId }) },
      corporations: {
        findOne: vi.fn().mockResolvedValue({
          _id: corpId,
          name: "Acme",
          sequentialId: 3,
          liquidCapital: 500,
          liquidCurrencyCode: "USD",
          sharePrice: 12,
        }),
      },
      corporationHistory: {
        find: vi.fn().mockReturnValue({
          sort: () => ({
            limit: () => ({
              toArray: vi.fn().mockResolvedValue([
                { turn: 5, sharePrice: 12, liquidCapital: 500, revenue: 90, income: -4 },
                { turn: 4, sharePrice: 10, liquidCapital: 450, revenue: 80, income: 6 },
              ]),
            }),
          }),
        }),
      },
    });
    const data = await loadSidebarWidgetData(db, ["myCompany"], viewer);
    expect(data.myCompany).toMatchObject({
      sharePriceSeries: [10, 12],
      cashSeries: [450, 500],
      incomeSeries: [6, -4],
      income: -4,
      sharePriceChange: expect.closeTo(20, 5),
    });
  });

  it("isolates a failing widget", async () => {
    const db = fakeDb({
      users: { findOne: vi.fn().mockRejectedValue(new Error("down")) },
      wikiPages: { countDocuments: vi.fn().mockResolvedValue(0) },
      altClusters: { countDocuments: vi.fn().mockResolvedValue(0) },
      playerContentReports: { countDocuments: vi.fn().mockResolvedValue(0) },
    });
    const data = await loadSidebarWidgetData(db, ["myCompany", "staffQueues"], {
      ...viewer,
      isAdmin: true,
    });
    expect(data.myCompany).toBeNull();
    expect(data.staffQueues).toMatchObject({ admin: true });
  });
});
