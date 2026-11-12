/** Missing seed caches qualify against synthetic regions on isolated Mongo. */
import { BSON, MongoClient, ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StateDemographics } from "@/lib/db/types";
import { backfillMissingRegionLeans } from "./backfillMissingRegionLeans";
import { jpRegions1991 } from "@/lib/countries/jp/data/jpRegions1991";
import { jpRegionDemographics1991 } from "@/lib/countries/jp/data/jpRegionDemographics1991";
const uri = process.env.FEDERATION_TEST_MONGO_URI;
const NOW = new Date("2026-10-04T00:00:00Z");
describe.skipIf(!uri)("Missing regional lean seed caches on isolated Mongo", () => {
  let client: MongoClient;
  let commands = 0,
    replyBytes = 0;
  beforeAll(async () => {
    const address = new URL(uri!);
    if (address.protocol !== "mongodb:" || !["127.0.0.1", "localhost"].includes(address.hostname))
      throw new Error("Isolated loopback Mongo required");
    client = new MongoClient(uri!, { monitorCommands: true, serverSelectionTimeoutMS: 5000 });
    client.on("commandStarted", () => commands++);
    client.on(
      "commandSucceeded",
      (event) => (replyBytes += BSON.calculateObjectSize({ reply: event.reply }) - 12)
    );
    await client.connect();
  });
  afterAll(async () => {
    await client?.close();
  });
  const PRESET = "1991-default";
  type Row = { _id: string; [key: string]: unknown };
  async function fixture(count = 1) {
    const db = client.db(`ahd_test_region_lean_${new ObjectId()}`);
    const ids = jpRegions1991.slice(0, count).map((row) => row._id);
    await db.collection<Row>("states").insertMany(ids.map((_id) => ({ _id, countryId: "JP" })));
    await db.collection<Row>("stateDemographics").insertMany(
      ids.map((_id) => ({
        _id,
        countryId: "JP",
        categoryWeights: { jpGroups: 100 },
        ignoredPayload: "x".repeat(100_000),
      }))
    );
    return db;
  }
  it("derives all eight authored 1991 Japan regions without hardcoded neutral values", async () => {
    const db = client.db(`ahd_test_region_lean_${new ObjectId()}`);
    try {
      await db
        .collection<{ _id: string; [key: string]: unknown }>("states")
        .insertMany(jpRegions1991.map((row) => ({ _id: row._id, countryId: row.countryId })));
      await db
        .collection<StateDemographics>("stateDemographics")
        .insertMany(jpRegionDemographics1991);
      expect(await backfillMissingRegionLeans(db, NOW, PRESET)).toEqual({
        written: 8,
        missingDemographics: 0,
        missingCategories: 0,
      });
      const states = await db.collection("states").find().toArray();
      expect(
        states.every(
          (row) => Number.isFinite(row.cachedEconomicLean) && Number.isFinite(row.cachedSocialLean)
        )
      ).toBe(true);
      expect(
        new Set(states.map((row) => `${row.cachedEconomicLean}:${row.cachedSocialLean}`)).size
      ).toBeGreaterThan(1);
      expect(
        await db.collection("stateDemographics").countDocuments({
          cachedEconomicLean: { $exists: true },
          cachedSocialLean: { $exists: true },
        })
      ).toBe(8);
    } finally {
      await db.dropDatabase();
    }
  });
  it("fills both cache readers from the census and retains valid existing regions", async () => {
    const db = await fixture(2);
    const [first, second] = jpRegions1991.map((row) => row._id);
    try {
      await db
        .collection<Row>("states")
        .updateOne({ _id: second }, { $set: { cachedEconomicLean: 1.2, cachedSocialLean: -0.4 } });
      expect(await backfillMissingRegionLeans(db, NOW, PRESET)).toEqual({
        written: 1,
        missingDemographics: 0,
        missingCategories: 0,
      });
      for (const collection of ["states", "stateDemographics"]) {
        const row = await db.collection<Row>(collection).findOne({ _id: first });
        expect(Number.isFinite(row?.cachedEconomicLean)).toBe(true);
        expect(Number.isFinite(row?.cachedSocialLean)).toBe(true);
      }
      expect(await db.collection<Row>("states").findOne({ _id: second })).toMatchObject({
        cachedEconomicLean: 1.2,
        cachedSocialLean: -0.4,
      });
      commands = 0;
      expect((await backfillMissingRegionLeans(db, NOW, PRESET)).written).toBe(0);
      expect(commands).toBe(1);
    } finally {
      await db.dropDatabase();
    }
  });
  it("does not manufacture neutral caches for missing or cross-country demographics", async () => {
    const db = await fixture(2);
    const [first, second] = jpRegions1991.map((row) => row._id);
    try {
      await db.collection<Row>("stateDemographics").deleteOne({ _id: first });
      await db
        .collection<Row>("stateDemographics")
        .updateOne({ _id: second }, { $set: { countryId: "US" } });
      expect(await backfillMissingRegionLeans(db, NOW, PRESET)).toEqual({
        written: 0,
        missingDemographics: 2,
        missingCategories: 0,
      });
      expect(
        await db.collection<Row>("states").countDocuments({ cachedEconomicLean: { $exists: true } })
      ).toBe(0);
    } finally {
      await db.dropDatabase();
    }
  });
  it("fills every region with bounded commands and projected payloads", async () => {
    const db = await fixture(jpRegions1991.length);
    try {
      commands = replyBytes = 0;
      expect((await backfillMissingRegionLeans(db, NOW, PRESET)).written).toBe(
        jpRegions1991.length
      );
      process.stdout.write(
        JSON.stringify({ path: "region-lean-census", commands, replyBytes }) + "\n"
      );
      expect(commands).toBeLessThanOrEqual(7);
      expect(replyBytes).toBeLessThan(100_000);
    } finally {
      await db.dropDatabase();
    }
  });
  it("retries after a failed demographic-cache write without falsely marking states complete", async () => {
    const db = await fixture();
    try {
      await db.command({
        collMod: "stateDemographics",
        validator: { cachedEconomicLean: { $exists: false } },
      });
      await expect(backfillMissingRegionLeans(db, NOW, PRESET)).rejects.toThrow();
      expect(
        await db
          .collection<{ _id: string; [key: string]: unknown }>("states")
          .findOne({ _id: jpRegions1991[0]._id })
      ).not.toHaveProperty("cachedEconomicLean");
      await db.command({ collMod: "stateDemographics", validator: {} });
      expect((await backfillMissingRegionLeans(db, NOW, PRESET)).written).toBe(1);
    } finally {
      await db.dropDatabase();
    }
  });
});
