import { beforeAll, afterAll, it, expect, describe, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { processBondTurn } from "./bondTurn";
let mongo: IsolatedMongod | null = null;
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => {
    if (!mongo) throw new Error("Private fixture unavailable");
    return mongo.db;
  },
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/notifications", () => ({
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/bonds/marketPoolTurn", () => ({
  processBondMarketPoolTurn: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/sovereignDefault/imfSovereignFacilityTurn", () => ({
  processSovereignImfFacilityPayments: vi.fn().mockResolvedValue({ paymentsApplied: 0 }),
}));
vi.mock("@/lib/sovereignDefault/recovery/recoveryTurn", () => ({
  processSovereignRecoveryTurn: vi
    .fn()
    .mockResolvedValue({ countriesEvaluated: 0, countriesExited: [] }),
}));
vi.mock("@/lib/sovereignDefault/legislative/legislativeTurn", () => ({
  processSovereignLegislativeTurn: vi
    .fn()
    .mockResolvedValue({ decisionsEvaluated: 0, ratified: [], rejected: [], advanced: [] }),
}));
vi.mock("@/lib/sovereignDefault/crisisAutoAction", () => ({
  processCrisisAutoActions: vi.fn().mockResolvedValue(undefined),
}));
function crashAfterRetirement(db: Db, kind: "maturity" | "coupon"): Db {
  let armed = true;
  return new Proxy(db, {
    get(target, key) {
      if (key === "collection")
        return (name: string) => {
          const collection = target.collection(name);
          if (name !== (kind === "maturity" ? "bonds" : "indexFunds")) return collection;
          return new Proxy(collection, {
            get(c, operation) {
              const method = Reflect.get(c, operation, c);
              if (operation === "bulkWrite")
                return async (...args: unknown[]) => {
                  const result = await method.apply(c, args);
                  if (
                    armed &&
                    (kind === "coupon" || JSON.stringify(args).includes('"matured":true'))
                  ) {
                    armed = false;
                    throw new Error("Interrupted after retirement");
                  }
                  return result;
                };
              return typeof method === "function" ? method.bind(c) : method;
            },
          });
        };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
describe.skipIf(!REAL_MONGO_ENABLED)("native bond host recovery", () => {
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-bond-host-recovery-", {
      replicaSet: "bondHostRecovery",
    });
    await mongo.client.db("admin").command({
      replSetInitiate: {
        _id: "bondHostRecovery",
        members: [{ _id: 0, host: new URL(mongo.uri).host }],
      },
    });
    const deadline = Date.now() + 30000;
    while (
      Date.now() < deadline &&
      !(await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary).toBe(true);
  }, 60000);
  afterAll(async () => {
    await stopIsolatedMongod(mongo);
  }, 30000);
  it.each(["maturity", "coupon"] as const)(
    "%s replays interrupted mixed-currency claims and conserves every payee's cash",
    async (kind) => {
      await mongo!.db.dropDatabase();
      const db = mongo!.db,
        issuer = new ObjectId(),
        holder = new ObjectId(),
        fund = new ObjectId(),
        npp = new ObjectId(),
        bond = new ObjectId();
      await db.collection("gameState").insertOne({
        _id: "current" as never,
        currentTurn: 10,
        startingYear: 2027,
        currentYear: 2027,
        preset: "2027-default",
        resetWorldId: "private-bond-world",
        corporationActionsPaused: true,
      });
      await db
        .collection("gameConfig")
        .insertOne({ _id: "global" as never, ledgerShadowEnabled: false });
      await db.collection("exchangeRates").insertMany([
        { currencyCode: "USD", rate: 1 },
        { currencyCode: "CAD", rate: 2 },
      ]);
      await db.collection("corporations").insertMany([
        {
          _id: issuer,
          name: "Synthetic issuer",
          countryId: "CA",
          countryOwnerId: "CA",
          liquidCurrencyCode: "CAD",
          liquidCapital: 100000,
          totalShares: 100,
          shareholders: [],
        },
        {
          _id: holder,
          name: "Synthetic holder",
          countryId: "CA",
          liquidCurrencyCode: "CAD",
          liquidCapital: 0,
          shareholders: [],
        },
      ]);
      await db
        .collection("indexFunds")
        .insertOne({ _id: fund, cashAnchor: 0, anchorCurrencyCode: "USD" });
      await db
        .collection("npps")
        .insertOne({ _id: npp, countryId: "US", nppInvestmentCashAnchor: 0 });
      await db.collection("bondMarketPools").insertOne({ _id: "USD" as never, cashLocal: 0 });
      await db.collection("bonds").insertOne({
        _id: bond,
        corporationId: issuer,
        issuerType: "corporation",
        countryId: "CA",
        currencyCode: "USD",
        couponRate: kind === "coupon" ? 4.8 : 0,
        marketPrice: 1,
        maturityTurn: kind === "coupon" ? 20 : 10,
        issuedAtTurn: 0,
        matured: false,
        defaulted: false,
        totalIssued: 5,
        publicFloat: 1,
        holders: [
          { corporationId: holder, units: 1 },
          { fundId: fund, units: 2 },
          { nppId: npp, units: 1 },
        ],
      });
      const original = mongo!.db;
      mongo!.db = crashAfterRetirement(original, kind);
      try {
        await expect(processBondTurn(10)).rejects.toThrow("Interrupted after retirement");
      } finally {
        mongo!.db = original;
      }
      if (kind === "maturity")
        expect((await db.collection("bonds").findOne({ _id: bond }))?.holders).toEqual([]);
      await Promise.all([processBondTurn(10), processBondTurn(10)]);
      await processBondTurn(10);
      expect(
        await db.collection("bankMoneyMoves").countDocuments({ kind: "frozen-bond-turn-input" })
      ).toBe(0);
      expect((await db.collection("corporations").findOne({ _id: issuer }))?.liquidCapital).toBe(
        kind === "maturity" ? 90000 : 99990
      );
      expect((await db.collection("corporations").findOne({ _id: holder }))?.liquidCapital).toBe(
        kind === "maturity" ? 2000 : 2
      );
      expect((await db.collection("indexFunds").findOne({ _id: fund }))?.cashAnchor).toBe(
        kind === "maturity" ? 2000 : 2
      );
      expect((await db.collection("npps").findOne({ _id: npp }))?.nppInvestmentCashAnchor).toBe(
        kind === "maturity" ? 1000 : 1
      );
      expect(
        (await db.collection("bondMarketPools").findOne({ _id: "USD" } as never))?.cashLocal
      ).toBe(kind === "maturity" ? 1000 : 1);
      if (kind === "coupon") {
        const history = await db
          .collection("bondHistory")
          .find({ bondId: bond, turn: 10 })
          .toArray();
        expect(history).toHaveLength(1);
        expect(history[0].totalInterestPaid).toBe(5);
        expect(history[0].interestPaidSource).toBe("settlement");
      }
    },
    60000
  );
});
