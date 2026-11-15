import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { ApiError } from "@/lib/api/errors";
import type { Character, PoliticalParty } from "@/lib/db/types";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import {
  issueNationalPartyWhip,
  nationalPartyWhipSchema,
  type NationalPartyWhipRequest,
} from "./issueNationalPartyWhip";

vi.mock("@/lib/partyWhips/playerWhip", () => ({
  getEligibleCharactersForWhip: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/congress/applyWhipVotes", () => ({
  applyWhipVotesToBill: vi.fn().mockResolvedValue({ fellInLine: 0, ignored: 0 }),
  applyWhipVotesToLeadership: vi.fn().mockResolvedValue({ fellInLine: 0, ignored: 0 }),
  applyWhipVotesToGovernmentVote: vi.fn().mockResolvedValue({ fellInLine: 0, ignored: 0 }),
  applyWhipVotesToCabinet: vi.fn().mockResolvedValue({ fellInLine: 0, ignored: 0 }),
  applyWhipVotesToVacateMotion: vi.fn().mockResolvedValue({ fellInLine: 0, ignored: 0 }),
  applyWhipVotesToImpeachment: vi.fn().mockResolvedValue({ fellInLine: 0, ignored: 0 }),
}));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: vi.fn().mockResolvedValue({
    currentTurn: 100,
    effectiveNow: new Date("2026-09-01T00:00:00Z"),
  }),
}));
vi.mock("@/lib/parties/antiAbuseGuards", () => ({
  getPartyNppControlStatus: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/notifications", () => ({ createNotifications: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));

function makeCursor(docs: unknown[]) {
  return {
    toArray: vi.fn().mockResolvedValue(docs),
    project: vi.fn().mockReturnThis(),
  };
}

function request(overrides: Partial<NationalPartyWhipRequest>): NationalPartyWhipRequest {
  return nationalPartyWhipSchema.parse({
    targetType: "bill",
    targetId: new ObjectId().toString(),
    chamber: "senate",
    direction: "for",
    ...overrides,
  });
}

describe("issueNationalPartyWhip", () => {
  let db: MockDb;
  let chairId: ObjectId;
  let party: PoliticalParty;
  let character: Character;
  let billId: ObjectId;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    chairId = new ObjectId();
    billId = new ObjectId();
    party = {
      sequentialId: 1,
      countryId: "US",
      name: "Test Party",
      isDefault: true,
      chairId,
      viceChairId: null,
    } as unknown as PoliticalParty;
    character = {
      _id: chairId,
      name: "Chair",
      stats: { statecraft: 50 },
    } as unknown as Character;

    for (const name of [
      "billWhips",
      "bills",
      "characters",
      "congressLeaders",
      "electedOfficials",
      "npps",
    ]) {
      db.collection(name);
    }
    db.collectionMocks["congressLeaders"]!.findOne.mockResolvedValue(null);
    db.collectionMocks["billWhips"]!.find.mockReturnValue(makeCursor([]));
    db.collectionMocks["billWhips"]!.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
    db.collectionMocks["bills"]!.findOne.mockResolvedValue({
      _id: billId,
      title: "Test Bill",
      status: "active",
      countryId: "US",
    });
    db.collectionMocks["electedOfficials"]!.find.mockReturnValue(makeCursor([]));
  });

  function run(req: NationalPartyWhipRequest, actor: Character = character) {
    return issueNationalPartyWhip({
      db: db as unknown as Db,
      countryId: "US",
      party,
      character: actor,
      isAdmin: false,
      request: req,
    });
  }

  it("issues an NPP bill whip, casts votes and trains statecraft", async () => {
    const { applyWhipVotesToBill } = await import("@/lib/congress/applyWhipVotes");
    vi.mocked(applyWhipVotesToBill).mockResolvedValueOnce({ fellInLine: 3, ignored: 1 } as never);

    const result = await run(request({ targetId: billId.toString() }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toMatchObject({
      success: true,
      attemptNumber: 1,
      fellInLine: 3,
      ignored: 1,
    });
    expect(db.collectionMocks["billWhips"]!.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "bill",
        targetId: billId,
        audience: "npp",
        issuedBy: "nationalParty",
        partyId: "1",
        issuedByRole: "chair",
        attemptNumber: 1,
      })
    );
    expect(db.collectionMocks["characters"]!.updateOne).toHaveBeenCalledWith(
      { _id: chairId },
      { $inc: { "statXp.statecraft": expect.any(Number) } }
    );
  });

  it("numbers the second NPP attempt and rejects a third", async () => {
    db.collectionMocks["billWhips"]!.find.mockReturnValue(makeCursor([{ _id: new ObjectId() }]));
    const second = await run(request({ targetId: billId.toString() }));
    expect(second.ok && "attemptNumber" in second.body && second.body.attemptNumber).toBe(2);

    db.collectionMocks["billWhips"]!.insertOne.mockClear();
    db.collectionMocks["billWhips"]!.find.mockReturnValue(
      makeCursor([{ _id: new ObjectId() }, { _id: new ObjectId() }])
    );
    const third = await run(request({ targetId: billId.toString() }));
    expect(third).toEqual({
      ok: false,
      status: 400,
      error: "Maximum 2 whip attempts per bill/chamber reached",
    });
    expect(db.collectionMocks["billWhips"]!.insertOne).not.toHaveBeenCalled();
  });

  it("rejects an issuer who is not party or chamber leadership", async () => {
    const outsider = { _id: new ObjectId(), name: "Outsider" } as unknown as Character;
    const result = await run(request({ targetId: billId.toString() }), outsider);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/can issue whip directives$/);
    expect(db.collectionMocks["billWhips"]!.insertOne).not.toHaveBeenCalled();
  });

  it("rejects a chamber the country cannot whip", async () => {
    const result = await run(request({ chamber: "bundestag" }));
    expect(result).toEqual({ ok: false, status: 400, error: "Invalid chamber for this country" });
  });

  it("returns the NPP control lock message", async () => {
    const { getPartyNppControlStatus } = await import("@/lib/parties/antiAbuseGuards");
    vi.mocked(getPartyNppControlStatus).mockResolvedValueOnce({
      ok: false,
      error: "Locked for now",
    } as never);
    const result = await run(request({ targetId: billId.toString() }));
    expect(result).toEqual({ ok: false, status: 403, error: "Locked for now" });
  });

  it("404s a bill that is not open for voting", async () => {
    db.collectionMocks["bills"]!.findOne.mockResolvedValue(null);
    const result = await run(request({ targetId: billId.toString() }));
    expect(result).toEqual({ ok: false, status: 404, error: "Bill not found or voting not open" });
    expect(db.collectionMocks["billWhips"]!.insertOne).not.toHaveBeenCalled();
  });

  it("throws an ApiError for a malformed Supreme Court nomination id", async () => {
    await expect(
      run(request({ targetType: "scotusNomination", targetId: "not-an-id" }))
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("issues a soft player whip and notifies the eligible players", async () => {
    const eligibleId = new ObjectId();
    const userId = new ObjectId();
    const { getEligibleCharactersForWhip } = await import("@/lib/partyWhips/playerWhip");
    vi.mocked(getEligibleCharactersForWhip).mockResolvedValueOnce([eligibleId]);
    db.collectionMocks["characters"]!.find.mockReturnValue(
      makeCursor([{ _id: eligibleId, name: "Senator", userId, sequentialId: 7 }])
    );

    const result = await run(
      request({ targetId: billId.toString(), audience: "character", mode: "soft" })
    );

    expect(result).toEqual({
      ok: true,
      body: expect.objectContaining({
        audience: "character",
        mode: "soft",
        affected: 0,
        alreadyAligned: 0,
        mailedCount: 1,
        message: "Soft Player Whip issued. 1 players notified.",
      }),
    });
  });

  it("rejects a hard whip aimed at players", () => {
    expect(
      nationalPartyWhipSchema.safeParse({
        targetType: "bill",
        targetId: billId.toString(),
        chamber: "senate",
        direction: "for",
        mode: "hard",
        audience: "character",
      }).success
    ).toBe(false);
  });

  it("rejects a second player whip of the same mode", async () => {
    db.collectionMocks["billWhips"]!.find.mockImplementation((filter: { audience?: unknown }) =>
      makeCursor(filter.audience === "character" ? [{ _id: new ObjectId(), mode: "soft" }] : [])
    );
    const result = await run(
      request({ targetId: billId.toString(), audience: "character", mode: "soft" })
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "A Soft Player Whip has already been issued on this target",
    });
    expect(db.collectionMocks["billWhips"]!.insertOne).not.toHaveBeenCalled();
  });
});
