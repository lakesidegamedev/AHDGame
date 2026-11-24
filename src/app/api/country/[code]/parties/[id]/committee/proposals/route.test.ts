import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { findPartyBySequentialId } from "@/lib/db/partyLookup";
import { notifyRemovalVoteOpened } from "@/lib/parties/officeRemovalNotifications";
import { GET, POST } from "./route";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuthWithCharacter: vi.fn() }));
vi.mock("@/lib/db/partyLookup", () => ({ findPartyBySequentialId: vi.fn() }));
vi.mock("@/lib/parties/officeRemovalNotifications", () => ({
  notifyRemovalVoteOpened: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/time/gameTime", () => ({ getGameTime: async () => ({ currentTurn: 10 }) }));

let db: ReturnType<typeof createMockDb>;
const chairId = new ObjectId();
const source = { _id: new ObjectId(), sequentialId: 1, countryId: "US", chairId, committeeIds: [] };
const target = { _id: new ObjectId(), sequentialId: 2, countryId: "US" };
beforeEach(() => {
  vi.clearAllMocks();
  db = createMockDb();
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  vi.mocked(requireAuthWithCharacter).mockResolvedValue({
    ok: true,
    user: {
      userId: "test",
      isAdmin: false,
      character: { _id: chairId, countryId: "US", party: "1" },
    },
  } as never);
  vi.mocked(findPartyBySequentialId).mockResolvedValue(source as never);
  db.collection("politicalParties").findOne.mockResolvedValue(target);
  db.collection("states").find.mockReturnValue({
    toArray: async () => [{ _id: "CA" }, { _id: "OR" }, { _id: "WA" }],
  });
  db.collection("committeeProposals").insertOne.mockResolvedValue({ insertedId: new ObjectId() });
});
async function request() {
  return POST(
    new Request("http://localhost/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "merge", targetPartyId: target._id.toString() }),
    }),
    { params: Promise.resolve({ code: "us", id: "1" }) }
  );
}
describe("merger proposal geography", () => {
  it.each([
    ["CA", 200],
    ["OR", 200],
    ["WA", 400],
  ] as const)("target in %s returns %s", async (region, status) => {
    db.collection("characters").find.mockReturnValue({
      toArray: async () => [
        { party: "1", homeState: "CA" },
        { party: "2", homeState: region },
      ],
    });
    const response = await request();
    expect(response.status).toBe(status);
    if (status === 400) {
      expect((await response.json()).error).toContain("adjacent region");
      expect(db.collection("committeeProposals").insertOne).not.toHaveBeenCalled();
    } else expect(db.collection("committeeProposals").insertOne).toHaveBeenCalledOnce();
  });
  it("does not exempt an admin from merger geography", async () => {
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        userId: "admin",
        isAdmin: true,
        character: { _id: chairId, countryId: "US", party: "1" },
      },
    } as never);
    expect((await request()).status).toBe(400);
    expect(db.collection("committeeProposals").insertOne).not.toHaveBeenCalled();
  });
});

it.each(["US", "CA"])("blocks default-party rename submission in %s", async (countryId) => {
  vi.mocked(findPartyBySequentialId).mockResolvedValue({
    ...source,
    countryId,
    isDefault: true,
  } as never);
  vi.mocked(requireAuthWithCharacter).mockResolvedValue({
    ok: true,
    user: { userId: "test", character: { _id: chairId, countryId, party: "1" } },
  } as never);
  const response = await POST(
    new Request("http://localhost/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "rename", newName: "Changed Name", newAbbreviation: "NEW" }),
    }),
    { params: Promise.resolve({ code: countryId.toLowerCase(), id: "1" }) }
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("Default parties cannot");
  expect(db.collection("committeeProposals").insertOne).not.toHaveBeenCalled();
  expect(db.collection("politicalParties").updateOne).not.toHaveBeenCalled();
});

describe("office removal proposal", () => {
  it("tells the targeted office holder the vote is open, excluding them from the count", async () => {
    const committeeMember = new ObjectId();
    const targetChair = new ObjectId();
    const viceChair = new ObjectId();
    const party = {
      ...source,
      chairId: targetChair,
      viceChairId: viceChair,
      treasurerId: null,
      committeeIds: [committeeMember, new ObjectId(), new ObjectId()],
    };
    vi.mocked(findPartyBySequentialId).mockResolvedValue(party as never);
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: { userId: "test", character: { _id: committeeMember, countryId: "US", party: "1" } },
    } as never);
    const insertedId = new ObjectId();
    db.collection("committeeProposals").insertOne.mockResolvedValue({ insertedId });

    const response = await POST(
      new Request("http://localhost/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "removeOfficeHolder",
          role: "chair",
          targetCharacterId: targetChair.toString(),
        }),
      }),
      { params: Promise.resolve({ code: "us", id: "1" }) }
    );

    expect(response.status).toBe(200);
    expect(notifyRemovalVoteOpened).toHaveBeenCalledOnce();
    const arg = vi.mocked(notifyRemovalVoteOpened).mock.calls[0]![0];
    expect(arg.proposalId).toBe(insertedId);
    expect(arg.role).toBe("chair");
    expect(arg.targetCharacterId.equals(targetChair)).toBe(true);
    // Three committee members plus the vice chair; the targeted chair is excluded.
    expect(arg.eligibleVoters).toBe(4);
    expect(arg.yesNeeded).toBe(3);
    expect(arg.expiresAtTurn).toBe(34);
  });

  it("sends no removal notice for other proposal types", async () => {
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: { userId: "test", character: { _id: chairId, countryId: "US", party: "1" } },
    } as never);
    db.collection("characters").find.mockReturnValue({
      toArray: async () => [
        { party: "1", homeState: "CA" },
        { party: "2", homeState: "OR" },
      ],
    });
    expect((await request()).status).toBe(200);
    expect(notifyRemovalVoteOpened).not.toHaveBeenCalled();
  });
});

