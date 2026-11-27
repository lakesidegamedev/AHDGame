import { settleTransition } from "@/lib/banking/settlementJournal";
import { withSessionDb } from "@/lib/db/sessionDb";
import { beforeAll, beforeEach, afterAll, it, expect, describe, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { fundSovereignResolution } from "@/lib/sovereignDefault/resolution/funding";
import { fundFrontierRace, processFrontierRaces } from "@/lib/frontierRaces/service";
import { cancelQueue } from "@/lib/governorOffice/legislation/cancelQueue";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
vi.mock("@/lib/era/context", () => ({ getEraContext: async () => ({ year: 2050 }) }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
function intercept(
  db: Db,
  collectionName: string,
  operation: string,
  before: () => Promise<void>,
  after = false
): Db {
  return new Proxy(db, {
    get(target, key) {
      if (key === "collection")
        return (name: string) => {
          const collection = target.collection(name);
          if (name !== collectionName) return collection;
          return new Proxy(collection, {
            get(c, method) {
              const value = Reflect.get(c, method);
              if (method === operation)
                return async (...args: unknown[]) => {
                  if (!after) await before();
                  const result = await Reflect.apply(value, c, args);
                  if (after) await before();
                  return result;
                };
              return typeof value === "function" ? value.bind(c) : value;
            },
          });
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe.skipIf(!REAL_MONGO_ENABLED)("native crisis and prepaid recovery", () => {
  let mongo: IsolatedMongod, db: Db;
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-crisis-value-recovery-", {
      replicaSet: "crisisValueRecovery",
    });
    await mongo.client.db("admin").command({
      replSetInitiate: {
        _id: "crisisValueRecovery",
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
  beforeEach(async () => {
    await db.dropDatabase();
    await db
      .collection("gameState")
      .insertOne({ _id: "current" as never, currentTurn: 5, worldEpochId: "owned-crisis-fixture" });
  });
  afterAll(async () => {
    if (mongo) await stopIsolatedMongod(mongo);
  }, 30000);
  it.each(["bailout", "monetize"] as const)(
    "native %s rolls back after a landed receipt and overlapping retries conserve cash",
    async (kind) => {
      const lender = {
        _id: new ObjectId(),
        name: "IMF",
        countryId: "US",
        liquidCurrencyCode: "USD",
        liquidCapital: 10000,
      };
      const budget = {
        _id: "ca_federal",
        countryId: "CA",
        currencyCode: "CAD",
        treasuryCashLocal: 10,
        treasuryBalance: 10,
      };
      await db.collection("corporations").insertOne(lender);
      await db.collection("federalBudget").insertOne(budget as never);
      await db
        .collection("gameConfig")
        .insertOne({ _id: "default" as never, treasuryCashLedgerEnabled: true });
      await db.collection("exchangeRates").insertMany([
        { _id: "CA" as never, currencyCode: "CAD", rate: 2.8 },
        { _id: "US" as never, currencyCode: "USD", rate: 2 },
      ]);
      const input = {
        kind,
        budget: budget as never,
        countryId: "CA" as const,
        decisionKey: new ObjectId().toHexString(),
        turn: 5,
        now: new Date(),
        amountLocal: 1400,
        lender: lender as never,
      };
      let crashed = false;
      const fault = intercept(
        db,
        "financialTxLog",
        "insertMany",
        async () => {
          crashed = true;
          throw Error("landed receipt failure");
        },
        true
      );
      await expect(fundSovereignResolution(fault, input)).rejects.toThrow();
      expect(crashed).toBe(true);
      expect(
        (await db.collection("corporations").findOne({ _id: lender._id }))?.liquidCapital
      ).toBe(10000);
      expect(
        (await db.collection("federalBudget").findOne({ countryId: "CA" }))?.treasuryCashLocal
      ).toBe(10);
      expect(await db.collection("bankMoneyMoves").countDocuments()).toBe(0);
      expect(
        await Promise.all([fundSovereignResolution(db, input), fundSovereignResolution(db, input)])
      ).toEqual([true, true]);
      expect(
        (await db.collection("corporations").findOne({ _id: lender._id }))?.liquidCapital
      ).toBe(kind === "bailout" ? 9000 : 10000);
      expect(
        (await db.collection("federalBudget").findOne({ countryId: "CA" }))?.treasuryCashLocal
      ).toBe(1410);
      expect(await db.collection("bankMoneyMoves").countDocuments()).toBe(1);
    }
  );
  it("native frontier award rolls back its winner and delivers once after overlapping retries", async () => {
    const corp = new ObjectId(),
      key = "corporation:" + corp.toHexString();
    await db.collection("corporations").insertOne({ _id: corp, name: "Research", rdScore: 10000 });
    expect(
      (
        await fundFrontierRace(db, {
          raceId: "fusion",
          kind: "corporation",
          entityId: corp.toHexString(),
          points: 1000,
          turn: 5,
        })
      ).ok
    ).toBe(true);
    await db
      .collection("frontierRaces")
      .updateOne({ _id: "fusion" as never }, { $set: { ["contributions." + key]: 6000 } });
    let crashed = false;
    const fault = intercept(
      db,
      "corporations",
      "updateOne",
      async () => {
        crashed = true;
        throw Error("landed award failure");
      },
      true
    );
    await expect(processFrontierRaces(fault, 5)).rejects.toThrow();
    expect(crashed).toBe(true);
    expect(
      (await db.collection("frontierRaces").findOne({ _id: "fusion" as never }))?.winner
    ).toBeUndefined();
    const results = await Promise.all([processFrontierRaces(db, 5), processFrontierRaces(db, 5)]);
    expect(results.reduce((n, r) => n + r.racesWon, 0)).toBe(1);
    expect((await db.collection("corporations").findOne({ _id: corp }))?.frontierMethods).toEqual({
      fusion: "winner",
    });
  });
  it("native queue cancellation rolls back a landed refund and refunds once across a race", async () => {
    const actor = new ObjectId(),
      id = new ObjectId();
    await db.collection("characters").insertOne({ _id: actor, actions: 20, nationalInfluence: 6 });
    await db.collection("governorLegislationQueue").insertOne({
      _id: id,
      status: "pending",
      governorCharacterId: actor,
      proposalActionCost: 10,
      proposalNpiCost: 3,
    });
    let crashed = false;
    const fault = intercept(
      db,
      "characters",
      "updateOne",
      async () => {
        crashed = true;
        throw Error("landed refund failure");
      },
      true
    );
    await expect(cancelQueue(fault, id)).rejects.toThrow();
    expect(crashed).toBe(true);
    expect((await db.collection("characters").findOne({ _id: actor }))?.actions).toBe(20);
    const results = await Promise.all([cancelQueue(db, id), cancelQueue(db, id)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await db.collection("characters").findOne({ _id: actor })).toMatchObject({
      actions: 30,
      nationalInfluence: 9,
    });
  });
  it.each([false, true])(
    "native completed journal replay inside a required transaction (cash legs: %s)",
    async (cash) => {
      const id = new ObjectId();
      await db.collection("corporations").insertOne({ _id: id, liquidCapital: 100 });
      const transition = {
        key: "native-replay:" + id.toHexString(),
        kind: "native_replay",
        turn: 5,
        currency: "USD",
        legs: cash
          ? [
              {
                kind: "debit" as const,
                amount: 10,
                collection: "corporations",
                filter: { _id: id },
                path: "liquidCapital",
                note: "expense",
              },
              { kind: "burn" as const, amount: 10, note: "expense sink" },
            ]
          : [],
        projections: [
          {
            collection: "corporations",
            filter: { _id: id },
            update: { $inc: { replayCount: 1 } },
            note: "once",
          },
        ],
        event: {
          kind: "monetary.executed" as const,
          command: "native.replay",
          subjectType: "corporation" as const,
          subjectId: id.toHexString(),
          amount: cash ? 10 : 0,
          meta: {},
        },
      };
      await withSessionDb(db, (db) => settleTransition(db, transition));
      await expect(
        withSessionDb(db, (db) => settleTransition(db, transition))
      ).resolves.toMatchObject({ status: "replayed" });
      expect(await db.collection("corporations").findOne({ _id: id })).toMatchObject({
        liquidCapital: cash ? 90 : 100,
        replayCount: 1,
      });
    }
  );
});
