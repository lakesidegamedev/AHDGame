import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BSON, ObjectId, type Db } from "mongodb";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import type { Bond } from "@/lib/db/types";
import { frozenRelocationDecisionPlan } from "@/lib/turn/npp/frozenRelocationDecisionPlan";
import { POST } from "@/app/api/investment-funds/[slug]/subscribe/route";
let mongo: IsolatedMongod | undefined;
let ownedDb: Db;
const characterId = new ObjectId(),
  fundId = new ObjectId(),
  userId = new ObjectId();
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ownedDb }));
vi.mock("@/lib/auth", () => ({
  getAuthUserWithCharacter: async () => ({
    userId: userId.toString(),
    username: "synthetic",
    character: { _id: characterId, name: "Synthetic investor", countryId: "US", cashOnHand: 100 },
  }),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/indexFunds/fundTxLog", () => ({ logIndexFundSubscribeActivity: vi.fn() }));
vi.mock("@/lib/indexFunds/playerCommandAudit", () => ({ resumeFundCommandAudit: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/turn/currentTurn", () => ({ getCurrentTurn: async () => 1 }));
function faultAfterDebit(db: Db): Db {
  let armed = true;
  return new Proxy(db, {
    get(target, key) {
      if (key === "collection")
        return (name: string) => {
          const c = target.collection(name);
          if (name !== "characters") return c;
          return new Proxy(c, {
            get(collection, method) {
              const value = Reflect.get(collection, method, collection);
              if (method === "findOneAndUpdate")
                return async (...args: unknown[]) => {
                  const result = await value.apply(collection, args);
                  if (armed) {
                    armed = false;
                    throw new Error("Interrupted subscription debit");
                  }
                  return result;
                };
              return typeof value === "function" ? value.bind(collection) : value;
            },
          });
        };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
function run(operationId: string) {
  return POST(
    new Request("http://localhost/api/investment-funds/test/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ units: 10, operationId }),
    }),
    { params: Promise.resolve({ slug: "test" }) }
  );
}
describe.skipIf(!REAL_MONGO_ENABLED)("native subscription recovery", () => {
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-subscription-recovery-", {
      replicaSet: "subscriptionRecovery",
      monitorCommands: true,
    });
    await mongo.client.db("admin").command({
      replSetInitiate: {
        _id: "subscriptionRecovery",
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
    await stopIsolatedMongod(mongo ?? null);
  }, 30000);
  it("an interrupted debit rolls back its claim and concurrent retries complete one subscription", async () => {
    const db = mongo!.db;
    await db
      .collection("gameState")
      .insertOne({ _id: "current" as never, currentTurn: 1, isProcessing: false });
    await db.collection("characters").insertOne({ _id: characterId, cashOnHand: 100 });
    await db.collection("indexFunds").insertOne({
      _id: fundId,
      slug: "test",
      name: "Synthetic fund",
      status: "active",
      quotedNav: 1,
      anchorCurrencyCode: "USD",
      unitSupply: 0,
      cashAnchor: 0,
    });
    const operation = crypto.randomUUID();
    ownedDb = faultAfterDebit(db);
    expect((await run(operation)).status).toBe(409);
    expect((await db.collection("characters").findOne({ _id: characterId }))?.cashOnHand).toBe(100);
    expect(await db.collection("indexFundCommands").countDocuments({})).toBe(0);
    ownedDb = db;
    const replies = await Promise.all([run(operation), run(operation)]);
    expect(replies.every((r) => r.ok)).toBe(true);
    expect((await run(operation)).status).toBe(200);
    expect((await db.collection("characters").findOne({ _id: characterId }))?.cashOnHand).toBe(90);
    expect(await db.collection("indexFunds").findOne({ _id: fundId })).toMatchObject({
      cashAnchor: 10,
      unitSupply: 10,
    });
    expect(
      (await db.collection("indexFundPositions").findOne({ fundId, characterId }))?.units
    ).toBe(10);
    expect(await db.collection("indexFundTransactions").countDocuments({})).toBe(1);
    await db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { isProcessing: true } });
    expect((await run(crypto.randomUUID())).status).toBe(409);
    expect((await db.collection("characters").findOne({ _id: characterId }))?.cashOnHand).toBe(90);
  });
  it("keeps a frozen relocation cash and property plan after an interrupted debt batch", async () => {
    const db = mongo!.db,
      owner = new ObjectId();
    await db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { currentTurn: 2 } });
    const bonds = Array.from(
      { length: 51 },
      () =>
        ({
          _id: new ObjectId(),
          corporationId: owner,
          issuedAtTurn: 2,
          totalIssued: 1000,
          currencyCode: "CAD",
        }) as Bond
    );
    const output = {
      cashDeltaLocal: -200,
      inventory: { steel: 12 },
      buildQueue: [{ units: 2, cost: 1200 }],
      location: "ON",
    };
    const measure = async (run: () => Promise<unknown>) => {
      let commands = 0,
        requestBytes = 0,
        responseBytes = 0;
      const started = (e: { command: object }) => {
        commands++;
        requestBytes += BSON.serialize(e.command).byteLength;
      };
      const succeeded = (e: { reply: object }) => {
        responseBytes += BSON.serialize(e.reply).byteLength;
      };
      mongo!.client.on("commandStarted", started).on("commandSucceeded", succeeded);
      try {
        await run();
      } finally {
        mongo!.client.off("commandStarted", started).off("commandSucceeded", succeeded);
      }
      return { commands, requestBytes, responseBytes };
    };
    const baseline = await measure(() => db.collection("bonds").insertMany(bonds));
    await db.collection("bonds").deleteMany({ corporationId: owner });
    let batches = 0;
    const interrupted = new Proxy(db, {
      get(target, key) {
        if (key === "collection")
          return (name: string) => {
            const c = target.collection(name);
            if (name !== "bonds") return c;
            return new Proxy(c, {
              get(collection, method) {
                const value = Reflect.get(collection, method, collection);
                if (method === "insertMany")
                  return async (...args: unknown[]) => {
                    const result = await value.apply(collection, args);
                    if (++batches === 2) throw new Error("Interrupted debt batch");
                    return result;
                  };
                return typeof value === "function" ? value.bind(collection) : value;
              },
            });
          };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const first = await measure(async () => {
      await expect(
        frozenRelocationDecisionPlan(interrupted, 2, async () => ({ output, bonds }))
      ).rejects.toThrow("Interrupted debt batch");
    });
    expect(await db.collection("bonds").countDocuments({ corporationId: owner })).toBe(50);
    const forbidden = async (): Promise<{ output: typeof output; bonds: Bond[] }> => {
      throw new Error("must not replan");
    };
    const recovery = await measure(async () => {
      expect(await frozenRelocationDecisionPlan(db, 2, forbidden)).toEqual(output);
    });
    const replay = await measure(async () => {
      expect(await frozenRelocationDecisionPlan(db, 2, forbidden)).toEqual(output);
    });
    expect(await db.collection("bonds").countDocuments({ corporationId: owner })).toBe(51);
    expect(baseline.commands).toBeGreaterThan(0);
    process.stdout.write(
      JSON.stringify({
        profile: "relocation-frozen-plan",
        baseline,
        interruptedFirst: first,
        recovery,
        replay,
      }) + "\n"
    );
  });
});
