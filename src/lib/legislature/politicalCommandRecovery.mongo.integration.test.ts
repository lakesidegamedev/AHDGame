import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { mergePartyInto } from "@/lib/parties/mergeParty";
import { admitPartyToCoalition } from "@/lib/coalitions/admitParty";

const uri = process.env.FEDERATION_TEST_MONGO_URI;
describe.skipIf(!uri)("political command transaction qualification", () => {
  let client: MongoClient;
  beforeAll(async () => {
    const address = new URL(uri!);
    if (address.protocol !== "mongodb:" || !["localhost", "127.0.0.1"].includes(address.hostname))
      throw new Error("Political qualification requires explicit loopback Mongo");
    client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
  });
  afterAll(async () => {
    await client?.close();
  });
  it("credits national and regional merger cash once under concurrent requests", async () => {
    const db = client.db(`ahd_test_political_merge_${new ObjectId().toHexString()}`),
      source = new ObjectId(),
      target = new ObjectId();
    try {
      await db.collection("politicalParties").insertMany([
        {
          _id: source,
          countryId: "CA",
          sequentialId: 1,
          treasury: 10000000000.25,
          committeeIds: [],
        },
        { _id: target, countryId: "CA", sequentialId: 2, treasury: 50.5, committeeIds: [] },
      ]);
      await db.collection<{ _id: string; [key: string]: unknown }>("statePartyOrg").insertMany([
        {
          _id: "ON_1",
          countryId: "CA",
          stateId: "ON",
          partyId: "1",
          treasury: 123.25,
          organizationUnits: 10,
        },
        {
          _id: "ON_2",
          countryId: "CA",
          stateId: "ON",
          partyId: "2",
          treasury: 456.75,
          organizationUnits: 20,
        },
      ]);
      const merge = () =>
        mergePartyInto(db, source, target, 100, { requireAdjacency: false, enforceNppCap: false });
      await Promise.all([merge(), merge()]);
      expect((await db.collection("politicalParties").findOne({ _id: source }))?.treasury).toBe(0);
      expect((await db.collection("politicalParties").findOne({ _id: target }))?.treasury).toBe(
        10000000050.75
      );
      expect(
        (
          await db
            .collection<{ _id: string; [key: string]: unknown }>("statePartyOrg")
            .find({})
            .toArray()
        ).map((r) => r.treasury)
      ).toEqual([580]);
      await merge();
      expect((await db.collection("politicalParties").findOne({ _id: target }))?.treasury).toBe(
        10000000050.75
      );
    } finally {
      await db.dropDatabase();
    }
  });
  it("admits a party into only one of two competing coalitions", async () => {
    const db = client.db(`ahd_test_political_coalition_${new ObjectId().toHexString()}`),
      party = new ObjectId(),
      a = new ObjectId(),
      b = new ObjectId();
    try {
      await db
        .collection("politicalParties")
        .insertOne({ _id: party, sequentialId: 1, coalitionId: null });
      await db.collection("coalitions").insertMany(
        [a, b].map((_id) => ({
          _id,
          members: [],
          pendingInvites: [{ partyId: party }],
          joinRequests: [],
        }))
      );
      const results = await Promise.all(
        [a, b].map((_id) =>
          admitPartyToCoalition(
            db,
            { _id },
            { _id: party, sequentialId: 1 },
            "pendingInvites",
            new Date("2026-11-22")
          )
        )
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      const row = await db.collection("politicalParties").findOne({ _id: party });
      const joined = await db.collection("coalitions").find({ "members.partyId": party }).toArray();
      expect(joined).toHaveLength(1);
      expect(joined[0]._id.equals(row!.coalitionId)).toBe(true);
    } finally {
      await db.dropDatabase();
    }
  });
});
