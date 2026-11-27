import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
let ownedDb: Db;
const actor = new ObjectId(),
  userId = new ObjectId();
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ownedDb }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuthWithCharacter: async () => ({
    ok: true,
    user: {
      userId: String(userId),
      username: "Synthetic",
      isAdmin: true,
      character: { _id: actor, name: "Synthetic chair", countryId: "US", party: "1" },
    },
  }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
import { POST } from "@/lib/api/commands/country/[code]/region/[id]/party/[partyId]/build-org/handlers";
import { nppBuildPartyOrg } from "@/lib/nppAutonomy/v3/party/nppBuildOrg";
function fixture() {
  const f = createTransactionalMemoryDb();
  ownedDb = f.db;
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      worldEpochId: "synthetic-org",
      preset: "2027-default",
      isProcessing: false,
    },
  ]);
  f.memory.seed("states", [
    { _id: "CA", countryId: "US", population: 1000000, name: "California" },
  ]);
  f.memory.seed("politicalParties", [
    {
      _id: new ObjectId(),
      countryId: "US",
      sequentialId: 1,
      name: "Party",
      treasury: 20000000,
      politicalStrength: 20,
      chairId: actor,
    },
  ]);
  f.memory.seed("statePartyOrg", [
    {
      _id: "CA_1",
      countryId: "US",
      stateId: "CA",
      partyId: "1",
      chairId: actor,
      organization: 20,
      organizationUnits: 20,
      politicalStrength: 20,
      treasury: 20000000,
      hasPresence: true,
    },
  ]);
  f.memory.seed("characters", [
    { _id: actor, userId, countryId: "US", homeState: "CA", party: "1" },
  ]);
  return f;
}
async function player(db: Db) {
  ownedDb = db;
  const response = await POST(
    new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ psPool: "state" }),
    }),
    { params: Promise.resolve({ code: "us", id: "CA", partyId: "1" }) }
  );
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
const methods = [
  { name: "player", run: player },
  { name: "NPP", run: (db: Db) => nppBuildPartyOrg(db, actor, "US", "CA", 1, 100) },
];
describe("organization resource and outcome atomicity", () => {
  for (const method of methods)
    it.each([
      { collection: "partyPoliticalStrengthLedger", op: "insertOne" as const },
      { collection: "treasuryTransactions", op: "insertOne" as const },
      { collection: "orgRegLedger", op: "insertMany" as const },
    ])(`${method.name} recovers a landed $collection receipt`, async (point) => {
      const { db, memory } = fixture(),
        before = await db.collection("statePartyOrg").findOne({});
      const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
      await expect(method.run(fault.db)).rejects.toThrow(/crash/i);
      expect(fault.crashed).toBe(true);
      expect(await db.collection("statePartyOrg").findOne({})).toEqual(before);
      expect(await db.collection("partyPoliticalStrengthLedger").countDocuments({})).toBe(0);
      expect(await db.collection("treasuryTransactions").countDocuments({})).toBe(0);
      const result = await method.run(db);
      expect(result.ok).toBe(true);
      const built = await db.collection("statePartyOrg").findOne({});
      expect(built!.politicalStrength).toBeLessThan(before!.politicalStrength);
      expect(built!.treasury).toBeLessThan(before!.treasury);
      expect(built!.organizationUnits).toBeGreaterThan(before!.organizationUnits);
      expect(await db.collection("partyPoliticalStrengthLedger").countDocuments({})).toBe(1);
      expect(await db.collection("treasuryTransactions").countDocuments({})).toBe(1);
    });
  it("refuses a player click after turn admission with no charge", async () => {
    const { db } = fixture();
    await db.collection("gameState").updateOne({}, { $set: { isProcessing: true } });
    await expect(player(db)).rejects.toThrow("processing");
    expect((await db.collection("statePartyOrg").findOne({}))!.politicalStrength).toBe(20);
  });
  it("overlapping autonomous clicks cannot spend the same last PS", async () => {
    const { db } = fixture();
    await db.collection("statePartyOrg").updateOne({}, { $set: { politicalStrength: 1 } });
    const replies = await Promise.all([
      nppBuildPartyOrg(db, actor, "US", "CA", 1, 100),
      nppBuildPartyOrg(db, actor, "US", "CA", 1, 100),
    ]);
    expect(replies.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.collection("partyPoliticalStrengthLedger").countDocuments({})).toBe(1);
  });
});
