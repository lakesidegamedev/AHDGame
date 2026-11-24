import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { loadRemovalCooldowns, removalTargetKey } from "./removalCooldownLookup";

function dbWith(rows: {
  nationalPartyElections?: unknown[];
  nationalCommitteeElections?: unknown[];
  committeeProposals?: unknown[];
}) {
  const filters: Record<string, unknown> = {};
  const collection = vi.fn().mockImplementation((name: keyof typeof rows) => ({
    find: vi.fn().mockImplementation((filter: unknown) => {
      filters[name] = filter;
      return { toArray: async () => rows[name] ?? [] };
    }),
  }));
  return { db: { collection } as unknown as Db, filters };
}

const partyOid = new ObjectId();
const party = { _id: partyOid, sequentialId: 1, countryId: "US" as const, createdTurn: undefined };

describe("loadRemovalCooldowns", () => {
  it("uses the latest leadership election the holder won for that seat", async () => {
    const chair = new ObjectId();
    const { db, filters } = dbWith({
      nationalPartyElections: [
        { position: "chair", winnerId: chair, endTurn: 122 },
        { position: "chair", winnerId: chair, endTurn: 170 },
        { position: "viceChair", winnerId: chair, endTurn: 179 },
      ],
    });
    const map = await loadRemovalCooldowns(db, party, [{ role: "chair", characterId: chair }], 180);
    expect(map.get(removalTargetKey("chair", chair))).toEqual({
      locked: true,
      reason: "recently_seated",
      sinceTurn: 170,
      unlocksAtTurn: 194,
    });
    expect(filters.nationalPartyElections).toMatchObject({
      partyId: "1",
      countryId: "US",
      status: "completed",
    });
  });

  it("uses committee election wins for committee members", async () => {
    const member = new ObjectId();
    const { db } = dbWith({
      nationalCommitteeElections: [{ winnerIds: [new ObjectId(), member], endTurn: 170 }],
    });
    const map = await loadRemovalCooldowns(
      db,
      party,
      [{ role: "committeeMember", characterId: member }],
      175
    );
    expect(map.get(removalTargetKey("committeeMember", member))?.unlocksAtTurn).toBe(194);
  });

  it("uses the committee vote that confirmed a campaigner", async () => {
    const campaigner = new ObjectId();
    const { db } = dbWith({
      committeeProposals: [
        {
          type: "campaignerAppointment",
          resolvedAtTurn: 178,
          campaignerAppointment: { targetCharacterId: campaigner },
        },
      ],
    });
    const map = await loadRemovalCooldowns(
      db,
      party,
      [{ role: "campaigner", characterId: campaigner }],
      180
    );
    expect(map.get(removalTargetKey("campaigner", campaigner))?.unlocksAtTurn).toBe(202);
  });

  it("locks after a failed or expired removal vote against the holder", async () => {
    const treasurer = new ObjectId();
    const { db, filters } = dbWith({
      nationalPartyElections: [{ position: "treasurer", winnerId: treasurer, endTurn: 50 }],
      committeeProposals: [
        {
          type: "removeOfficeHolder",
          resolvedAtTurn: 190,
          removeOfficeHolder: { role: "treasurer", targetCharacterId: treasurer },
        },
      ],
    });
    const map = await loadRemovalCooldowns(
      db,
      party,
      [{ role: "treasurer", characterId: treasurer }],
      200
    );
    expect(map.get(removalTargetKey("treasurer", treasurer))).toEqual({
      locked: true,
      reason: "recent_failed_removal",
      sinceTurn: 190,
      unlocksAtTurn: 214,
    });
    const proposalFilter = filters.committeeProposals as { $or: Array<Record<string, unknown>> };
    expect(proposalFilter.$or).toContainEqual(
      expect.objectContaining({
        type: "removeOfficeHolder",
        status: { $in: ["rejected", "expired"] },
      })
    );
  });

  it("treats a charter founder as seated in the chair at the founding turn", async () => {
    const founder = new ObjectId();
    const { db } = dbWith({});
    const map = await loadRemovalCooldowns(
      db,
      { ...party, createdTurn: 175 },
      [{ role: "chair", characterId: founder }],
      180
    );
    expect(map.get(removalTargetKey("chair", founder))?.unlocksAtTurn).toBe(199);
  });

  it("leaves a long-serving holder unlocked", async () => {
    const chair = new ObjectId();
    const { db } = dbWith({
      nationalPartyElections: [{ position: "chair", winnerId: chair, endTurn: 122 }],
    });
    const map = await loadRemovalCooldowns(db, party, [{ role: "chair", characterId: chair }], 181);
    expect(map.get(removalTargetKey("chair", chair))?.locked).toBe(false);
  });
});