describe("proposal page data for a removal vote", () => {
  it("shows when the vote can pass and counts the target out of the voter set", async () => {
    const targetChair = new ObjectId();
    const committee = [new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId()];
    vi.mocked(findPartyBySequentialId).mockResolvedValue({
      ...source,
      chairId: targetChair,
      viceChairId: null,
      treasurerId: null,
      committeeIds: committee,
    } as never);
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: { userId: "test", character: { _id: committee[0], countryId: "US", party: "1" } },
    } as never);
    const createdAt = new Date(Date.now() - 60 * 60 * 1000);
    const removal = {
      _id: new ObjectId(),
      type: "removeOfficeHolder",
      status: "open",
      partyId: source._id,
      proposedBy: committee[0],
      createdAt,
      createdAtTurn: 9,
      expiresAtTurn: 33,
      proposingVotes: [],
      removeOfficeHolder: { role: "chair", targetCharacterId: targetChair },
    };
    db.collection("committeeProposals")
      .find.mockReturnValueOnce({ sort: () => ({ toArray: async () => [removal] }) })
      .mockReturnValueOnce({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) })
      .mockReturnValueOnce({ sort: () => ({ toArray: async () => [] }) });

    const response = await GET(new Request("http://localhost/api/proposals"), {
      params: Promise.resolve({ code: "us", id: "1" }),
    });
    const body = await response.json();
    const view = body.openProposals[0];

    expect(view.earliestPassAt).toBe(
      new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
    );
    expect(view.canPassNow).toBe(false);
    // Five seats on the party, four once the targeted chair is left out: three yes needed.
    expect(view.proposingVoteSummary.notVoted).toBe(4);
    expect(view.proposingVoteSummary.yesNeeded).toBe(3);
  });
});

describe("removal vote cooldown", () => {
  const committeeMember = new ObjectId();
  const targetChair = new ObjectId();
  const partyDoc = () => ({
    ...source,
    chairId: targetChair,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [committeeMember, new ObjectId(), new ObjectId()],
  });

  beforeEach(() => {
    vi.mocked(findPartyBySequentialId).mockResolvedValue(partyDoc() as never);
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: { userId: "test", character: { _id: committeeMember, countryId: "US", party: "1" } },
    } as never);
    // Current turn is 10 (gameTime mock); the chair won their seat at turn 5.
    db.collection("nationalPartyElections").find.mockReturnValue({
      toArray: async () => [{ position: "chair", winnerId: targetChair, endTurn: 5 }],
    });
  });

  it("refuses to open a removal vote inside 24 turns of the holder taking the seat", async () => {
    const response = await POST(
      new Request("http://localhost/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "removeOfficeHolder",
          role: "chair",
          targetCharacterId: targetChair.toString(),
        }),
      }),
      { params: Promise.resolve({ code: "us", id: "1" }) }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("took the National Chair seat at turn 5");
    expect(body.error).toContain("from turn 29");
    expect(db.collection("committeeProposals").insertOne).not.toHaveBeenCalled();
    expect(notifyRemovalVoteOpened).not.toHaveBeenCalled();
  });

  it("lists the lock with its reason and unlock turn for the proposal form", async () => {
    db.collection("committeeProposals")
      .find.mockReturnValueOnce({ sort: () => ({ toArray: async () => [] }) })
      .mockReturnValueOnce({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) })
      .mockReturnValueOnce({ sort: () => ({ toArray: async () => [] }) });

    const response = await GET(new Request("http://localhost/api/proposals"), {
      params: Promise.resolve({ code: "us", id: "1" }),
    });
    const body = await response.json();

    expect(body.removalLocks).toEqual([
      {
        characterId: targetChair.toString(),
        role: "chair",
        reason: "recently_seated",
        sinceTurn: 5,
        unlocksAtTurn: 29,
        message: expect.stringContaining("from turn 29"),
      },
    ]);
  });
});
