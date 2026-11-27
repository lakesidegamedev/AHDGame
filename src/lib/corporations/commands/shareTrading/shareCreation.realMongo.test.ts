import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { createShareListing } from "./createShareListing";
import { POST as selfIssue } from "@/lib/api/commands/corporations/[id]/shares/self-issue/handlers";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: async () => null,
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
const owner = new ObjectId(),
  character = new ObjectId(),
  corp = new ObjectId();
describe.skipIf(!REAL_MONGO_ENABLED)("share creation on owned Mongo", () => {
  let mongo: IsolatedMongod | null = null,
    db: Db;
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-share-creation-", { replicaSet: "shareCreation" });
    await mongo.client.db("admin").command({
      replSetInitiate: {
        _id: "shareCreation",
        members: [{ _id: 0, host: new URL(mongo.uri).host }],
      },
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if ((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary).toBe(true);
    db = mongo.db;
  }, 60000);
  afterAll(async () => {
    await stopIsolatedMongod(mongo);
  }, 30000);
  beforeEach(async () => {
    await db.dropDatabase();
    await db.collection("gameState").insertOne({
      _id: "current",
      currentTurn: 100,
      isProcessing: false,
      worldEpochId: "test",
      forexEnabled: false,
    } as never);
    await db
      .collection("users")
      .insertOne({ _id: owner, activeCharacterId: character, activeCharacterType: "regular" });
    await db.collection("characters").insertOne({
      _id: character,
      userId: owner,
      name: "Owner",
      countryId: "US",
      cashOnHand: 10000,
    });
    await db.collection("corporations").insertOne({
      _id: corp,
      countryId: "US",
      name: "Company",
      liquidCurrencyCode: "USD",
      liquidCapital: 1000,
      sharePrice: 10,
      fundamentalSharePrice: 10,
      totalShares: 1000,
      publicFloat: 0,
      ceoId: character,
      userId: owner,
      shareholders: [{ characterId: character, shares: 1000, avgCostPerShare: 10 }],
    });
    await db.collection("exchangeRates").insertMany([
      { _id: "US", currencyCode: "USD", rate: 1 },
      { _id: "CA", currencyCode: "CAD", rate: 2 },
    ] as never[]);
    const { requireBasicAuth } = await import("@/lib/api/requireAuth");
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: owner.toString() },
    } as never);
  });
  async function run(action: "listing" | "issuance", shares: number, database = db) {
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(database);
    return (action === "listing" ? createShareListing : selfIssue)(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shares }),
      }),
      { params: Promise.resolve({ id: corp.toString() }) }
    );
  }
  it("parallel listings cannot publish more custody than exists", async () => {
    const results = await Promise.all([run("listing", 600), run("listing", 600)]);
    expect(results.filter((row) => row.ok)).toHaveLength(1);
    const company = await db.collection("corporations").findOne({ _id: corp });
    expect(company!.shareholders[0].shares).toBe(400);
    expect(await db.collection("shareListings").countDocuments()).toBe(1);
  });
  it("concurrent issuance respects cooldown and conserves buyer plus issuer cash", async () => {
    const results = await Promise.all([run("issuance", 10), run("issuance", 10)]);
    expect(results.filter((row) => row.ok)).toHaveLength(1);
    const company = await db.collection("corporations").findOne({ _id: corp });
    const holder = await db.collection("characters").findOne({ _id: character });
    expect(company!.totalShares).toBe(1010);
    expect(company!.liquidCapital + holder!.cashOnHand).toBeCloseTo(11000, 8);
    expect(await db.collection("financialTxLog").countDocuments()).toBe(1);
  });
  it("a lost CAD receipt acknowledgement rolls back both currency legs before retry", async () => {
    await db
      .collection("corporations")
      .updateOne({ _id: corp }, { $set: { countryId: "CA", liquidCurrencyCode: "CAD" } });
    let reached = false;
    const fault = new Proxy(db, {
      get(target, key) {
        if (key !== "collection") {
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (name: string) => {
          const c = target.collection(name);
          return new Proxy(c, {
            get(collection, method) {
              const value = Reflect.get(collection, method);
              if (typeof value !== "function") return value;
              if (name !== "financialTxLog" || method !== "insertOne")
                return value.bind(collection);
              return async (...args: unknown[]) => {
                const result = await value.apply(collection, args);
                if (!reached) {
                  reached = true;
                  throw new Error("Lost issuance receipt acknowledgement");
                }
                return result;
              };
            },
          });
        };
      },
    });
    expect((await run("issuance", 10, fault)).status).toBe(500);
    expect(reached).toBe(true);
    expect((await db.collection("characters").findOne({ _id: character }))!.cashOnHand).toBe(10000);
    expect((await db.collection("corporations").findOne({ _id: corp }))!.liquidCapital).toBe(1000);
    expect((await run("issuance", 10)).status).toBe(200);
    const company = await db.collection("corporations").findOne({ _id: corp });
    const holder = await db.collection("characters").findOne({ _id: character });
    expect(holder!.cashOnHand + company!.liquidCapital / 2).toBeCloseTo(10500, 8);
  });
});
