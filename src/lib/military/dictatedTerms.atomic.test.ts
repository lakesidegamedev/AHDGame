import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
let ownedDb: Db;
const actor = new ObjectId();
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ownedDb }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuthWithCharacter: async () => ({
    ok: true,
    user: {
      userId: String(actor),
      username: "Synthetic",
      isAdmin: true,
      character: { _id: actor, countryId: "US" },
    },
  }),
}));
vi.mock("@/lib/analytics/serverPosthog", () => ({
  captureServerGameEvent: vi.fn(async () => {}),
  flushServerPosthog: vi.fn(async () => {}),
}));
import { POST } from "@/app/api/country/[code]/executive/conflicts/[conflictId]/terms/route";
function fixture() {
  const f = createTransactionalMemoryDb();
  ownedDb = f.db;
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      preset: "2027-default",
      worldEpochId: "synthetic-terms",
      isProcessing: false,
    },
  ]);
  f.memory.seed("gameConfig", [
    { _id: "default", treasuryCashLedgerEnabled: true, ledgerShadow: false },
  ]);
  f.memory.seed("exchangeRates", [
    { _id: "US", currencyCode: "USD", rate: 1 },
    { _id: "CA", currencyCode: "CAD", rate: 1.4 },
  ]);
  f.memory.seed("countryState", [
    { _id: "CA", countryId: "CA", governmentType: "parliamentaryMonarchy", rulingPartyId: null },
  ]);
  f.memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      currencyCode: "USD",
      gdp: 1000000000000,
      treasuryBalance: 10000,
      treasuryCashLocal: 10000,
    },
    {
      _id: "CA",
      countryId: "CA",
      currencyCode: "CAD",
      gdp: 1000000000000,
      treasuryBalance: 20000,
      treasuryCashLocal: 20000,
    },
  ]);
  f.memory.seed("conflicts", [
    {
      _id: "synthetic-terms",
      name: "Synthetic War",
      type: "interstate",
      status: "terms_pending",
      hostCountry: "CA",
      termsWindow: { closesTurn: 110, imposer: "US", target: "CA", victor: "A" },
      sideA: { label: "A", countries: ["US"] },
      sideB: { label: "B", countries: ["CA"] },
    },
  ]);
  return f;
}
async function impose(db: Db) {
  ownedDb = db;
  return POST(
    new Request("http://localhost/api/terms", {
      method: "POST",
      body: JSON.stringify({ term: { kind: "indemnity", payer: "CA", amount: 1400 } }),
    }),
    { params: Promise.resolve({ code: "us", conflictId: "synthetic-terms" }) }
  );
}
describe("dictated peace claims money and outcome together", () => {
  it.each([
    { collection: "conflicts", op: "updateOne" as const },
    { collection: "federalBudget", op: "updateOne" as const },
    { collection: "truces", op: "updateOne" as const },
  ])("recovers landed $collection.$op", async (point) => {
    const { db, memory } = fixture(),
      before = await db.collection("federalBudget").find({}).toArray();
    const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
    const failed = await impose(fault.db);
    expect(fault.crashed).toBe(true);
    expect(failed.status).toBe(500);
    expect((await db.collection("conflicts").findOne({}))!.status).toBe("terms_pending");
    expect(await db.collection("federalBudget").find({}).toArray()).toEqual(before);
    const result = await impose(db);
    expect(result.status, await result.clone().text()).toBe(200);
    expect(
      (await db.collection("federalBudget").findOne({ countryId: "CA" }))!.treasuryCashLocal
    ).toBe(18600);
    expect(
      (await db.collection("federalBudget").findOne({ countryId: "US" }))!.treasuryCashLocal
    ).toBe(11000);
    const settled = await db.collection("federalBudget").find({}).toArray();
    expect((await impose(db)).status).toBe(409);
    expect(await db.collection("federalBudget").find({}).toArray()).toEqual(settled);
  });
  it("refuses terms while a turn owns the economic fence", async () => {
    const { db } = fixture();
    await db.collection("gameState").updateOne({}, { $set: { isProcessing: true } });
    expect((await impose(db)).status).toBe(409);
    expect((await db.collection("conflicts").findOne({}))!.status).toBe("terms_pending");
  });
});
