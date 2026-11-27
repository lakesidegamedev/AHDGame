import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Character, PoliticalParty } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyCharacterPartyJoin } from "./applyCharacterPartyJoin";
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
const characterId = new ObjectId(),
  partyId = new ObjectId();
function fixture() {
  const f = createTransactionalMemoryDb();
  const character = {
    _id: characterId,
    userId: new ObjectId(),
    name: "Synthetic joiner",
    countryId: "US",
    homeState: "CA",
    party: "independent",
    partyInfluence: 10,
  } as Character;
  const party = {
    _id: partyId,
    countryId: "US",
    sequentialId: 3,
    name: "Synthetic party",
    isDefault: true,
    chairId: null,
    memberCount: 0,
  } as PoliticalParty;
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 120, isProcessing: false, worldEpochId: "synthetic" },
  ]);
  f.memory.seed("characters", [{ ...character }]);
  f.memory.seed("politicalParties", [{ ...party }]);
  f.memory.seed("electedOfficials", [
    {
      _id: new ObjectId(),
      characterId,
      countryId: "US",
      party: "independent",
      officeType: "house",
    },
  ]);
  const args = {
    db: f.db,
    character,
    party,
    countryId: "US" as const,
    currentTurn: 120,
    now: new Date(),
    autoChairWhenVacant: false,
    actor: { _id: characterId, name: "Synthetic joiner" },
    actorRole: "self" as const,
    skipGeographyCheck: true,
  };
  return { ...f, args };
}
describe("party join membership and reconciliation", () => {
  it.each(["characters", "electedOfficials", "partyMembershipEvents"])(
    "recovers a landed %s failure",
    async (collection) => {
      const { db, memory, args } = fixture();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      await expect(applyCharacterPartyJoin({ ...args, db: fault.db })).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await db.collection("characters").findOne({}))?.party).toBe("independent");
      expect((await db.collection("electedOfficials").findOne({}))?.party).toBe("independent");
      expect((await db.collection("politicalParties").findOne({}))?.memberCount).toBe(0);
      await applyCharacterPartyJoin(args);
      await applyCharacterPartyJoin(args);
      expect((await db.collection("characters").findOne({}))?.party).toBe("3");
      expect((await db.collection("politicalParties").findOne({}))?.memberCount).toBe(1);
      expect(await db.collection("partyMembershipEvents").countDocuments({})).toBe(1);
    }
  );
  it("overlapping retries join once; stale turns cannot change membership", async () => {
    const { db, args } = fixture();
    await Promise.all([applyCharacterPartyJoin(args), applyCharacterPartyJoin(args)]);
    expect((await db.collection("politicalParties").findOne({}))?.memberCount).toBe(1);
    const next = fixture();
    await expect(applyCharacterPartyJoin({ ...next.args, currentTurn: 119 })).rejects.toThrow(
      "advanced"
    );
    expect((await next.db.collection("characters").findOne({}))?.party).toBe("independent");
  });
  it("a switch withdrawal shares the membership transaction and preserves campaign funds", async () => {
    const { db, memory, args } = fixture();
    args.character.party = "1";
    memory.collection("characters").docs[0].party = "1";
    const oldParty = new ObjectId(),
      election = new ObjectId(),
      candidate = new ObjectId();
    memory.collection("politicalParties").docs.push({
      _id: oldParty,
      countryId: "US",
      sequentialId: 1,
      name: "Old synthetic party",
      memberCount: 1,
      chairId: characterId,
    });
    memory.seed("elections", [
      { _id: election, countryId: "US", state: "CA", electionType: "senate", status: "active" },
    ]);
    memory.seed("electionCandidates", [
      { _id: candidate, electionId: election, characterId, party: "1", status: "active" },
    ]);
    memory.seed("campaigns", [
      {
        _id: new ObjectId(),
        electionId: election,
        candidateId: characterId,
        party: "1",
        funds: 500,
      },
    ]);
    const fault = withInjectedCrash(memory, {
      collection: "electionCandidates",
      op: "updateMany",
      onCall: 1,
      afterWrite: true,
    });
    await expect(applyCharacterPartyJoin({ ...args, db: fault.db })).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect((await db.collection("characters").findOne({}))?.party).toBe("1");
    expect((await db.collection("electionCandidates").findOne({}))?.status).toBe("active");
    expect((await db.collection("campaigns").findOne({}))?.funds).toBe(500);
    await applyCharacterPartyJoin(args);
    expect((await db.collection("electionCandidates").findOne({}))?.status).toBe("withdrawn");
    expect((await db.collection("campaigns").findOne({}))?.funds).toBe(500);
    expect((await db.collection("politicalParties").findOne({ _id: oldParty }))?.memberCount).toBe(
      0
    );
  });
});
