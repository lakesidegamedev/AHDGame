import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const nomination = vi.hoisted(() => ({
  countryId: "US",
  positionId: "secretary_of_treasury",
  status: "active",
  nomineeCharacterId: null,
  nomineeNppId: null,
  votingEndsAt: new Date("2026-01-01T00:00:00Z"),
  votingEndsOnTurn: 103,
}));
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => ({
    collection: () => ({ findOne: async () => ({ ...nomination, _id: new ObjectId() }) }),
  }),
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: async () => null }));
vi.mock("@/lib/congress/governmentVoteBreakdown", () => ({
  computeCabinetNominationTally: async () => ({ votesFor: 35, votesAgainst: 34, votesAbstain: 6 }),
}));
vi.mock("@/lib/constants", () => ({
  getCabinetPositionById: () => ({ name: "Treasury secretary" }),
}));
import { GET } from "./route";

describe("cabinet nomination detail deadline", () => {
  it("exposes the authoritative turn deadline without changing the open vote", async () => {
    const response = await GET(new Request("https://game.test/api/nomination"), {
      params: Promise.resolve({ id: new ObjectId().toHexString() }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.votingEndsOnTurn).toBe(103);
    expect(body.status).toBe("active");
    expect(body.votesFor).toBe(35);
  });
});
