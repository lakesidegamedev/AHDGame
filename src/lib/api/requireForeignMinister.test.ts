/**
 * Tests for the NPP-aware behavior of requireForeignMinister: an NPP-held
 * foreign-minister seat (null characterId) is not owned by any player actor, so
 * it must be treated like a vacant seat and fall through to the head-of-gov
 * fallback — not 403 a head of government who is otherwise authorized.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { requireForeignMinister } from "./requireForeignMinister";
import { requireTradeMinister } from "./requireTradeMinister";
import { getDb } from "@/lib/mongodb";
import {
  FOREIGN_AFFAIRS_POSITION_BY_COUNTRY,
  TRADE_MINISTER_POSITION_BY_COUNTRY,
} from "@/lib/constants/internationalOrganizations";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
import { getHeadOfGovernmentCharacterId } from "@/lib/api/headOfGovernment";

vi.mock("@/lib/api/headOfGovernment", () => ({
  getHeadOfGovernmentCharacterId: vi.fn(),
}));

let db: MockDb;

beforeEach(() => {
  vi.clearAllMocks();
  db = createMockDb();
  db.collection("cabinetMembers");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
});

describe.each([
  ["foreign", requireForeignMinister, FOREIGN_AFFAIRS_POSITION_BY_COUNTRY],
  ["trade", requireTradeMinister, TRADE_MINISTER_POSITION_BY_COUNTRY],
] as const)("%s minister authorization", (ministry, requireMinister, positions) => {
  it("falls through to the head-of-gov fallback when the FM seat is NPP-held", async () => {
    const hogCharId = new ObjectId();
    // FM seat exists but is held by an NPP (null characterId).
    db.collectionMocks["cabinetMembers"]!.findOne.mockResolvedValue({
      countryId: "US",
      positionId: positions.US,
      characterId: null,
      isNPP: true,
      nppId: new ObjectId(),
      characterName: "NPP Diplomat",
    });
    vi.mocked(getHeadOfGovernmentCharacterId).mockResolvedValue(hogCharId);

    const result = await requireMinister("US", hogCharId, "President Pat", db as unknown as Db);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.auth.positionId).toBe("head_of_government");
    }
  });

  it("authorizes the character holder of an FM seat", async () => {
    const fmCharId = new ObjectId();
    db.collectionMocks["cabinetMembers"]!.findOne.mockResolvedValue({
      countryId: "US",
      positionId: positions.US,
      characterId: fmCharId,
      characterName: "Secretary Sam",
    });

    const result = await requireMinister("US", fmCharId, "Secretary Sam", db as unknown as Db);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.auth.positionId).toBe(positions.US);
    }
    expect(getHeadOfGovernmentCharacterId).not.toHaveBeenCalled();
  });

  it("forbids a non-FM actor when another player holds the FM seat", async () => {
    // The seat is filled by someone other than the actor — even the head of
    // government must not act while a foreign minister is seated.
    const seatedFmId = new ObjectId();
    const someoneElse = new ObjectId();
    db.collectionMocks["cabinetMembers"]!.findOne.mockResolvedValue({
      countryId: "CN",
      positionId: positions.CN,
      characterId: seatedFmId,
      characterName: "Seated Minister",
    });

    const result = await requireMinister("CN", someoneElse, "Some Premier", db as unknown as Db);

    expect(result.ok).toBe(false);
    expect(getHeadOfGovernmentCharacterId).not.toHaveBeenCalled();
  });

  it("denies an empty ministry with no head of government using the existing envelope", async () => {
    const actor = new ObjectId();
    db.collectionMocks["cabinetMembers"]!.findOne.mockResolvedValue(null);
    vi.mocked(getHeadOfGovernmentCharacterId).mockResolvedValue(null);
    const result = await requireMinister("US", actor, "Actor", db as unknown as Db);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toMatchObject({
        error:
          "Only the US " + ministry + " minister or head of government may perform this action.",
        ref: expect.any(String),
      });
    }
  });
});

it("allows trade admins without reading holders, after obtaining the database", async () => {
  const actor = new ObjectId();
  expect(await requireTradeMinister("US", actor, "Admin", undefined, true)).toEqual({
    ok: true,
    auth: { countryId: "US", positionId: "admin", characterId: actor, characterName: "Admin" },
  });
  expect(getDb).toHaveBeenCalledOnce();
  expect(db.collectionMocks["cabinetMembers"]!.findOne).not.toHaveBeenCalled();
  expect(getHeadOfGovernmentCharacterId).not.toHaveBeenCalled();
});

it("preserves database acquisition failures even for trade admins", async () => {
  const error = new Error("Database unavailable");
  vi.mocked(getDb).mockRejectedValue(error);
  let rejection: unknown;
  try {
    await requireTradeMinister("US", new ObjectId(), "Admin", undefined, true);
  } catch (caught) {
    rejection = caught;
  }
  expect(rejection).toBe(error);
});
