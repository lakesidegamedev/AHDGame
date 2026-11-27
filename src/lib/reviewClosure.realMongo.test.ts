import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { ObjectId, type Db, type Document } from "mongodb";
import type { Character, IndexFund } from "@/lib/db/types";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { foundCorporation } from "@/lib/corporations/commands/founding/foundCorporation";
import { applyMoneyMove } from "@/lib/banking/moneyMove";
import { deployBondReserveFromCash } from "@/lib/indexFunds/fundBondReserve";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
vi.mock("@/lib/wireEvent", () => ({
  logWireEvent: vi.fn(),
  wireHeadlineCorpFounded: () => "Founded",
  wireHeadlineCorpIpo: () => "Listed",
}));
describe.skipIf(!REAL_MONGO_ENABLED)("review closure on an owned Mongo replica set", () => {
  let mongo: IsolatedMongod | null = null,
    db: Db;
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-review-closure-", {
      replicaSet: "closure",
      monitorCommands: true,
    });
    await mongo.client.db("admin").command({
      replSetInitiate: { _id: "closure", members: [{ _id: 0, host: new URL(mongo.uri).host }] },
    });
    const deadline = Date.now() + 30000;
    while (
      Date.now() < deadline &&
      !(await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary).toBe(true);
    db = mongo.db;
  }, 60000);
  afterAll(async () => {
    await stopIsolatedMongod(mongo);
  }, 30000);
  beforeEach(async () => {
    await db.dropDatabase();
    await db.collection<Document & { _id: string }>("gameState").insertOne({
      _id: "current",
      currentTurn: 200,
      currentYear: 2027,
      worldEpochId: "synthetic",
    });
  });
  it.each(["corporations", "corporationCeoVotes"])(
    "rolls back an acknowledged %s insert and retries only once",
    async (name) => {
      const character = {
        _id: new ObjectId(),
        name: "Synthetic founder",
        countryId: "US",
        homeState: "CA",
        cashOnHand: 1e9,
      } as Character;
      await db.collection("characters").insertOne(character);
      await db
        .collection<Document & { _id: string }>("states")
        .insertOne({ _id: "CA", countryId: "US", name: "California" });
      await db.collection("corporations").createIndex({ tickerSymbol: 1 }, { unique: true });
      let interrupted = false;
      const faulty = new Proxy(db, {
        get(target, property) {
          if (property !== "collection") {
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          }
          return (requested: string) => {
            const collection = target.collection(requested);
            return new Proxy(collection, {
              get(target, method) {
                const value = Reflect.get(target, method);
                if (requested === name && method === "insertOne")
                  return async (...args: unknown[]) => {
                    const result = await Reflect.apply(value, target, args);
                    if (!interrupted) {
                      interrupted = true;
                      throw new Error("Lost acknowledgement");
                    }
                    return result;
                  };
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
          };
        },
      });
      const input = {
        character,
        userId: new ObjectId().toHexString(),
        request: { name: "Synthetic Works", tickerSymbol: "SYNW", type: "manufacturing" as const },
      };
      await expect(foundCorporation({ ...input, db: faulty })).rejects.toThrow(
        "Lost acknowledgement"
      );
      expect((await db.collection("characters").findOne({ _id: character._id }))!.cashOnHand).toBe(
        1e9
      );
      expect(await db.collection("corporations").countDocuments({})).toBe(0);
      const replies = await Promise.all([
        foundCorporation({ ...input, db }),
        foundCorporation({ ...input, db }),
      ]);
      expect(replies[0]).toMatchObject({ ok: true, status: 201 });
      expect(replies[1]).toEqual(replies[0]);
      expect(await db.collection("corporations").countDocuments({})).toBe(1);
      expect(await db.collection("corporationCeoVotes").countDocuments({})).toBe(1);
    }
  );
  it.each([true, false])(
    "refuses a 100-unit transfer rounded to 128 on Mongo (large source=%s)",
    async (largeSource) => {
      const before = [largeSource ? 1e18 : 1000, largeSource ? 0 : 1e18];
      await db.collection<Document & { _id: string }>("wallets").insertMany([
        { _id: "source", cash: before[0] },
        { _id: "recipient", cash: before[1] },
      ]);
      const result = await applyMoneyMove(db, {
        key: "precision",
        kind: "synthetic",
        legs: [
          {
            kind: "debit",
            amount: 100,
            collection: "wallets",
            filter: { _id: "source" },
            path: "cash",
            note: "source",
          },
          {
            kind: "credit",
            amount: 100,
            collection: "wallets",
            filter: { _id: "recipient" },
            path: "cash",
            note: "recipient",
          },
        ],
      });
      expect(result.status).toBe("rejected");
      expect((await db.collection("wallets").findOne({ _id: "source" as never }))!.cash).toBe(
        before[0]
      );
      expect((await db.collection("wallets").findOne({ _id: "recipient" as never }))!.cash).toBe(
        before[1]
      );
    }
  );
  it("rolls back batch bond cash, custody and both receipts after a landed ledger failure", async () => {
    const fund: IndexFund = {
      _id: new ObjectId(),
      name: "Synthetic fund",
      slug: "synthetic",
      tickerSymbol: "SYN",
      kind: "broad",
      scope: "country",
      countryId: "US",
      anchorCurrencyCode: "USD",
      cashAnchor: 1e6,
      quotedNav: 100,
      unitSupply: 10000,
      reserveUnits: 0,
      holdings: [],
      targetConstituents: [],
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.collection("indexFunds").insertOne({ ...fund });
    await db.collection("exchangeRates").insertOne({ currencyCode: "USD", rate: 1 });
    await db.collection("bonds").insertMany(
      Array.from({ length: 10 }, () => ({
        _id: new ObjectId(),
        issuerType: "sovereign",
        countryId: "US",
        currencyCode: "USD",
        matured: false,
        defaulted: false,
        publicFloat: 10000,
        totalIssued: 1e7,
        faceValue: 1000,
        marketPrice: 1,
        holders: [],
        maturityTurn: 300,
      }))
    );
    let armed = true;
    const faulty = new Proxy(db, {
      get(target, key) {
        if (key !== "collection") {
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (name: string) =>
          new Proxy(target.collection(name), {
            get(collection, method) {
              const fn = Reflect.get(collection, method, collection);
              if (name === "financialTxLog" && method === "insertMany")
                return async (...args: unknown[]) => {
                  const result = await Reflect.apply(fn, collection, args);
                  if (armed) {
                    armed = false;
                    throw new Error("Lost ledger acknowledgement");
                  }
                  return result;
                };
              return typeof fn === "function" ? fn.bind(collection) : fn;
            },
          });
      },
    });
    const options = { liquidityTargetEnabled: true, settleInTransaction: true, turn: 200 };
    await expect(deployBondReserveFromCash(faulty, fund, 0, options)).rejects.toThrow(
      "Lost ledger acknowledgement"
    );
    expect((await db.collection("indexFunds").findOne({ _id: fund._id }))!.cashAnchor).toBe(1e6);
    expect(await db.collection("bonds").countDocuments({ publicFloat: 10000 })).toBe(10);
    expect(await db.collection("financialTxLog").countDocuments({})).toBe(0);
    expect(await db.collection("indexFundTransactions").countDocuments({})).toBe(0);
    const result = await deployBondReserveFromCash(db, fund, 0, options);
    expect(result.unitsPurchased).toBeGreaterThan(0);
    expect((await db.collection("indexFunds").findOne({ _id: fund._id }))!.cashAnchor).toBeCloseTo(
      1e6 - result.deployedAnchor,
      6
    );
    expect(await db.collection("indexFundTransactions").countDocuments({})).toBe(10);
    expect(await db.collection("financialTxLog").countDocuments({})).toBe(10);
  });
});
