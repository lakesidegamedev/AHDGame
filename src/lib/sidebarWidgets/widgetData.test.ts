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

  it("builds a ticker with the change since the previous turn", async () => {
    const id = new ObjectId();
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
      corporationHistory: {
        find: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([{ corporationId: id, sharePrice: 10 }]),
        }),
      },
    });
    const data = await loadSidebarWidgetData(
      db,
      ["stockTicker:nyse", "stockTicker:nowhere"],
      viewer
    );
    expect(data["stockTicker:nyse"]).toMatchObject({
      exchangeName: "NYSE",
      rows: [{ sequentialId: 4, ticker: "ACM", sharePrice: 11, change: expect.closeTo(10, 5) }],
    });
    expect(data["stockTicker:nowhere"]).toBeNull();
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
