import { it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { POST } from "@/app/api/country/[code]/international-organizations/[orgId]/propose-join/route";
const h = vi.hoisted(() => ({
  db: null as import("mongodb").Db | null,
  actor: null as import("mongodb").ObjectId | null,
}));
h.actor = new ObjectId();
vi.mock("@/lib/mongodb", () => ({ getDb: async () => h.db }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuthWithCharacter: async () => ({
    ok: true,
    user: { character: { _id: h.actor, name: "Synthetic minister", party: "1" } },
  }),
}));
vi.mock("@/lib/api/requireForeignMinister", () => ({
  requireForeignMinister: async () => ({
    ok: true,
    auth: { characterId: h.actor, characterName: "Synthetic minister" },
  }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/internationalOrganizations/service", () => ({
  hasOpenMembershipProposal: async () => false,
  isMember: async () => false,
  loadOrganizationDef: async () => ({ id: "review", name: "Review" }),
  recordOrgHistoryEvent: async () => {},
}));
vi.mock("@/lib/internationalOrganizations/founding", () => ({
  isOrganizationFoundedLive: async () => true,
}));
vi.mock("@/lib/internationalOrganizations/orgMembership", () => ({
  votingMembers: async () => [],
}));
vi.mock("@/lib/internationalOrganizations/commands/buildMembershipBill", () => ({
  buildMembershipBill: async () => new ObjectId(),
}));
it("does not publish a join proposal when its diplomatic action is no longer available", async () => {
  const f = createTransactionalMemoryDb();
  h.db = f.db;
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 24, currentYear: 2020 }]);
  f.memory.seed("diplomaticActions", [
    { _id: new ObjectId(), countryId: "US", turn: 24, remaining: 1 },
  ]);
  const proposals = f.db.collection("organizationMembershipProposals"),
    insert = proposals.insertOne.bind(proposals);
  let raced = false;
  proposals.insertOne = async (...args: Parameters<typeof insert>) => {
    raced = true;
    await f.db
      .collection("diplomaticActions")
      .updateOne({ countryId: "US" }, { $set: { remaining: 0 } });
    return insert(...(args as Parameters<typeof insert>));
  };
  const response = await POST(new Request("https://review.invalid", { method: "POST" }), {
    params: Promise.resolve({ code: "US", orgId: "review" }),
  });
  expect(raced).toBe(true);
  expect(response.status).toBe(409);
  expect(await proposals.countDocuments({ status: "pending" })).toBe(0);
});

it("rolls back proposal and charge when bill publication fails, then replays one complete result", async () => {
  const f = createTransactionalMemoryDb();
  h.db = f.db;
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 24, currentYear: 2020 }]);
  f.memory.seed("diplomaticActions", [
    { _id: new ObjectId(), countryId: "US", turn: 24, remaining: 1 },
  ]);
  const build = await import("@/lib/internationalOrganizations/commands/buildMembershipBill");
  const builder = vi
    .spyOn(build, "buildMembershipBill")
    .mockRejectedValueOnce(new Error("bill publication failed"));
  const run = () =>
    POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Idempotency-Key": "synthetic-join" },
      }),
      { params: Promise.resolve({ code: "US", orgId: "review" }) }
    );
  expect((await run()).status).toBe(500);
  expect(await f.db.collection("organizationMembershipProposals").countDocuments({})).toBe(0);
  expect((await f.db.collection("diplomaticActions").findOne({ countryId: "US" }))?.remaining).toBe(
    1
  );
  const replies = await Promise.all([run(), run()]);
  expect(replies.map((r) => r.status)).toEqual([200, 200]);
  expect(await replies[0].json()).toEqual(await replies[1].json());
  expect(await f.db.collection("organizationMembershipProposals").countDocuments({})).toBe(1);
  expect(
    (await f.db.collection("organizationMembershipProposals").findOne({}))?.domesticBillId
  ).toBeTruthy();
  expect((await f.db.collection("diplomaticActions").findOne({ countryId: "US" }))?.remaining).toBe(
    0
  );
  builder.mockRestore();
});
