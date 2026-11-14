import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { campaignCanadianRiding } from "./campaignRiding";

const uri = process.env.FEDERATION_TEST_MONGO_URI;
const electionId = new ObjectId(),
  characterId = new ObjectId();
const request = {
  stateId: "CA_ON",
  partyId: "1",
  characterId,
  electionId: String(electionId),
  districtIndex: 35001,
  ridingId: "CA-FED-2023-35001",
  planVersion: "2023",
  now: new Date("2026-11-14T12:00:00Z"),
};

describe.skipIf(!uri)("Canadian riding campaign transactions on isolated Mongo", () => {
  let client: MongoClient, db: Db;
  beforeAll(async () => {
    const address = new URL(uri!);
    if (address.protocol !== "mongodb:" || !["localhost", "127.0.0.1"].includes(address.hostname))
      throw new Error("Isolated loopback Mongo required");
    client = new MongoClient(uri!, {
      writeConcern: { w: "majority" },
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    if (!(await client.db("admin").command({ hello: 1 })).setName)
      throw new Error("Replica set required");
    db = client.db(`ahd_test_ca_riding_${new ObjectId()}`);
  });
  afterAll(async () => {
    if (db) await db.dropDatabase();
    await client?.close();
  });
  beforeEach(async () => {
    await db.dropDatabase();
    await db.collection("elections").insertOne({
      _id: electionId,
      countryId: "CA",
      state: "CA_ON",
      electionType: "caCommons",
      status: "active",
      districtCampaignBoosts: {},
    });
    await db
      .collection<{ _id: string; preset: string; currentTurn: number }>("gameState")
      .insertOne({
        _id: "current",
        preset: "2027-default",
        currentTurn: 1,
      });
    await db
      .collection("statePartyOrg")
      .insertOne({ countryId: "CA", stateId: "CA_ON", partyId: "1", politicalStrength: 100 });
    await db
      .collection("electionCandidates")
      .insertOne({ electionId, characterId, party: "1", status: "active" });
  });

  it("uses the US self/ally boost and political-strength cost with the existing pressure ladder", async () => {
    const first = await campaignCanadianRiding(db, request);
    expect(first).toMatchObject({ boost: 2.5, psCost: 2, efficiency: 1 });
    const second = await campaignCanadianRiding(db, { ...request, characterId: new ObjectId() });
    expect(second).toMatchObject({ boost: 3.75, efficiency: 0.5 });
    const org = await db.collection("statePartyOrg").findOne({ countryId: "CA" });
    expect(org?.politicalStrength).toBe(100 - first.psCost - second.psCost);
  });

  it("serializes concurrent actions without losing a boost or double charging", async () => {
    const outcomes = await Promise.all([
      campaignCanadianRiding(db, request),
      campaignCanadianRiding(db, request),
    ]);
    expect(
      (await db.collection("elections").findOne({ _id: electionId }))?.districtCampaignBoosts
    ).toEqual({ "35001": { "1": 5 } });
    expect(
      (await db.collection("statePartyOrg").findOne({ countryId: "CA" }))?.politicalStrength
    ).toBe(100 - outcomes.reduce((n, o) => n + o.psCost, 0));
  });

  it.each(["resolved", "completed", "cancelled"])(
    "refuses a %s election without spending",
    async (status) => {
      await db.collection("elections").updateOne({ _id: electionId }, { $set: { status } });
      await expect(campaignCanadianRiding(db, request)).rejects.toThrow(/open/);
      expect(
        (await db.collection("statePartyOrg").findOne({ countryId: "CA" }))?.politicalStrength
      ).toBe(100);
      expect(await db.collection("partyPoliticalStrengthLedger").countDocuments({})).toBe(0);
    }
  );

  it("rejects a stale plan, a different province, another country and an empty budget without partial writes", async () => {
    await expect(campaignCanadianRiding(db, { ...request, planVersion: "2013" })).rejects.toThrow(
      /version/
    );
    await expect(campaignCanadianRiding(db, { ...request, stateId: "CA_AB" })).rejects.toThrow(
      /province/
    );
    await db.collection("elections").updateOne({ _id: electionId }, { $set: { countryId: "US" } });
    await expect(campaignCanadianRiding(db, request)).rejects.toThrow(/open/);
    await db.collection("elections").updateOne({ _id: electionId }, { $set: { countryId: "CA" } });
    await db
      .collection("statePartyOrg")
      .updateOne({ countryId: "CA" }, { $set: { politicalStrength: 0 } });
    await expect(campaignCanadianRiding(db, request)).rejects.toThrow(/Insufficient/);
    expect(
      (await db.collection("elections").findOne({ _id: electionId }))?.districtCampaignBoosts
    ).toEqual({});
    expect(await db.collection("partyStrengthPressure").countDocuments({})).toBe(0);
  });

  it("rolls back strength, pressure and ledger if the final boost write cannot commit", async () => {
    const faulty = new Proxy(db, {
      get(target, key) {
        if (key !== "collection") {
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (name: string) => {
          const collection = target.collection(name);
          if (name !== "elections") return collection;
          return new Proxy(collection, {
            get(col, operation) {
              if (operation === "updateOne") return async () => ({ matchedCount: 0 });
              const value = Reflect.get(col, operation);
              return typeof value === "function" ? value.bind(col) : value;
            },
          });
        };
      },
    });
    await expect(campaignCanadianRiding(faulty, request)).rejects.toThrow(/no longer open/);
    expect(
      (await db.collection("statePartyOrg").findOne({ countryId: "CA" }))?.politicalStrength
    ).toBe(100);
    expect(await db.collection("partyStrengthPressure").countDocuments({})).toBe(0);
    expect(await db.collection("partyPoliticalStrengthLedger").countDocuments({})).toBe(0);
  });
});
