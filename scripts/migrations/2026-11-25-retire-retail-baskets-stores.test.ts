import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { retireRetailBaskets } from "./2026-11-25-retire-retail-baskets-stores";

type Row = Record<string, unknown>;

/** Just enough of a Db: counts, one pull, one unset and deletes, over plain arrays. */
function fakeDb(data: Record<string, Row[]>) {
  const matches = (row: Row, filter: Row): boolean =>
    Object.entries(filter).every(([key, want]) => {
      if (key === "producerInventory.outputStock")
        return (
          ((row.producerInventory as Row | undefined)?.outputStock as Row[] | undefined) ?? []
        ).some((s) => s.commodity === "retail");
      if (key.startsWith("producerQuotes."))
        return key.slice("producerQuotes.".length) in ((row.producerQuotes as Row) ?? {});
      return row[key] === want;
    });
  return {
    collection(name: string) {
      const rows = (data[name] ??= []);
      return {
        countDocuments: async (filter: Row) => rows.filter((r) => matches(r, filter)).length,
        updateMany: async (filter: Row, update: Row) => {
          for (const row of rows.filter((r) => matches(r, filter))) {
            const pull = update.$pull as Row | undefined;
            if (pull) {
              const inv = row.producerInventory as { outputStock: Row[] };
              inv.outputStock = inv.outputStock.filter((s) => s.commodity !== "retail");
            }
            if (update.$unset) delete (row.producerQuotes as Row).retail;
          }
        },
        deleteMany: async (filter: Row) => {
          data[name] = rows.filter((r) => !matches(r, filter));
        },
      };
    },
  } as unknown as Db;
}

const world = () => ({
  corporateSectors: [
    {
      sectorType: "retail",
      producerInventory: { outputStock: [{ commodity: "retail", units: 5 }] },
      producerQuotes: { retail: { kind: "manual" } },
    },
    {
      sectorType: "agriculture",
      producerInventory: { outputStock: [{ commodity: "food", units: 9 }] },
      producerQuotes: {},
    },
  ] as Row[],
  supplyListings: [{ commodity: "retail" }, { commodity: "food" }],
  supplyAgreements: [{ commodity: "retail" }],
  commodityPrices: [{ commodity: "retail" }, { commodity: "food" }],
  commodityPriceHistory: [{ commodity: "retail" }],
  commodityFlows: [{ commodity: "retail" }],
  tradeEmbargoes: [{ commodity: "retail" }],
});

describe("retire retail baskets migration", () => {
  it("reports and changes nothing on a dry run", async () => {
    const data = world();
    const report = await retireRetailBaskets(fakeDb(data), { apply: false });
    expect(report).toMatchObject({
      stockRows: 1,
      quotes: 1,
      listings: 1,
      priceRows: 1,
      retailSites: 1,
    });
    expect(data.supplyListings).toHaveLength(2);
    expect(data.corporateSectors[0].producerQuotes).toEqual({ retail: { kind: "manual" } });
  });

  it("clears every basket trace, keeps everything else, and is idempotent", async () => {
    const data = world();
    await retireRetailBaskets(fakeDb(data), { apply: true });
    expect(data.supplyListings).toEqual([{ commodity: "food" }]);
    expect(data.supplyAgreements).toEqual([]);
    expect(data.commodityPrices).toEqual([{ commodity: "food" }]);
    expect(data.commodityPriceHistory).toEqual([]);
    expect(data.commodityFlows).toEqual([]);
    expect(data.tradeEmbargoes).toEqual([]);
    // The retail site stays, with its owner, capacity and place; only the basket leftovers go.
    expect(data.corporateSectors).toHaveLength(2);
    expect(data.corporateSectors[0]).toMatchObject({
      sectorType: "retail",
      producerInventory: { outputStock: [] },
      producerQuotes: {},
    });
    expect(data.corporateSectors[1].producerInventory).toEqual({
      outputStock: [{ commodity: "food", units: 9 }],
    });
    const again = await retireRetailBaskets(fakeDb(data), { apply: true });
    expect(again).toMatchObject({
      stockRows: 0,
      quotes: 0,
      listings: 0,
      agreements: 0,
      priceRows: 0,
      priceHistoryRows: 0,
      flowRows: 0,
      embargoes: 0,
      retailSites: 1,
    });
  });
});
