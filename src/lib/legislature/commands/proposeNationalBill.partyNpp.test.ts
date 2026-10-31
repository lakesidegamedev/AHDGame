import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import type { AuthUser } from "@/lib/auth";
import { proposeNationalBill } from "./proposeNationalBill";
import { resolveNationalPartyNppAccess } from "../queries/nationalPartyNppAccess";
vi.mock("../queries/nationalPartyNppAccess", () => ({ resolveNationalPartyNppAccess: vi.fn() }));
vi.mock("@/lib/countryState", () => ({
  getCountryState: vi.fn().mockResolvedValue({ governmentType: "democracy" }),
}));
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentTurn: 100 }),
}));
vi.mock("@/lib/countryAccess", () => ({ getEnabledCountryIds: vi.fn().mockResolvedValue(["US"]) }));
describe("National chair proposal command", () => {
  let db: ReturnType<typeof createMockDb>;
  const chair = new ObjectId(),
    npp = new ObjectId(),
    userId = new ObjectId();
  const auth = { userId: userId.toString(), isAdmin: false } as AuthUser;
  const input = {
    title: "Party Bill",
    summary: "Synthetic national proposal",
    chamber: "house",
    category: "custom",
    provisions: [],
    proposeViaPartyNpp: true,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("characters").findOne.mockResolvedValue({
      _id: chair,
      userId,
      name: "Chair",
      party: "1",
      countryId: "US",
      actions: 20,
      nationalInfluence: 20,
    });
    vi.mocked(resolveNationalPartyNppAccess).mockResolvedValue({
      authorized: true,
      blocked: false,
      sponsor: { npp: { _id: npp, name: "Senator", party: "1" } as never, chamber: "senate" },
    });
  });
  it("uses the randomly chosen NPP's actual chamber and charges the chair", async () => {
    expect((await proposeNationalBill(db as unknown as Db, "US", auth, input)).status).toBe(201);
    expect(db.collection("bills").insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        originChamber: "senate",
        currentChamber: "senate",
        sponsorId: npp,
        sponsorName: "Senator",
        nppSponsored: true,
        proposalPayerId: chair,
        proposalActionCost: 10,
      })
    );
  });
  it.each([
    [false, false, 403],
    [true, true, 409],
  ] as const)("rejects unauthorized and busy parties", async (authorized, blocked, status) => {
    vi.mocked(resolveNationalPartyNppAccess).mockResolvedValue({
      authorized,
      blocked,
      sponsor: null,
    });
    expect((await proposeNationalBill(db as unknown as Db, "US", auth, input)).status).toBe(status);
    expect(db.collection("characters").updateOne).not.toHaveBeenCalled();
  });
  it("does not let the chair's human-sponsored bill consume the party NPP slot", async () => {
    db.collection("bills").findOne.mockResolvedValue({ sponsorId: chair, status: "active" });
    expect((await proposeNationalBill(db as unknown as Db, "US", auth, input)).status).toBe(201);
  });

  it("does not waive costs for an admin acting as national chair", async () => {
    expect(
      (await proposeNationalBill(db as unknown as Db, "US", { ...auth, isAdmin: true }, input))
        .status
    ).toBe(201);
    expect(db.collection("characters").updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: chair }),
      expect.objectContaining({ $inc: { actions: -10 } })
    );
  });
  it("refunds a lost concurrent party slot", async () => {
    db.collection("bills").insertOne.mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: 11000 })
    );
    expect((await proposeNationalBill(db as unknown as Db, "US", auth, input)).status).toBe(409);
    expect(db.collection("characters").updateOne).toHaveBeenLastCalledWith(
      { _id: chair },
      expect.objectContaining({ $inc: { actions: 10 } })
    );
  });
});
