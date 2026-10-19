import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { entertainmentRemovalRescaleRatio } from "@/lib/corporations/entertainmentRemovalRescale";
import {
  ENTERTAINMENT_REMOVAL_MARKER,
  ENTERTAINMENT_RESCALE_STAMP,
  migrateEntertainmentRemoval,
  RETIRED_COMMODITY_ARCHIVE,
} from "./migrateEntertainmentRemoval";

const K = "entertainment_services";

function setup() {
  const memory = createInMemoryDb();
  memory.seed("gameConfig", [{ _id: "default" }]);
  memory.seed("corporateSectors", [
    {
      _id: "ent",
      sectorType: "media",
      mediaDiscriminator: "entertainment",
      strategyId: "standard",
      capitalStock: 1_000,
      buildQueue: [{ unitsOrdered: 100, paidAnchor: 5 }],
      otherOpexPerUnitAnchor: 4,
      soldByCommodity: { advertising: 1, [K]: 0.9 },
    },
    {
      _id: "news",
      sectorType: "media",
      strategyId: "standard",
      capitalStock: 500,
      soldByCommodity: { advertising: 0.5 },
    },
    { _id: "farm", sectorType: "agriculture", capitalStock: 50 },
  ]);
  memory.seed("commodityPrices", [
    { _id: "p1", commodity: K, priceRatio: 3.3 },
    { _id: "p2", commodity: "advertising", priceRatio: 1 },
  ]);
  memory.seed("supplyListings", [{ _id: "l1", commodity: K, aiListed: true }]);
  memory.seed("commodityFlows", [{ _id: "f1", commodity: K, turn: 300 }]);
  memory.seed("macroCountries", [
    { _id: "US", contribution: { byCommodity: { [K]: { supply: 1, demand: 2 }, food: {} } } },
  ]);
  return { memory, db: memory as unknown as Db };
}

const run = (db: Db) =>
  migrateEntertainmentRemoval(db, { turn: 310, plantsEnabled: true, now: new Date(0) });

describe("migrateEntertainmentRemoval", () => {
  it("rescales entertainment-lane stock, leaves other sectors alone, and clears the commodity", async () => {
    const { memory, db } = setup();
    const ratio = entertainmentRemovalRescaleRatio({
      sectorType: "media",
      mediaDiscriminator: "entertainment",
      strategyId: "standard",
    });
    expect(ratio).toBeGreaterThan(1);

    expect(await run(db)).toEqual({ rescaled: 1, archived: 3, deleted: 3 });

    const sectors = memory.collection("corporateSectors").docs;
    const ent = sectors.find((s) => s._id === "ent")!;
    expect(ent.capitalStock).toBeCloseTo(1_000 * ratio, 9);
    expect((ent.buildQueue as { unitsOrdered: number }[])[0].unitsOrdered).toBeCloseTo(
      100 * ratio,
      9
    );
    expect(ent.otherOpexPerUnitAnchor).toBeCloseTo(4 / ratio, 9);
    expect(ent[ENTERTAINMENT_RESCALE_STAMP]).toBe(true);
    expect(ent.soldByCommodity).toEqual({ advertising: 1 });

    const news = sectors.find((s) => s._id === "news")!;
    expect(news.capitalStock).toBe(500);
    expect(news[ENTERTAINMENT_RESCALE_STAMP]).toBeUndefined();
    expect(sectors.find((s) => s._id === "farm")!.capitalStock).toBe(50);

    expect(memory.collection("commodityPrices").docs.map((d) => d._id)).toEqual(["p2"]);
    expect(memory.collection("supplyListings").docs).toEqual([]);
    expect(memory.collection("commodityFlows").docs).toEqual([]);
    expect(memory.collection(RETIRED_COMMODITY_ARCHIVE).docs).toHaveLength(3);
    const macro = memory.collection("macroCountries").docs[0] as {
      contribution: { byCommodity: Record<string, unknown> };
    };
    expect(Object.keys(macro.contribution.byCommodity)).toEqual(["food"]);
    expect(memory.collection("gameConfig").docs[0][ENTERTAINMENT_REMOVAL_MARKER]).toBe(310);
  });

  it("runs once: a second turn changes nothing", async () => {
    const { memory, db } = setup();
    await run(db);
    const after = memory.collection("corporateSectors").docs.find((s) => s._id === "ent")!;
    const stock = after.capitalStock;
    expect(await run(db)).toEqual({ skipped: true });
    expect(after.capitalStock).toBe(stock);
  });

  it("never rescales a sector twice even if the marker was not written", async () => {
    const { memory, db } = setup();
    await run(db);
    const ent = memory.collection("corporateSectors").docs.find((s) => s._id === "ent")!;
    const stock = ent.capitalStock;
    delete memory.collection("gameConfig").docs[0][ENTERTAINMENT_REMOVAL_MARKER];
    expect(await run(db)).toEqual({ rescaled: 0, archived: 0, deleted: 0 });
    expect(ent.capitalStock).toBe(stock);
  });

  it("only stamps when plants is off, as a strategy switch does", async () => {
    const { memory, db } = setup();
    await migrateEntertainmentRemoval(db, { turn: 310, plantsEnabled: false, now: new Date(0) });
    const ent = memory.collection("corporateSectors").docs.find((s) => s._id === "ent")!;
    expect(ent.capitalStock).toBe(1_000);
    expect(ent[ENTERTAINMENT_RESCALE_STAMP]).toBe(true);
  });
});
