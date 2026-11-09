/**
 * Integration tests for the character-audience branch of the national-party whip
 * POST route. Validates the 1-attempt cap, audit row shape, eligibility lookup,
 * and back-compat for the default NPP path.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/time/gameTime", () => ({ getGameTime: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuthWithCharacter: vi.fn(),
}));
vi.mock("@/lib/db/partyLookup", () => ({
  findPartyBySequentialId: vi.fn(),
}));
vi.mock("@/lib/mail/systemMail", () => ({
  sendSystemMail: vi.fn().mockResolvedValue(undefined),
  sendSystemMails: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ ok: true, limit: 100, remaining: 99, resetAt: Date.now() + 60_000 }),
  rateLimitResponse: vi.fn(),
}));

describe("POST /api/country/[code]/parties/[id]/whip — character audience", () => {
  let db: MockDb;
  const chairId = new ObjectId();
  const partyId = "1";
  const billId = new ObjectId();
  const c1 = new ObjectId();

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);

    const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        userId: new ObjectId().toString(),
        isAdmin: false,
        character: { _id: chairId, name: "Chair" },
      },
    } as never);

    const { findPartyBySequentialId } = await import("@/lib/db/partyLookup");
    vi.mocked(findPartyBySequentialId).mockResolvedValue({
      _id: partyId as unknown as ObjectId,
      sequentialId: 1,
      countryId: "US",
      isDefault: true,
      chairId,
      viceChairId: null,
    } as never);

    const { checkRateLimit } = await import("@/lib/api/rateLimit");
    vi.mocked(checkRateLimit).mockReturnValue({
      ok: true,
      limit: 100,
      remaining: 99,
      resetAt: Date.now() + 60_000,
    });

    // Bill exists and is active
    db.collection("bills").findOne.mockResolvedValue({
      _id: billId,
      status: "active",
      title: "Test Bill",
      votes: {},
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
    });

    // No existing whips
    db.collection("billWhips").find.mockReturnValue({ toArray: async () => [] });
    db.collection("billWhips").insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    // Eligible characters lookup
    db.collection("electedOfficials").find.mockReturnValue({
      toArray: async () => [{ characterId: c1, isNPP: false }],
    });
    db.collection("characters").find.mockReturnValue({
      project: () => ({
        toArray: async () => [
          { _id: c1, userId: new ObjectId(), name: "Player 1", sequentialId: 42 },
        ],
      }),
    });
    db.collection("users").find.mockReturnValue({
      project: () => ({ toArray: async () => [] }),
    });

    // NPPs (empty so the NPP-audience path can resolve too when we want back-compat check)
    db.collection("npps").find.mockReturnValue({ toArray: async () => [] });
  });

  it.each([
    ["bill", "house"],
    ["bill", "senate"],
    ["bill", "stateSenate"],
    ["bill", "regionalCouncil"],
    ["speakerElection", "house"],
    ["leadershipElection", "senate"],
    ["pmAppointmentVote", "commons"],
    ["noConfidenceVote", "commons"],
    ["cabinetNomination", "senate"],
    ["scotusNomination", "senate"],
    ["speakerVacateMotion", "house"],
    ["impeachmentVote", "house"],
  ])(
    "rejects explicit and default hard player %s whips for %s without writes",
    async (targetType, chamber) => {
      const { POST } = await import("./route");
      for (const mode of ["hard", undefined]) {
        const res = await POST(
          new Request("http://localhost/api/country/US/parties/1/whip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audience: "character",
              targetType,
              targetId: billId.toString(),
              chamber,
              direction: "for",
              mode,
            }),
          }),
          { params: Promise.resolve({ code: "US", id: partyId }) }
        );
        expect(res.status).toBe(400);
        expect(JSON.stringify(await res.json())).toContain("Hard whips cannot force player votes");
      }
      expect(db.collectionMocks.billWhips!.insertOne).not.toHaveBeenCalled();
      expect(db.collectionMocks.bills!.updateOne).not.toHaveBeenCalled();
    }
  );

  async function postScotus(overrides: Record<string, unknown> = {}) {
    const { POST } = await import("./route");
    return POST(
      new Request("http://localhost/api/country/US/parties/1/whip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: overrides.audience === "npp" ? "hard" : "soft",
          targetType: "scotusNomination",
          targetId: billId.toString(),
          chamber: "senate",
          direction: "against",
          audience: "character",
          ...overrides,
        }),
      }),
      { params: Promise.resolve({ code: "US", id: partyId }) }
    );
  }

  async function setupScotus() {
    const { getGameTime } = await import("@/lib/time/gameTime");
    vi.mocked(getGameTime).mockResolvedValue({
      currentTurn: 100,
      effectiveNow: new Date("2026-09-01T00:00:00Z"),
    } as never);
    db.collection("scotusNominations").findOne.mockResolvedValue({
      _id: billId,
      countryId: "US",
      status: "active",
      nomineeName: "Test Nominee",
      votingEndsOnTurn: 124,
      votes: { [c1.toString()]: "abstain" },
    });
    const chars = [{ _id: c1, userId: new ObjectId(), name: "Test Senator", sequentialId: 42 }];
    db.collection("characters").find.mockReturnValue({
      project() {
        return this;
      },
      toArray: async () => chars,
    });
  }

  it.each(["for", "against"])(
    "rejects hard player Supreme Court whips %s without writes",
    async (direction) => {
      await setupScotus();
      const response = await postScotus({ direction, mode: "hard" });
      expect(response.status).toBe(400);
      expect(db.collectionMocks.scotusNominations!.updateOne).not.toHaveBeenCalled();
      expect(db.collectionMocks.billWhips!.insertOne).not.toHaveBeenCalled();
    }
  );

  it("sends a soft Supreme Court recommendation without changing votes", async () => {
    await setupScotus();
    const response = await postScotus({ mode: "soft" });
    expect(response.status).toBe(200);
    expect(db.collectionMocks.scotusNominations!.updateOne).not.toHaveBeenCalled();
  });

  it.each(["for", "against"])(
    "applies an NPP Supreme Court whip %s using Senate seat weights",
    async (direction) => {
      await setupScotus();
      const nppId = new ObjectId();
      db.collection("electedOfficials").find.mockReturnValue({
        toArray: async () => [
          { nppId, isNPP: true, officeType: "senate", seatsHeld: 7 },
          { nppId, isNPP: true, officeType: "senate", seatsHeld: 7 },
        ],
      });
      db.collection("npps").find.mockReturnValue({
        toArray: async () => [{ _id: nppId, party: "1" }],
      });
      db.collection("scotusNominations").findOne.mockResolvedValue({
        _id: billId,
        countryId: "US",
        status: "active",
        votingEndsOnTurn: 124,
        votes: { [`npp_${nppId}`]: direction === "for" ? "against" : "for" },
      });
      const response = await postScotus({ direction, audience: "npp" });
      expect(response.status).toBe(200);
      expect(db.collectionMocks.scotusNominations!.updateOne).toHaveBeenCalledWith(
        { _id: billId },
        expect.objectContaining({
          $set: expect.objectContaining({ [`votes.npp_${nppId}`]: direction }),
          $inc: {
            [direction === "for" ? "votesFor" : "votesAgainst"]: 7,
            [direction === "for" ? "votesAgainst" : "votesFor"]: -7,
          },
        })
      );
    }
  );

  it("rejects Supreme Court whips outside the Senate before recording a directive", async () => {
    await setupScotus();
    expect((await postScotus({ chamber: "house" })).status).toBe(400);
    expect(db.collectionMocks.billWhips!.insertOne).not.toHaveBeenCalled();
  });

  it("rejects an expired Supreme Court vote even while its status is active", async () => {
    await setupScotus();
    db.collection("scotusNominations").findOne.mockResolvedValue({
      _id: billId,
      countryId: "US",
      status: "active",
      votingEndsOnTurn: 99,
    });
    expect((await postScotus()).status).toBe(409);
    expect(db.collectionMocks.billWhips!.insertOne).not.toHaveBeenCalled();
  });

  it("rejects a closed or cross-country Supreme Court nomination", async () => {
    await setupScotus();
    db.collection("scotusNominations").findOne.mockResolvedValue(null);
    expect((await postScotus()).status).toBe(404);
    expect(db.collectionMocks.scotusNominations!.findOne).toHaveBeenCalledWith({
      _id: billId,
      countryId: "US",
      status: "active",
    });
    expect(db.collectionMocks.billWhips!.insertOne).not.toHaveBeenCalled();
  });

  it("retains the two-attempt NPP cap for Supreme Court nominations", async () => {
    await setupScotus();
    db.collection("billWhips").find.mockReturnValue({ toArray: async () => [{}, {}] });
    expect((await postScotus({ audience: "npp" })).status).toBe(400);
    expect(db.collectionMocks.billWhips!.insertOne).not.toHaveBeenCalled();
  });

  it("batches advisory notifications without mail or bill vote writes for eleven players", async () => {
    const recipients = Array.from({ length: 11 }, (_, index) => ({
      _id: new ObjectId(),
      userId: new ObjectId(),
      name: `Player ${index}`,
      sequentialId: index + 1,
    }));
    db.collection("electedOfficials").find.mockReturnValue({
      toArray: async () => recipients.map((char) => ({ characterId: char._id, isNPP: false })),
    });
    db.collection("characters").find.mockReturnValue({
      project: () => ({ toArray: async () => recipients }),
    });
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/country/US/parties/1/whip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audience: "character",
        targetType: "bill",
        mode: "soft",
        targetId: billId.toString(),
        chamber: "house",
        direction: "for",
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ code: "US", id: partyId }) });
    expect(res.status).toBe(200);
    expect((await res.json()).mailedCount).toBe(11);
    const { sendSystemMail, sendSystemMails } = await import("@/lib/mail/systemMail");
    const { createNotification, createNotifications } = await import("@/lib/notifications");
    expect(sendSystemMail).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(sendSystemMails).not.toHaveBeenCalled();
    expect(db.collectionMocks.bills!.updateOne).not.toHaveBeenCalled();
    expect(createNotifications).toHaveBeenCalledOnce();
    expect(vi.mocked(createNotifications).mock.calls[0]?.[0]).toHaveLength(11);
  });

  it("issues a character whip and writes a BillWhip with audience=character", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/country/US/parties/1/whip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audience: "character",
        targetType: "bill",
        mode: "soft",
        targetId: billId.toString(),
        chamber: "house",
        direction: "for",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ code: "US", id: partyId }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.audience).toBe("character");
    expect(body.affected).toBe(0);
    expect(body.mailedCount).toBe(1);

    const insertCalls = db.collectionMocks["billWhips"]!.insertOne.mock.calls;
    const inserted = insertCalls[0]?.[0] as {
      audience: string;
      attemptNumber: number;
      issuedByRole?: string;
    };
    expect(inserted.audience).toBe("character");
    expect(inserted.attemptNumber).toBe(1);
    expect(inserted.issuedByRole).toBe("chair");
  });

  it("rejects a second character whip on the same target", async () => {
    // Existing character whip present — return for the character-specific query.
    // Route makes 2 find calls: first scoped to npp-or-missing (legacy), second scoped to character.
    let call = 0;
    db.collection("billWhips").find.mockImplementation(() => {
      call++;
      if (call === 1) {
        return { toArray: async () => [] } as never;
      }
      // Second call is the character-scoped check
      return { toArray: async () => [{ audience: "character", mode: "soft" }] } as never;
    });

    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/country/US/parties/1/whip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audience: "character",
        targetType: "bill",
        mode: "soft",
        targetId: billId.toString(),
        chamber: "house",
        direction: "for",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ code: "US", id: partyId }) });
    expect(res.status).toBe(400);
  });

  it("scopes speaker-election whip checks to the current election instance (ticket #959)", async () => {
    // Reused _id "current" means old whips from a prior Speaker election persist
    // in billWhips. The existing-whip check must be scoped to whips issued after
    // this election opened, or the panel freezes with stale whips forever.
    const startedAt = new Date("2026-07-13T03:00:00Z");
    db.collection("speakerElections").findOne.mockResolvedValue({
      _id: "current",
      status: "voting",
      startedAt,
    });

    const candidacyId = new ObjectId().toString();
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/country/US/parties/1/whip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audience: "character",
        targetType: "speakerElection",
        targetId: "current",
        chamber: "house",
        direction: "for",
        mode: "soft",
        candidacyId,
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ code: "US", id: partyId }) });
    expect(res.status).toBe(200);

    // Both existing-whip queries (npp cap + character cap) must carry the
    // startedAt cutoff so June whips against the same "current" id are ignored.
    const findQueries = db.collectionMocks["billWhips"]!.find.mock.calls.map((c) => c[0]);
    const scoped = findQueries.filter(
      (q) =>
        q?.createdAt?.$gte instanceof Date && q.createdAt.$gte.getTime() === startedAt.getTime()
    );
    expect(scoped.length).toBe(2);
  });

  it("defaults audience to npp when omitted (back-compat)", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/country/US/parties/1/whip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "bill",
        targetId: billId.toString(),
        chamber: "house",
        direction: "for",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ code: "US", id: partyId }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    // NPP response shape includes fellInLine/ignored, not affected/mailedCount
    expect(body).toHaveProperty("fellInLine");
    const insertCalls = db.collectionMocks["billWhips"]!.insertOne.mock.calls;
    const inserted = insertCalls[0]?.[0] as { audience: string };
    expect(inserted.audience).toBe("npp");
  });
});
