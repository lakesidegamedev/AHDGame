vi.mock("@/lib/db/sessionDb", async () =>
  (await import("@/lib/test-utils/atomicDomainMock")).atomicDomainMock()
);
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Db } from "mongodb";
import { createAsyncIterableCursor, createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { ensureStatePartyOrgRow } from "./ensureStatePartyOrgRow";

const party = { sequentialId: 2 } as never;

describe("ensureStatePartyOrgRow", () => {
  let db: MockDb;

  beforeEach(() => {
    db = createMockDb();
    db.collection("statePartyOrg");
    db.collectionMocks.statePartyOrg.updateOne.mockImplementation(async (_filter, update) =>
      update.$setOnInsert
        ? { matchedCount: 0, upsertedCount: 1 }
        : { matchedCount: 1, modifiedCount: 1 }
    );
  });

  it("returns the existing row without upserting when one is present", async () => {
    const existing = {
      _id: "BY_2",
      countryId: "DE",
      stateId: "BY",
      partyId: "2",
      organization: 17,
      politicalStrength: 5,
      hasPresence: true,
    };
    db.collectionMocks["statePartyOrg"]!.findOne.mockImplementation(
      async (filter: Record<string, unknown>) => {
        if (filter.partyId === "2") return existing;
        return null;
      }
    );

    const row = await ensureStatePartyOrgRow(db as unknown as Db, {
      countryId: "DE",
      stateId: "BY",
      party,
      hasPresence: true,
    });

    expect(row).toBe(existing);
    expect(db.collectionMocks["statePartyOrg"]!.updateOne).not.toHaveBeenCalled();
  });

  it("heals a legacy row found by _id that is missing countryId", async () => {
    // A row created by the old leadership upsert (no countryId) is invisible to
    // countryId-scoped queries; the helper must repair it so the PS spend can
    // find it instead of failing with missing-row.
    const malformed = {
      _id: "BY_2",
      stateId: "BY",
      partyId: "2",
      organization: 0,
      politicalStrength: 30,
      chairId: "abc",
      // countryId intentionally absent
    };
    db.collectionMocks["statePartyOrg"]!.findOne.mockImplementation(
      async (filter: Record<string, unknown>) => {
        if (filter.partyId === "2") return malformed;
        return filter._id === "BY_2" ? malformed : null;
      }
    );

    const row = await ensureStatePartyOrgRow(db as unknown as Db, {
      countryId: "DE",
      stateId: "BY",
      party,
      hasPresence: true,
    });

    expect(row.countryId).toBe("DE");
    // Existing data (chair, PS, org) preserved — only scope fields healed.
    expect(row.politicalStrength).toBe(30);
    expect(row.chairId).toBe("abc");
    expect(db.collectionMocks["statePartyOrg"]!.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "BY_2", countryId: { $exists: false } }),
      { $set: expect.objectContaining({ countryId: "DE" }) }
    );
  });

  it("re-keys a drifted _id back to the canonical key, preserving the row's org", async () => {
    // Ticket #1256: a party renumber (country merge) rewrote partyId but not
    // the compound _id. The helper must move the row back onto
    // `{stateId}_{partyId}` or the next Build Org poaches the wrong balance.
    const drifted = {
      _id: "NW_7",
      countryId: "DD",
      stateId: "NW",
      partyId: "1",
      organization: 36.76,
      politicalStrength: 12,
      treasury: 500,
    };
    db.collectionMocks["statePartyOrg"]!.findOne.mockImplementation(
      async (filter: Record<string, unknown>) => {
        if (filter.partyId === "1") return drifted;
        return null;
      }
    );

    const row = await ensureStatePartyOrgRow(db as unknown as Db, {
      countryId: "DD",
      stateId: "NW",
      party: { sequentialId: 1 } as never,
      hasPresence: true,
    });

    expect(row._id).toBe("NW_1");
    expect(row.organization).toBe(36.76);
    expect(row.treasury).toBe(500);
    // Re-key is delete-then-insert (_id is immutable in MongoDB).
    expect(db.collectionMocks["statePartyOrg"]!.deleteOne).toHaveBeenCalledWith({ _id: "NW_7" });
    expect(db.collectionMocks["statePartyOrg"]!.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "NW_1", organization: 36.76, partyId: "1" })
    );
  });

  it("preserves both chapters when another row occupies the canonical key", async () => {
    const drifted = {
      _id: "NW_7",
      countryId: "DD",
      stateId: "NW",
      partyId: "1",
      organization: 36.76,
      treasury: 500,
    };
    const occupied = { _id: "NW_1", countryId: "DD", stateId: "NW", partyId: "6", treasury: 700 };
    db.collectionMocks.statePartyOrg!.findOne.mockImplementation(
      async (filter: Record<string, unknown>) =>
        filter.partyId === "1" ? drifted : filter._id === "NW_1" ? occupied : null
    );
    const row = await ensureStatePartyOrgRow(db as unknown as Db, {
      countryId: "DD",
      stateId: "NW",
      party: { sequentialId: 1 } as never,
      hasPresence: true,
    });
    expect(row).toEqual(drifted);
    expect(db.collectionMocks.statePartyOrg!.deleteOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.statePartyOrg!.insertOne).not.toHaveBeenCalled();
  });

  it("bootstraps a 0% row via upsert when none exists", async () => {
    db.collectionMocks["statePartyOrg"]!.findOne.mockResolvedValue(null);

    const row = await ensureStatePartyOrgRow(db as unknown as Db, {
      countryId: "DE",
      stateId: "BY",
      party,
      hasPresence: true,
    });

    expect(row._id).toBe("BY_2");
    expect(row.partyId).toBe("2");
    expect(row.organization).toBe(0);
    expect(row.politicalStrength).toBe(0);
    expect(row.hasPresence).toBe(true);

    expect(db.collectionMocks["statePartyOrg"]!.updateOne).toHaveBeenCalledWith(
      { _id: "BY_2" },
      { $setOnInsert: expect.objectContaining({ _id: "BY_2", organization: 0 }) },
      { upsert: true }
    );
  });

  it("stamps hasPresence=false on the bootstrapped row when caller has no presence", async () => {
    db.collectionMocks["statePartyOrg"]!.findOne.mockResolvedValue(null);

    const row = await ensureStatePartyOrgRow(db as unknown as Db, {
      countryId: "DE",
      stateId: "BY",
      party,
      hasPresence: false,
    });

    expect(row.hasPresence).toBe(false);
  });

  it("creates a party organization row for DC despite its non-electoral status", async () => {
    db.collection("gameState");
    db.collection("states");
    db.collectionMocks["statePartyOrg"]!.findOne.mockResolvedValue(null);

    const row = await ensureStatePartyOrgRow(db as unknown as Db, {
      countryId: "US",
      stateId: "DC",
      party,
      hasPresence: true,
    });

    expect(row).toMatchObject({ _id: "DC_2", countryId: "US", stateId: "DC", partyId: "2" });
    expect(db.collectionMocks["statePartyOrg"]!.updateOne).toHaveBeenCalled();
  });

  it("still refuses to create a row for an unsupported US region", async () => {
    db.collectionMocks["statePartyOrg"]!.findOne.mockResolvedValue(null);

    await expect(
      ensureStatePartyOrgRow(db as unknown as Db, {
        countryId: "US",
        stateId: "PR",
        party,
        hasPresence: true,
      })
    ).rejects.toThrow(/PR|unsupported/i);
  });

  it("allows Alaska's territorial party organization under 1953-default", async () => {
    db.collection("gameState");
    db.collection("states");
    db.collectionMocks["gameState"]!.findOne.mockResolvedValue({
      _id: "current",
      preset: "1953-default",
      currentYear: 1953,
    });
    db.collectionMocks["statePartyOrg"]!.findOne.mockResolvedValue(null);

    const row = await ensureStatePartyOrgRow(db as unknown as Db, {
      countryId: "US",
      stateId: "AK",
      party,
      hasPresence: true,
    });

    expect(row._id).toBe("AK_2");
    expect(db.collectionMocks["statePartyOrg"]!.updateOne).toHaveBeenCalled();
  });

  it("allows Alaska once admittedYear is on the state doc", async () => {
    db.collection("gameState");
    db.collection("states");
    db.collectionMocks["gameState"]!.findOne.mockResolvedValue({
      _id: "current",
      preset: "1953-default",
      currentYear: 1959,
    });
    db.collectionMocks["states"]!.find.mockReturnValue(
      createAsyncIterableCursor([{ _id: "AK", admittedYear: 1959 }])
    );
    db.collectionMocks["statePartyOrg"]!.findOne.mockResolvedValue(null);

    const row = await ensureStatePartyOrgRow(db as unknown as Db, {
      countryId: "US",
      stateId: "AK",
      party,
      hasPresence: true,
    });

    expect(row._id).toBe("AK_2");
    expect(db.collectionMocks["statePartyOrg"]!.updateOne).toHaveBeenCalled();
  });

  it("still bootstraps a row for a real US electoral state (WY)", async () => {
    db.collectionMocks["statePartyOrg"]!.findOne.mockResolvedValue(null);

    const row = await ensureStatePartyOrgRow(db as unknown as Db, {
      countryId: "US",
      stateId: "WY",
      party,
      hasPresence: true,
    });

    expect(row._id).toBe("WY_2");
    expect(db.collectionMocks["statePartyOrg"]!.updateOne).toHaveBeenCalled();
  });
});
