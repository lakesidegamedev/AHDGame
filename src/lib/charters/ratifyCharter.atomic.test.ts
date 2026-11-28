import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { ratifyCharter } from "./ratifyCharter";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/elections/party/nationalPartyElections", () => ({
  createMissingNationalElections: async (
    _turn: number,
    _duration: unknown,
    _now: unknown,
    _country: unknown,
    db: Db
  ) => {
    await db
      .collection("nationalPartyElections")
      .insertOne({ _id: new ObjectId(), status: "voting" });
    return 1;
  },
}));
function world() {
  const f = createTransactionalMemoryDb(),
    id = new ObjectId(),
    founders = [new ObjectId(), new ObjectId(), new ObjectId()];
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 5, preset: "2027-default" }]);
  f.memory.seed("states", [{ _id: "ON", countryId: "CA" }]);
  f.memory.seed(
    "characters",
    founders.map((_id) => ({
      _id,
      countryId: "CA",
      homeState: "ON",
      party: "independent",
      name: "Founder",
    }))
  );
  f.memory.seed("partyCharters", [
    {
      _id: id,
      countryId: "CA",
      status: "pending-signatures",
      partyId: null,
      proposedName: "Recovery Party",
      proposedAbbr: "REC",
      foundersCharacterIds: founders,
      pendingFounderSlots: 0,
      platform: { economic: 0, social: 0, foreignPolicy: 0, culture: 0 },
      signatures: founders.map((characterId) => ({ characterId, signedAt: new Date(1) })),
    },
  ]);
  return { ...f, id };
}
describe("charter ratification delivery", () => {
  it.each([
    ["statePartyOrg", "insertMany"],
    ["characters", "updateOne"],
    ["nationalPartyElections", "insertOne"],
    ["npps", "insertMany"],
  ] as const)(
    "rolls back landed %s provisioning and converges across retries",
    async (collection, op) => {
      const f = world(),
        fault = withInjectedCrash(f.memory, { collection, op, onCall: 1, afterWrite: true });
      await expect(ratifyCharter(f.id, fault.db)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(f.memory.collection("partyCharters").docs[0].status).toBe("pending-signatures");
      expect(f.memory.collection("politicalParties").docs).toHaveLength(0);
      expect(f.memory.collection("statePartyOrg").docs).toHaveLength(0);
      expect(f.memory.collection("npps").docs).toHaveLength(0);
      expect(
        f.memory.collection("characters").docs.every((row) => row.party === "independent")
      ).toBe(true);
      const results = await Promise.all([ratifyCharter(f.id, f.db), ratifyCharter(f.id, f.db)]);
      expect(results[0].partyId).toBe(results[1].partyId);
      expect(f.memory.collection("politicalParties").docs).toHaveLength(1);
      expect(f.memory.collection("npps").docs).toHaveLength(3);
      expect(
        f.memory.collection("characters").docs.every((row) => row.party === results[0].partyId)
      ).toBe(true);
      expect(f.memory.collection("nationalPartyElections").docs).toHaveLength(1);
    }
  );
});
