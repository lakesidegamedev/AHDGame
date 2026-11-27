import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { requireAuth, requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { emitTreasuryTransaction } from "./emit";
import { POST as caucusSend } from "@/lib/api/commands/country/[code]/parties/[id]/caucuses/[slug]/send/handlers";
import { POST as regionalSend } from "@/lib/api/commands/country/[code]/region/[id]/party/[partyId]/send/handlers";
import { POST as caucusTransfer } from "@/app/api/country/[code]/parties/[id]/caucuses/[slug]/transfer/route";
import { POST as regionalTransfer } from "@/app/api/country/[code]/region/[id]/party/[partyId]/transfer/route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuth: vi.fn(),
  requireAuthWithCharacter: vi.fn(),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/api/requirePlayerTransfers", () => ({
  requirePlayerTransfersEnabled: async () => null,
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/parties/bannedOfficers", () => ({
  vacateBannedOfficerSeats: async () => undefined,
}));
vi.mock("@/lib/treasury/emit", () => ({
  emitTreasuryTransaction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue("applied") }));
vi.mock("@/lib/db/collections", () => ({
  getPartyBudgetCollection: async () => ({}),
  getGameStateCollection: async (db: Db) => db.collection("gameState"),
}));
vi.mock("@/lib/partyBudgetGuards", () => ({ findPartyBudgetForScope: async () => null }));
vi.mock("@/lib/partyTreasuryPlan", () => ({ wouldTriggerTreasuryReserveOverride: () => false }));
vi.mock("@/lib/db/partyLookup", () => ({
  findPartyBySequentialId: async (db: Db) => db.collection("politicalParties").findOne({}),
  getPartyIdString: () => "1",
  getStatePartyOrgDocumentId: () => "TX_1",
}));
vi.mock("@/lib/db/caucusLookup", () => ({
  findCaucusBySlug: async (db: Db) => ({ caucus: await db.collection("caucuses").findOne({}) }),
  listCaucusMemberships: async (db: Db) => db.collection("caucusMemberships").find({}).toArray(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(emitTreasuryTransaction)
    .mockReset()
    .mockResolvedValue(undefined as never);
});
const cases = [
  { name: "caucus send", scope: "caucus", send: true },
  { name: "regional send", scope: "regional", send: true },
  { name: "caucus transfer", scope: "caucus", send: false },
  { name: "regional transfer", scope: "regional", send: false },
] as const;
function setup(c: (typeof cases)[number]) {
  const f = createTransactionalMemoryDb(),
    party = new ObjectId(),
    caucus = new ObjectId(),
    recipient = new ObjectId(),
    officer = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  f.memory.seed("politicalParties", [
    {
      _id: party,
      sequentialId: 1,
      countryId: "US",
      name: "Synthetic party",
      treasury: 0,
      chairId: officer,
    },
  ]);
  f.memory.seed("states", [{ _id: "TX", countryId: "US", name: "Texas" }]);
  f.memory.seed("statePartyOrg", [{ _id: "TX_1", treasury: 5000, chairId: officer }]);
  f.memory.seed("caucuses", [
    { _id: caucus, name: "Synthetic caucus", chairId: officer, treasury: 5000 },
  ]);
  f.memory.seed("caucusMemberships", [{ _id: new ObjectId(), memberId: recipient }]);
  f.memory.seed("characters", [
    {
      _id: recipient,
      name: "Synthetic member",
      countryId: "US",
      homeState: "TX",
      party: "1",
      funds: 0,
    },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  const auth = {
    ok: true,
    user: {
      userId: new ObjectId().toString(),
      username: "synthetic",
      isAdmin: true,
      character: { _id: officer, name: "Synthetic officer", countryId: "US" },
    },
  } as never;
  vi.mocked(requireAuth).mockResolvedValue(auth);
  vi.mocked(requireAuthWithCharacter).mockResolvedValue(auth);
  const run = () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount: 5000,
        ...(c.send ? { characterId: recipient.toString() } : {}),
      }),
    });
    if (c.scope === "caucus")
      return (c.send ? caucusSend : caucusTransfer)(request, {
        params: Promise.resolve({ code: "us", id: "1", slug: "synthetic" }),
      });
    return (c.send ? regionalSend : regionalTransfer)(request, {
      params: Promise.resolve({ code: "us", id: "TX", partyId: "1" }),
    });
  };
  const source = c.scope === "caucus" ? "caucuses" : "statePartyOrg",
    dest = c.send ? "characters" : "politicalParties",
    field = c.send ? "funds" : "treasury";
  return { ...f, run, source, dest, field };
}
it.each(cases)(
  "$name rolls back a lost destination acknowledgement and settles once on retry",
  async (c) => {
    const f = setup(c),
      dest = f.memory.collection(f.dest),
      write = dest.updateOne.bind(dest);
    vi.spyOn(dest, "updateOne").mockImplementationOnce(async (...args) => {
      await write(...args);
      throw new Error("destination acknowledgement lost");
    });
    expect((await f.run()).status).toBe(500);
    expect(f.memory.collection(f.source).docs[0].treasury).toBe(5000);
    expect(dest.docs[0][f.field]).toBe(0);
    const results = await Promise.all([f.run(), f.run()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(f.memory.collection(f.source).docs[0].treasury).toBe(0);
    expect(dest.docs[0][f.field]).toBe(5000);
  }
);
it.each(cases)(
  "$name rolls back a failed receipt without blocking a later valid retry",
  async (c) => {
    const f = setup(c);
    vi.mocked(emitTreasuryTransaction).mockRejectedValueOnce(new Error("receipt unavailable"));
    expect((await f.run()).status).toBe(500);
    expect(f.memory.collection(f.source).docs[0].treasury).toBe(5000);
    expect(f.memory.collection(f.dest).docs[0][f.field]).toBe(0);
    expect((await f.run()).status).toBe(200);
    expect(f.memory.collection(f.dest).docs[0][f.field]).toBe(5000);
  }
);
it.each(cases)("$name refuses while a turn owns processing", async (c) => {
  const f = setup(c);
  await f.memory
    .collection("gameState")
    .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
  expect((await f.run()).status).toBe(409);
  expect(f.memory.collection(f.source).docs[0].treasury).toBe(5000);
  expect(f.memory.collection(f.dest).docs[0][f.field]).toBe(0);
});
