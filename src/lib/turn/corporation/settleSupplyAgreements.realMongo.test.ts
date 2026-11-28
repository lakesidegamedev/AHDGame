import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BSON, ObjectId, type Db } from "mongodb";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { settleSupplyAgreements } from "./settleSupplyAgreements";
import { pendingSupplyCashPlans } from "./supplyAgreementPlan";
import { SUPPLY_CASH_PLAN_INDEX } from "@/lib/corporations/supplyExchange/planIndexes";
import { DEFAULT_TX_THRESHOLDS } from "@/lib/db/types/financialTxLog";
import type { CorporationLookups } from "./types";

describe.skipIf(!REAL_MONGO_ENABLED)("supply settlement on an owned replica set", () => {
  let mongo: IsolatedMongod | null = null,
    db: Db;
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-supply-safety-", {
      replicaSet: "supplySafety",
      monitorCommands: true,
    });
    await mongo.client.db("admin").command({
      replSetInitiate: {
        _id: "supplySafety",
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
    if (mongo) await stopIsolatedMongod(mongo);
  });
  beforeEach(async () => {
    await db.dropDatabase();
    await db.collection("gameState").insertOne({ _id: "current", currentTurn: 5 } as never);
    await db
      .collection("bankMoneyMoves")
      .createIndex(SUPPLY_CASH_PLAN_INDEX.keys, SUPPLY_CASH_PLAN_INDEX.options);
    await db.collection("exchangeRates").insertMany([
      { currencyCode: "USD", rate: 1 },
      { currencyCode: "CAD", rate: 2 },
    ]);
  });
  async function fixture(count = 1) {
    const supplier = {
      _id: new ObjectId(),
      name: "Supplier",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 10_000_000_000,
    };
    const buyer = {
      _id: new ObjectId(),
      name: "Buyer",
      countryId: "CA",
      liquidCurrencyCode: "CAD",
      liquidCapital: 20_000_000_000,
    };
    await db.collection("corporations").insertMany([supplier, buyer]);
    const agreements = Array.from({ length: count }, () => ({
      agreementId: new ObjectId().toString(),
      supplierCorpId: supplier._id.toString(),
      buyerCorpId: buyer._id.toString(),
      commodity: "food" as const,
      volumeCap: 1000,
      pricePremium: 0.1,
    }));
    await db
      .collection("supplyAgreements")
      .insertMany(agreements.map((a) => ({ _id: new ObjectId(a.agreementId) })));
    const lookups = {
      eraUnitScale: 1,
      exchangeRatesByCurrency: new Map([
        ["USD", 1],
        ["CAD", 2],
      ]),
      corpById: new Map([
        [supplier._id.toString(), supplier],
        [buyer._id.toString(), buyer],
      ]),
    } as unknown as CorporationLookups;
    return {
      db,
      lookups,
      agreements,
      contractSettlementByCorp: new Map([
        [supplier._id.toString(), new Map([["food" as const, 1000 * count]])],
      ]),
      priceRatioByCommodity: new Map([["food" as const, 1]]),
      turn: 5,
      now: new Date(),
      thresholds: DEFAULT_TX_THRESHOLDS,
    };
  }
  async function anchorCash() {
    const rows = await db.collection("corporations").find({}).toArray();
    return rows.reduce(
      (sum, row) => sum + Number(row.liquidCapital) / (row.liquidCurrencyCode === "CAD" ? 2 : 1),
      0
    );
  }
  it("raced attempts preserve mixed-currency cash and publish one receipt pair", async () => {
    const args = await fixture();
    const initial = await anchorCash();
    await Promise.all([settleSupplyAgreements(args), settleSupplyAgreements(args)]);
    expect(await anchorCash()).toBeCloseTo(initial, 5);
    expect(await db.collection("financialTxLog").countDocuments()).toBe(2);
    expect(await pendingSupplyCashPlans(db)).toHaveLength(0);
  });
  it("replays a failed receipt tail using the original cash and FX", async () => {
    const args = await fixture();
    let reached = false;
    const faultDb = new Proxy(db, {
      get(target, key) {
        if (key !== "collection") {
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (name: string) => {
          const collection = target.collection(name);
          return new Proxy(collection, {
            get(c, method) {
              const value = Reflect.get(c, method);
              if (typeof value !== "function") return value;
              if (name !== "financialTxLog" || method !== "insertMany") return value.bind(c);
              return async (...values: unknown[]) => {
                const result = await value.apply(c, values);
                if (!reached) {
                  reached = true;
                  throw new Error("Lost receipt acknowledgement");
                }
                return result;
              };
            },
          });
        };
      },
    });
    await expect(settleSupplyAgreements({ ...args, db: faultDb })).rejects.toThrow(
      "Lost receipt acknowledgement"
    );
    expect(reached).toBe(true);
    const cash = await anchorCash();
    expect(await db.collection("financialTxLog").countDocuments()).toBe(0);
    expect(await pendingSupplyCashPlans(db)).toHaveLength(1);
    args.lookups.exchangeRatesByCurrency.set("CAD", 20);
    await settleSupplyAgreements(args);
    expect(await anchorCash()).toBe(cash);
    expect(await db.collection("financialTxLog").countDocuments()).toBe(2);
    expect(await pendingSupplyCashPlans(db)).toHaveLength(0);
  });
  it("27,000 agreements use bounded receipt transactions and replay without another cash movement", async () => {
    const args = await fixture(27_000);
    const initial = await anchorCash();
    let commands = 0,
      requestBytes = 0;
    const onCommand = (event: { command: Record<string, unknown> }) => {
      commands++;
      requestBytes += BSON.calculateObjectSize(event.command);
    };
    mongo!.client.on("commandStarted", onCommand);
    const started = performance.now();
    let result;
    try {
      result = await settleSupplyAgreements(args);
    } finally {
      mongo!.client.off("commandStarted", onCommand);
    }
    const durationMs = Math.round(performance.now() - started);
    expect(result.settledCount).toBe(27_000);
    expect(await anchorCash()).toBeCloseTo(initial, 5);
    expect(await db.collection("financialTxLog").countDocuments()).toBe(54_000);
    const cash = await anchorCash();
    args.lookups.exchangeRatesByCurrency.set("CAD", 20);
    await settleSupplyAgreements(args);
    expect(await anchorCash()).toBe(cash);
    expect(await db.collection("financialTxLog").countDocuments()).toBe(54_000);
    expect(await pendingSupplyCashPlans(db)).toHaveLength(0);
    console.info("supply settlement profile", {
      agreements: 27_000,
      commands,
      requestBytes,
      durationMs,
    });
    expect(commands).toBeLessThan(1500);
  }, 120000);
});
