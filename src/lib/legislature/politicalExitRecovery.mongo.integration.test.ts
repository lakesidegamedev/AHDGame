import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { appointSenator } from "@/lib/government/commands/appointments";
import { buildVoterPartyAndWeightMaps } from "@/lib/congress/governmentVoteBreakdown";

vi.mock("@/lib/gameState", () => ({ getGameState: async () => ({ currentTurn: 100 }) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/analytics/officeTransitionAnalytics", () => ({
  captureOfficeTransition: vi.fn(async () => {}),
}));

const uri = process.env.FEDERATION_TEST_MONGO_URI;
describe.skipIf(!uri)("Senate vacancy transaction qualification", () => {
  let client: MongoClient;
  beforeAll(async () => {
    const address = new URL(uri!);
    if (address.protocol !== "mongodb:" || !["localhost", "127.0.0.1"].includes(address.hostname))
      throw new Error("Senate qualification requires explicit loopback Mongo");
    client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
  });
  afterAll(async () => {
    await client?.close();
  });
  async function fixture(vacancy: boolean) {
    const db = client.db(`ahd_test_senate_exit_${new ObjectId().toHexString()}`);
    const governor = new ObjectId(),
      user = new ObjectId(),
      a = new ObjectId(),
      b = new ObjectId();
    await db.collection("characters").insertMany([
      { _id: governor, userId: user, countryId: "US", homeState: "IL" },
      ...[a, b].map((_id) => ({
        _id,
        userId: new ObjectId(),
        countryId: "US",
        homeState: "IL",
        name: "Synthetic nominee",
        party: "1",
      })),
    ]);
    await db.collection("electedOfficials").insertMany([
      {
        _id: new ObjectId(),
        officeType: "governor",
        countryId: "US",
        state: "IL",
        characterId: governor,
      },
      ...(vacancy
        ? [
            {
              _id: new ObjectId(),
              officeType: "senate",
              countryId: "US",
              state: "IL",
              senateClass: 2,
              characterId: null,
              nppId: null,
            },
          ]
        : []),
    ]);
    const appoint = (id: ObjectId, target = db) =>
      appointSenator(target, user.toString(), {
        appointeeId: id.toString(),
        appointeeType: "character",
        senateClass: 2,
      });
    return { db, a, b, appoint };
  }
  it.each([false, true])(
    "seats only one competing appointee (existing vacancy %s)",
    async (vacancy) => {
      const f = await fixture(vacancy);
      try {
        const results = await Promise.allSettled([f.appoint(f.a), f.appoint(f.b)]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const seats = await f.db
          .collection("electedOfficials")
          .find({ officeType: "senate" })
          .toArray();
        expect(seats).toHaveLength(1);
        expect(seats[0].countryId).toBe("US");
        const winner = seats[0].characterId as ObjectId;
        const maps = await buildVoterPartyAndWeightMaps(f.db, "US", "senate", [winner.toString()]);
        expect(maps.weightMap.get(winner.toString())).toBe(1);
        expect(
          await f.db.collection("characters").countDocuments({ "currentOffice.type": "senate" })
        ).toBe(1);
      } finally {
        await f.db.dropDatabase();
      }
    }
  );
  it("rolls back the seat and fence if character seating is interrupted", async () => {
    const f = await fixture(false);
    let interrupt = true;
    const faultDb = new Proxy(f.db, {
      get(target, key) {
        if (key !== "collection") {
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (name: string) =>
          new Proxy(target.collection(name), {
            get(col, method) {
              const value = Reflect.get(col, method);
              if (typeof value !== "function") return value;
              if (name === "characters" && method === "updateOne")
                return async (...args: unknown[]) => {
                  const result = await value.apply(col, args);
                  if (interrupt) {
                    interrupt = false;
                    throw new Error("interrupted seating");
                  }
                  return result;
                };
              return value.bind(col);
            },
          });
      },
    }) as Db;
    try {
      await expect(f.appoint(f.a, faultDb)).rejects.toThrow("interrupted seating");
      expect(
        await f.db.collection("electedOfficials").countDocuments({ officeType: "senate" })
      ).toBe(0);
      expect(
        (await f.db.collection("electedOfficials").findOne({ officeType: "governor" }))
          ?.senateAppointmentRevision
      ).toBeUndefined();
      await f.appoint(f.a);
      expect(
        await f.db
          .collection("electedOfficials")
          .countDocuments({ officeType: "senate", countryId: "US", characterId: f.a })
      ).toBe(1);
    } finally {
      await f.db.dropDatabase();
    }
  });
});
