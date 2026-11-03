import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  REAL_MONGO_ENABLED,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { migration } from "@/lib/migrations/entries/2026-10-27-national-party-npp-bills";
import { NATIONAL_NPP_IN_FLIGHT } from "./rules/nationalPartyNpp";
describe.runIf(REAL_MONGO_ENABLED)("National party NPP slot on isolated Mongo", () => {
  let fixture: IsolatedMongod | null = null;
  beforeAll(async () => {
    fixture = await startIsolatedMongod("ahd-national-party-");
    await migration.execute(fixture.db, { dryRun: false });
    await migration.execute(fixture.db, { dryRun: false });
  }, 60_000);
  afterAll(async () => {
    await stopIsolatedMongod(fixture);
  }, 30_000);
  it("serializes simultaneous House and Senate submissions and releases the slot after resolution", async () => {
    const collection = fixture!.db.collection("bills");
    const docs = ["house", "senate"].map((chamber) => ({
      countryId: "US",
      sponsorParty: "race",
      nppSponsored: true,
      status: "active",
      originChamber: chamber,
    }));
    const results = await Promise.allSettled(docs.map((doc) => collection.insertOne(doc)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.code
    ).toBe(11000);
    await collection.updateOne({ sponsorParty: "race" }, { $set: { status: "signed" } });
    await expect(collection.insertOne({ ...docs[0], _id: new ObjectId() })).resolves.toBeTruthy();
  });
  it.each(NATIONAL_NPP_IN_FLIGHT)("holds the party-wide slot during %s", async (status) => {
    const c = fixture!.db.collection("bills"),
      party = new ObjectId().toString();
    await c.insertOne({
      countryId: "US",
      sponsorParty: party,
      nppSponsored: true,
      status,
      currentChamber: "senate",
    });
    await expect(
      c.insertOne({
        countryId: "US",
        sponsorParty: party,
        nppSponsored: true,
        status: "active",
        currentChamber: "house",
      })
    ).rejects.toMatchObject({ code: 11000 });
  });
  it("does not constrain other countries, parties or human-sponsored bills", async () => {
    const c = fixture!.db.collection("bills");
    await expect(
      c.insertMany([
        { countryId: "US", sponsorParty: "scope", nppSponsored: true, status: "active" },
        { countryId: "UK", sponsorParty: "scope", nppSponsored: true, status: "active" },
        { countryId: "US", sponsorParty: "another", nppSponsored: true, status: "active" },
        { countryId: "US", sponsorParty: "scope", status: "active" },
      ])
    ).resolves.toMatchObject({ insertedCount: 4 });
  });
  it("reports legacy duplicates without deleting or rewriting bills", async () => {
    const db = fixture!.client.db("ahd_national_duplicate_fixture"),
      c = db.collection("bills");
    await c.insertMany(
      [1, 2].map(() => ({
        countryId: "US",
        sponsorParty: "1",
        nppSponsored: true,
        status: "active",
      }))
    );
    await expect(migration.execute(db, { dryRun: false })).rejects.toMatchObject({ code: 11000 });
    expect(await c.countDocuments({})).toBe(2);
  });
});
