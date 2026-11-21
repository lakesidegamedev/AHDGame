import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { loadOverviewPreviews } from "./loadOverviewPreviews";

const { readStocks, readCommodities } = vi.hoisted(() => ({
  readStocks: vi.fn(),
  readCommodities: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/repositories/stockExchangeSnapshots", () => ({
  stockExchangeSnapshotsCollection: () => ({ findOne: readStocks }),
}));
vi.mock("@/lib/db/repositories/commodityPrices", () => ({
  commodityPricesCollection: () => ({ find: () => ({ toArray: readCommodities }) }),
}));

describe("initial Market overview", () => {
  it("serializes stock IDs and sends only overview fields", async () => {
    const id = new ObjectId();
    readStocks.mockResolvedValue({
      listings: [
        { _id: id, sequentialId: 1, name: "Example", marketCap: 450, sharePrice: 18 },
        { _id: new ObjectId(), sequentialId: 2, name: "NPP", isNpp: true, marketCap: 500 },
      ],
    });
    readCommodities.mockResolvedValue([{ commodity: "oil", basePrice: 10, globalPrice: 50 }]);

    const previews = await loadOverviewPreviews();
    expect(previews.stocks).toEqual([
      { _id: id.toHexString(), sequentialId: 1, name: "Example", sharePrice: 18 },
    ]);
    expect(previews.movers?.[0]).toMatchObject({
      commodity: "oil",
      basePrice: 10,
      globalPrice: 50,
    });
    expect(previews.movers).toHaveLength(5);
  });
});
