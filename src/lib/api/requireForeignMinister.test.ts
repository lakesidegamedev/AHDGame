/**
 * Tests for requireForeignMinister and requireTradeMinister: only the seated
 * character holder of the mapped ministry seat may act. A vacant or NPP-held
 * seat (null characterId) authorizes nobody, including the head of government.
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
  it("denies the actor when the seat is NPP-held", async () => {
    // A seat held by an NPP carries a null characterId, so it belongs to no
    // player and authorizes nobody — not even the head of government.
    db.collectionMocks["cabinetMembers"]!.findOne.mockResolvedValue({
      countryId: "US",
      positionId: positions.US,
      characterId: null,
      isNPP: true,
      nppId: new ObjectId(),
      characterName: "NPP Diplomat",
    });

    const actor = new ObjectId();
    const result = await requireMinister("US", actor, "President Pat", db as unknown as Db);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toMatchObject({
        error: `Only the US ${ministry} minister may perform this action.`,
        ref: expect.any(String),
      });
    }
  });

  it("authorizes the character holder of a seat", async () => {
    const holderId = new ObjectId();
    db.collectionMocks["cabinetMembers"]!.findOne.mockResolvedValue({
      countryId: "US",
      positionId: positions.US,
      characterId: holderId,
      characterName: "Secretary Sam",
    });

    const result = await requireMinister("US", holderId, "Secretary Sam", db as unknown as Db);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.auth.positionId).toBe(positions.US);
    }
  });

  it("forbids a non-minister when another player holds the seat", async () => {
    // The seat is filled by someone other than the actor — even the head of
    // government must not act while a minister is seated.
    const seatedMinisterId = new ObjectId();
    const someoneElse = new ObjectId();
    db.collectionMocks["cabinetMembers"]!.findOne.mockResolvedValue({
      countryId: "CN",
      positionId: positions.CN,
      characterId: seatedMinisterId,
      characterName: "Seated Minister",
    });

    const result = await requireMinister("CN", someoneElse, "Some Premier", db as unknown as Db);

    expect(result.ok).toBe(false);
  });

  it("denies an empty ministry using the existing envelope", async () => {
    const actor = new ObjectId();
    db.collectionMocks["cabinetMembers"]!.findOne.mockResolvedValue(null);
    const result = await requireMinister("US", actor, "Actor", db as unknown as Db);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toMatchObject({
        error: `Only the US ${ministry} minister may perform this action.`,
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
