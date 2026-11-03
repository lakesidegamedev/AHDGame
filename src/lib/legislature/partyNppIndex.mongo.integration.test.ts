import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  REAL_MONGO_ENABLED,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { migration } from "@/lib/migrations/entries/2026-10-27-party-npp-regional-bills";

describe.runIf(REAL_MONGO_ENABLED)("Party NPP sponsorship on isolated MongoDB", () => {
  let fixture: IsolatedMongod | null = null;
  beforeAll(async () => {
    fixture = await startIsolatedMongod("ahd-party-regional-");
    await migration.execute(fixture.db, { dryRun: false });
    await migration.execute(fixture.db, { dryRun: false });
  }, 60_000);
  afterAll(async () => {
    await stopIsolatedMongod(fixture);
  }, 30_000);

  it("allows only one concurrent chair-directed bill per NPP and frees the slot at resolution", async () => {
    const collection = fixture!.db.collection("stateBills");
    const nppId = new ObjectId();
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        collection.insertOne({
          countryId: "UK",
          stateId: "SCO",
          sponsorNppId: nppId,
          proposalPayerId: new ObjectId(),
          status: "active",
        })
      )
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason.code).toBe(11000);
    expect(await collection.countDocuments({ sponsorNppId: nppId, status: "active" })).toBe(1);
    await collection.updateOne(
      { sponsorNppId: nppId, status: "active" },
      { $set: { status: "enacted" } }
    );
    await expect(
      collection.insertOne({
        countryId: "UK",
        stateId: "SCO",
        sponsorNppId: nppId,
        proposalPayerId: new ObjectId(),
        status: "active",
      })
    ).resolves.toBeTruthy();
  });

  it.each(["proposed", "passed", "vetoed", "veto_override", "vote_closing", "override_closing"])(
    "retains the reservation while a bill is %s",
    async (status) => {
      const collection = fixture!.db.collection("stateBills");
      const bill = {
        countryId: "UK",
        stateId: "SCO",
        sponsorNppId: new ObjectId(),
        proposalPayerId: new ObjectId(),
        status,
      };
      await collection.insertOne({ ...bill });
      await expect(
        collection.insertOne({ ...bill, _id: new ObjectId(), status: "active" })
      ).rejects.toMatchObject({ code: 11000 });
    }
  );

  it("does not rewrite or impose new constraints on legacy bills without a payer field", async () => {
    const collection = fixture!.db.collection("stateBills");
    const bill = { countryId: "UK", sponsorNppId: new ObjectId(), status: "active" };
    await expect(collection.insertMany([{ ...bill }, { ...bill }])).resolves.toMatchObject({
      insertedCount: 2,
    });
  });
});
