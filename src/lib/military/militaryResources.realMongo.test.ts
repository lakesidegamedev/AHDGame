import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { POST as recruit } from "@/app/api/country/[code]/executive/cabinet/[positionId]/military/recruit/route";
import { DELETE as disband } from "@/app/api/country/[code]/executive/cabinet/[positionId]/military/[unitId]/route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuth: async () => ({ ok: true, user: { isAdmin: true } }),
}));
const unitId = new ObjectId();
describe.skipIf(!REAL_MONGO_ENABLED)("military resources on owned Mongo", () => {
  let mongo: IsolatedMongod | null = null,
    db: Db;
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-military-resources-", {
      replicaSet: "militaryResources",
    });
    await mongo.client.db("admin").command({
      replSetInitiate: {
        _id: "militaryResources",
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
      currentYear: 2019,
      preset: "2019-default",
      isProcessing: false,
    } as never);
    await db
      .collection("cabinetMembers")
      .insertOne({ countryId: "US", positionId: "secretary_of_defense", ministerialActions: 1 });
    await db.collection("federalBudget").insertOne({
      _id: "federal",
      countryId: "US",
      gdp: 387000000000,
      treasuryBalance: 10000000000,
      defenseAppropriation: { balance: 1000000000000, reserved: 0 },
    } as never);
    await db
      .collection("nationalManpower")
      .insertOne({ countryId: "US", mode: "trained", pool: 100000 });
    await db
      .collection("states")
      .insertOne({ _id: "TX", countryId: "US", population: 100000000 } as never);
  });
  async function hire() {
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db);
    return recruit(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: "army", type: "Infantry Division", name: "Test unit" }),
      }),
      { params: Promise.resolve({ code: "US", positionId: "secretary_of_defense" }) }
    );
  }
  async function dismiss(database = db) {
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(database);
    return disband(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({
        code: "US",
        positionId: "secretary_of_defense",
        unitId: unitId.toString(),
      }),
    });
  }
  it("parallel recruitment spends the single office charge once", async () => {
    const results = await Promise.all([hire(), hire()]);
    expect(results.filter((row) => row.ok)).toHaveLength(1);
    expect(await db.collection("militaryUnits").countDocuments()).toBe(1);
    expect((await db.collection("nationalManpower").findOne({ countryId: "US" }))!.pool).toBe(
      88000
    );
    expect(
      (await db.collection("federalBudget").findOne({ countryId: "US" }))!.treasuryBalance
    ).toBe(10000000000);
  });
  it("parallel disbanding returns the deleted unit's establishment once", async () => {
    await db
      .collection("militaryUnits")
      .insertOne({ _id: unitId, countryId: "US", personnel: 12000 });
    const results = await Promise.all([dismiss(), dismiss()]);
    expect(results.filter((row) => row.ok)).toHaveLength(1);
    expect((await db.collection("nationalManpower").findOne({ countryId: "US" }))!.pool).toBe(
      112000
    );
  });
  it("a lost deletion acknowledgement preserves both the unit and its manpower claim", async () => {
    await db
      .collection("militaryUnits")
      .insertOne({ _id: unitId, countryId: "US", personnel: 12000 });
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
              if (name !== "militaryUnits" || method !== "deleteOne") return value.bind(collection);
              return async (...args: unknown[]) => {
                const result = await value.apply(collection, args);
                if (!reached) {
                  reached = true;
                  throw new Error("Lost unit deletion acknowledgement");
                }
                return result;
              };
            },
          });
        };
      },
    });
    expect((await dismiss(fault)).status).toBe(500);
    expect(reached).toBe(true);
    expect(await db.collection("militaryUnits").countDocuments()).toBe(1);
    expect((await db.collection("nationalManpower").findOne({ countryId: "US" }))!.pool).toBe(
      100000
    );
    expect((await dismiss()).status).toBe(200);
    expect((await db.collection("nationalManpower").findOne({ countryId: "US" }))!.pool).toBe(
      112000
    );
  });
});
