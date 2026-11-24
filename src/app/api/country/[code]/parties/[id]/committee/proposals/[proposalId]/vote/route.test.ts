import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { findPartyBySequentialId } from "@/lib/db/partyLookup";
import { castVote, withdrawVote } from "@/lib/parties/proposals";
import { DELETE, POST } from "./route";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuthWithCharacter: vi.fn() }));
vi.mock("@/lib/db/partyLookup", () => ({ findPartyBySequentialId: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/time/gameTime", () => ({ getGameTime: async () => ({ currentTurn: 180 }) }));
vi.mock("@/lib/parties/proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/parties/proposals")>()),
  castVote: vi.fn().mockResolvedValue(null),
  withdrawVote: vi.fn().mockResolvedValue(true),
}));

let db: ReturnType<typeof createMockDb>;
const voter = new ObjectId();
const target = new ObjectId();
const partyOid = new ObjectId();
const proposalId = new ObjectId();
const party = {
  _id: partyOid,
  sequentialId: 1,
  countryId: "US",
  chairId: target,
  viceChairId: null,
  treasurerId: null,
  committeeIds: [voter, new ObjectId()],
};
const openRemoval = {
  _id: proposalId,
  type: "removeOfficeHolder",
  status: "open",
  partyId: partyOid,
  proposingVotes: [{ voterId: voter, vote: "yes", votedAt: new Date() }],
  removeOfficeHolder: { role: "chair", targetCharacterId: target },
};

function signIn(characterId: ObjectId) {
  vi.mocked(requireAuthWithCharacter).mockResolvedValue({
    ok: true,
    user: { userId: "u", character: { _id: characterId, countryId: "US", party: "1" } },
  } as never);
}

const params = {
  params: Promise.resolve({ code: "us", id: "1", proposalId: proposalId.toString() }),
};
const url = `http://localhost/api/proposals/${proposalId.toString()}/vote`;

beforeEach(() => {
  vi.clearAllMocks();
  db = createMockDb();
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  vi.mocked(findPartyBySequentialId).mockResolvedValue(party as never);
  db.collection("committeeProposals").findOne.mockResolvedValue(openRemoval);
  signIn(voter);
});

describe("withdrawing a committee vote", () => {
  it("withdraws the caller's vote on an open proposal", async () => {
    const response = await DELETE(new Request(url, { method: "DELETE" }), params);
    expect(response.status).toBe(200);
    expect(withdrawVote).toHaveBeenCalledOnce();
    const [, id, characterId, side] = vi.mocked(withdrawVote).mock.calls[0]!;
    expect(id.equals(proposalId)).toBe(true);
    expect(characterId.equals(voter)).toBe(true);
    expect(side).toBe("proposing");
  });

  it("returns 400 when the caller has no vote to withdraw", async () => {
    vi.mocked(withdrawVote).mockResolvedValueOnce(false);
    const response = await DELETE(new Request(url, { method: "DELETE" }), params);
    expect(response.status).toBe(400);
  });

  it("refuses once the proposal is closed", async () => {
    db.collection("committeeProposals").findOne.mockResolvedValue({
      ...openRemoval,
      status: "passed",
    });
    const response = await DELETE(new Request(url, { method: "DELETE" }), params);
    expect(response.status).toBe(400);
    expect(withdrawVote).not.toHaveBeenCalled();
  });
});

describe("casting or changing a committee vote", () => {
  it("records a changed vote through castVote", async () => {
    const response = await POST(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: "no" }),
      }),
      params
    );
    expect(response.status).toBe(200);
    expect(vi.mocked(castVote).mock.calls[0]![3]).toBe("no");
  });

  it("still blocks the target from voting on their own removal", async () => {
    signIn(target);
    const response = await POST(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: "no" }),
      }),
      params
    );
    expect(response.status).toBe(403);
    expect(castVote).not.toHaveBeenCalled();
  });
});
