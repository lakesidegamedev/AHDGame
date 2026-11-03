import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import type { AuthUserWithCharacter } from "@/lib/auth";
import { proposeStateBill } from "./proposeStateBill";
import { resolvePartyNppProposalAccess } from "../queries/partyNppProposalAccess";
import { validateStateBillProvisions } from "./validateStateBillProvisions";
vi.mock("../queries/partyNppProposalAccess", () => ({ resolvePartyNppProposalAccess: vi.fn() }));
vi.mock("@/lib/countryState", () => ({
  getCountryState: vi.fn().mockResolvedValue({ governmentType: "democracy" }),
}));
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentTurn: 100 }),
}));
vi.mock("./validateStateBillProvisions", () => ({ validateStateBillProvisions: vi.fn() }));
describe("Chair-directed regional proposal command", () => {
  const chair = new ObjectId(),
    nppId = new ObjectId();
  let db: ReturnType<typeof createMockDb>;
  const user = {
    character: {
      _id: chair,
      name: "Chair",
      party: "1",
      countryId: "UK",
      actions: 20,
      nationalInfluence: 20,
    },
    isAdmin: false,
  } as AuthUserWithCharacter;
  const input = {
    title: "Schools Act",
    summary: "Support regional schools.",
    category: "education",
    proposeViaPartyNpp: true,
  };
  const propose = (overrides = {}) =>
    proposeStateBill(db as unknown as Db, "UK", "SCO", user, { ...input, ...overrides });
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    vi.mocked(resolvePartyNppProposalAccess).mockResolvedValue({
      authorized: true,
      npp: { _id: nppId, name: "Party legislator", party: "1" },
    });
    vi.mocked(validateStateBillProvisions).mockResolvedValue({
      ok: true,
      provisions: [],
      influenceProvisionCount: 1,
    });
  });
  it("records NPP sponsorship, the paying chair, and normal costs and deadlines", async () => {
    expect((await propose()).status).toBe(200);
    expect(db.collection("stateBills").insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        sponsorId: null,
        sponsorNppId: nppId,
        nppId,
        isNPP: true,
        sponsorName: "Party legislator",
        sponsorParty: "1",
        proposalPayerId: chair,
        proposalActionCost: 10,
        proposalNpiCost: 5,
        votingEndsOnTurn: 124,
      })
    );
    expect(db.collection("characters").updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: chair }),
      expect.objectContaining({ $inc: { actions: -10, nationalInfluence: -5 } })
    );
  });
  it.each([
    [false, null, 403],
    [true, null, 409],
  ] as const)(
    "rejects unauthorized or unavailable sponsors before charging",
    async (authorized, npp, status) => {
      vi.mocked(resolvePartyNppProposalAccess).mockResolvedValue({ authorized, npp });
      expect((await propose()).status).toBe(status);
      expect(db.collection("characters").updateOne).not.toHaveBeenCalled();
      expect(db.collection("stateBills").insertOne).not.toHaveBeenCalled();
    }
  );
  it("does not allow an admin override to bypass party authorization", async () => {
    expect((await propose({ adminOverride: true })).status).toBe(400);
    expect(resolvePartyNppProposalAccess).not.toHaveBeenCalled();
  });
  it("does not charge rejected law or tax provisions", async () => {
    vi.mocked(validateStateBillProvisions).mockResolvedValue({
      ok: false,
      status: 409,
      error: "Current law cannot be proposed",
    });
    expect((await propose()).status).toBe(409);
    expect(db.collection("characters").updateOne).not.toHaveBeenCalled();
  });
  it("keeps the requester's one-in-flight-bill limit", async () => {
    db.collection("stateBills").findOne.mockResolvedValue({ _id: new ObjectId() });
    expect((await propose()).status).toBe(403);
    expect(db.collection("characters").updateOne).not.toHaveBeenCalled();
  });
  it("refunds a concurrent sponsorship conflict", async () => {
    db.collection("stateBills").insertOne.mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: 11000 })
    );
    expect((await propose()).status).toBe(409);
    expect(db.collection("characters").updateOne).toHaveBeenLastCalledWith(
      { _id: chair },
      expect.objectContaining({ $inc: { actions: 10, nationalInfluence: 5 } })
    );
  });
  it("rejects an atomic spend that loses an affordability race", async () => {
    db.collection("characters").updateOne.mockResolvedValue({ modifiedCount: 0 });
    expect((await propose()).status).toBe(409);
    expect(db.collection("stateBills").insertOne).not.toHaveBeenCalled();
  });
});
