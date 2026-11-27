import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
let ownedDb: Db;
const chair = new ObjectId();
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ownedDb }));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: async () => ({ currentTurn: 0, effectiveNow: new Date(0) }),
}));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuthWithCharacter: async () => ({
    ok: true,
    user: {
      userId: String(new ObjectId()),
      username: "synthetic",
      isAdmin: false,
      character: { _id: chair, name: "Synthetic chair" },
    },
  }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
import { POST } from "./route";
function fixture() {
  const f = createTransactionalMemoryDb();
  ownedDb = f.db;
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  f.memory.seed("states", [{ _id: "TX", countryId: "US", name: "Synthetic region" }]);
  f.memory.seed("politicalParties", [
    {
      _id: new ObjectId(),
      countryId: "US",
      sequentialId: 1,
      chairId: chair,
      name: "Synthetic party",
    },
  ]);
  f.memory.seed("statePartyOrg", [
    {
      _id: "TX_1",
      countryId: "US",
      stateId: "TX",
      partyId: "1",
      primaryAllocation: "PR",
      treasury: 500,
    },
  ]);
  return f;
}
const run = (db: Db) => {
  ownedDb = db;
  return POST(
    new Request("http://localhost/api/synthetic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "WTA" }),
    }),
    { params: Promise.resolve({ code: "US", id: "TX", partyId: "1" }) }
  );
};
describe("primary allocation admission fence", () => {
  it.each(["statePartyOrg", "adminLogs"])(
    "a landed %s failure preserves allocation and its audit",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, {
        collection,
        op: collection === "adminLogs" ? "insertOne" : "updateOne",
        onCall: 1,
        afterWrite: true,
      });
      expect((await run(fault.db)).status).toBe(500);
      expect(fault.crashed).toBe(true);
      expect((await db.collection("statePartyOrg").findOne({}))?.primaryAllocation).toBe("PR");
      expect(await db.collection("adminLogs").countDocuments({})).toBe(0);
      expect((await run(db)).status).toBe(200);
      expect((await db.collection("statePartyOrg").findOne({}))?.treasury).toBe(500);
    }
  );
  it("refuses allocation while a turn owns admission or a primary is already open", async () => {
    const { db } = fixture();
    await db.collection("gameState").updateOne({}, { $set: { isProcessing: true } });
    expect((await run(db)).status).toBe(409);
    await db.collection("gameState").updateOne({}, { $set: { isProcessing: false } });
    await db.collection("elections").insertOne({
      countryId: "US",
      electionType: "president",
      status: "active",
      primaryEndTurn: 101,
    });
    expect((await run(db)).status).toBe(409);
    expect((await db.collection("statePartyOrg").findOne({}))?.primaryAllocation).toBe("PR");
  });
});
