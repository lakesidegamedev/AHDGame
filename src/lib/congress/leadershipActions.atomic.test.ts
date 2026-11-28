import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import {
  handleBundestagspraesidentAction,
  type ActionContext as DeContext,
} from "./bundestagspraesident/actions";
import { handleCppccChairAction, type ActionContext as CppccContext } from "./cppccChair/actions";
import { handleNpcscChairAction, type ActionContext as NpcscContext } from "./npcscChair/actions";
vi.mock("@/lib/congress/leadershipElections", () => ({ isLeadershipElectionClosed: () => false }));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: async () => ({ currentTurn: 100, effectiveNow: new Date(0) }),
}));
const cases = [
  {
    collection: "bundestagspraesidentNominations",
    elections: "bundestagspraesidentElections",
    countryId: "DE",
    officeType: "bundestag",
    run: (ctx: unknown) => handleBundestagspraesidentAction(ctx as DeContext),
  },
  {
    collection: "cppccChairNominations",
    elections: "cppccChairElections",
    countryId: "CN",
    officeType: "npcDelegate",
    run: (ctx: unknown) => handleCppccChairAction(ctx as CppccContext),
  },
  {
    collection: "npcscChairNominations",
    elections: "npcscChairElections",
    countryId: "CN",
    officeType: "npcDelegate",
    run: (ctx: unknown) => handleNpcscChairAction(ctx as NpcscContext),
  },
];
function fixture(c: (typeof cases)[number]) {
  const f = createTransactionalMemoryDb(),
    characterId = new ObjectId(),
    userId = new ObjectId(),
    a = new ObjectId(),
    b = new ObjectId();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 100, isProcessing: false, worldEpochId: "synthetic-vote" },
  ]);
  f.memory.seed("characters", [
    { _id: characterId, userId, name: "Synthetic voter", countryId: c.countryId, party: "1" },
  ]);
  f.memory.seed("electedOfficials", [
    {
      _id: new ObjectId(),
      characterId,
      countryId: c.countryId,
      officeType: c.officeType,
      party: "1",
      state: "synthetic-region",
      seatsHeld: 1,
    },
  ]);
  f.memory.seed(c.elections, [{ _id: "current", status: "voting", endsAt: new Date(86400000) }]);
  f.memory.seed(c.collection, [
    { _id: a, status: "voting", votes: { [String(characterId)]: "for" }, votesFor: 1 },
    { _id: b, status: "open", votes: {}, votesFor: 0 },
  ]);
  const composition = {
    composition: [{ party: "1", partyName: "Synthetic party", seats: 10 }],
    majorityParty: "1",
    majorityBloc: null,
  };
  const ctx = {
    db: f.db,
    action: "vote",
    nominationId: String(b),
    authUser: { userId: String(userId) },
    partyMap: new Map(),
    npc: composition,
    bundestag: composition,
  };
  return { ...f, a, b, characterId, ctx };
}
describe.each(cases)("$collection ballot move", (c) => {
  it("rolls back a landed move and retains one vote on retry", async () => {
    const f = fixture(c);
    const fault = withInjectedCrash(f.memory, {
      collection: c.collection,
      op: "bulkWrite",
      onCall: 2,
      afterWrite: true,
    });
    await expect(c.run({ ...f.ctx, db: fault.db })).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect((await f.db.collection(c.collection).findOne({ _id: f.a }))!.votesFor).toBe(1);
    expect((await f.db.collection(c.collection).findOne({ _id: f.b }))!.votesFor).toBe(0);
    expect((await c.run(f.ctx)).success).toBe(true);
    expect((await c.run(f.ctx)).success).toBe(false);
    const rows = await f.db.collection(c.collection).find({}).toArray();
    expect(rows.filter((row) => row.votes[String(f.characterId)])).toHaveLength(1);
    expect(rows.reduce((sum, row) => sum + row.votesFor, 0)).toBe(1);
  });
  it("refuses a vote while the turn is processing", async () => {
    const f = fixture(c);
    await f.db
      .collection<{ _id: string }>("gameState")
      .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
    expect((await c.run(f.ctx)).status).toBe(409);
    expect((await f.db.collection(c.collection).findOne({ _id: f.a }))!.votesFor).toBe(1);
  });
});
