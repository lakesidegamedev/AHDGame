import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commoditiesTables";
import { normalizeOpeningPrices } from "./openingPriceApply";

type Doc = { _id: string; [key: string]: unknown };

const EPOCH = "world-epoch";
const STEEL = COMMODITY_BASE_PRICES.steel;
const COAL = COMMODITY_BASE_PRICES.coal;

async function world(state: Record<string, unknown> = {}): Promise<Db> {
  const db = createInMemoryDb() as unknown as Db;
  await db.collection<Doc>("gameState").insertOne({
    _id: "current",
    worldEpochId: EPOCH,
    currentTurn: 50,
    isProcessing: false,
    preset: "2019-default",
    ...state,
  });
  await db.collection<Doc>("gameConfig").insertOne({ _id: "default" });
  await db.collection<Doc>("commodityPrices").insertMany([
    {
      _id: "steel",
      commodity: "steel",
      globalPrice: STEEL * 2.4,
      statePrices: { a: STEEL * 2.2, b: STEEL * 1.9 },
      nationalPrices: { US: STEEL * 2.3 },
      scarcityMult: 1.7,
      scarcityMultByCountry: { US: 1.5 },
    },
    {
      _id: "coal",
      commodity: "coal",
      globalPrice: COAL * 2,
      hardPeg: COAL * 1.25,
      statePrices: { a: COAL * 2 },
      scarcityMult: 1.4,
    },
  ]);
  return db;
}

const prices = (db: Db, commodity: string) =>
  db.collection<Doc>("commodityPrices").findOne({ _id: commodity });

describe("normalizeOpeningPrices", () => {
  it("starts every commodity at base with neutral scarcity and keeps pegs", async () => {
    const db = await world();
    const report = await normalizeOpeningPrices(db);
    expect(report.status).toBe("applied");
    expect(report.commoditiesChanged).toBe(2);

    const steel = (await prices(db, "steel"))!;
    expect(steel.globalPrice as number).toBeCloseTo(STEEL, 1);
    for (const price of Object.values(steel.statePrices as Record<string, number>))
      expect(price).toBeCloseTo(STEEL, 1);
    expect((steel.nationalPrices as Record<string, number>).US).toBeCloseTo(STEEL, 1);
    expect(steel.scarcityMult).toBe(1);
    expect(steel.scarcityMultByCountry).toEqual({ US: 1 });

    const coal = (await prices(db, "coal"))!;
    expect(coal.hardPeg).toBeCloseTo(COAL * 1.25, 5);
    expect(coal.globalPrice as number).toBeCloseTo(COAL * 1.25, 1);
    expect(coal.scarcityMult).toBe(1);
  });

  it("applies the nominal price index", async () => {
    const db = await world();
    await db
      .collection<Doc>("gameConfig")
      .updateOne({ _id: "default" }, { $set: { commodityNominalPriceIndex: 1.1 } });
    await normalizeOpeningPrices(db);
    expect((await prices(db, "steel"))!.globalPrice as number).toBeCloseTo(STEEL * 1.1, 1);
  });

  it("changes nothing when run again", async () => {
    const db = await world();
    await normalizeOpeningPrices(db);
    const before = await db.collection<Doc>("commodityPrices").find({}).toArray();
    const again = await normalizeOpeningPrices(db);
    expect(again.status).toBe("alreadyAtBase");
    expect(again.commoditiesChanged).toBe(0);
    expect(await db.collection<Doc>("commodityPrices").find({}).toArray()).toEqual(before);
  });

  it("writes nothing on a dry run but reports what would change", async () => {
    const db = await world();
    const before = await db.collection<Doc>("commodityPrices").find({}).toArray();
    const report = await normalizeOpeningPrices(db, { dryRun: true });
    expect(report.status).toBe("dryRun");
    expect(report.commoditiesChanged).toBe(2);
    expect(report.changes[0]?.globalAfter).toBeGreaterThan(0);
    expect(await db.collection<Doc>("commodityPrices").find({}).toArray()).toEqual(before);
  });

  it("refuses while a turn is processing", async () => {
    const db = await world({ isProcessing: true });
    await expect(normalizeOpeningPrices(db)).rejects.toThrow(/turn is processing/);
    expect((await prices(db, "steel"))!.scarcityMult).toBe(1.7);
  });

  it("refuses another world", async () => {
    const db = await world();
    await expect(normalizeOpeningPrices(db, { expectedWorldEpoch: "other" })).rejects.toThrow(
      /not the live world/
    );
  });

  it("does not touch money, inventories or capacity", async () => {
    const db = await world();
    await db
      .collection<Doc>("corporateSectors")
      .insertOne({ _id: "s", cash: 5, producerInventory: { x: 1 }, capacity: 9 });
    await normalizeOpeningPrices(db);
    expect(await db.collection<Doc>("corporateSectors").findOne({ _id: "s" })).toEqual({
      _id: "s",
      cash: 5,
      producerInventory: { x: 1 },
      capacity: 9,
    });
  });
});
