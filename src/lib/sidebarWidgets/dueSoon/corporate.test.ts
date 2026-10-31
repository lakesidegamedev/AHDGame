import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { corporateVotes } from "./corporate";
import { dueSoonContext, fakeDueSoonDb } from "./__tests__/fakeDb";

describe("corporateVotes", () => {
  it("lists open votes in held companies the player has not voted on", async () => {
    const characterId = new ObjectId();
    const acme = new ObjectId();
    const owned = new ObjectId();
    const governance = new ObjectId();
    const privatize = new ObjectId();
    const { db, filters } = fakeDueSoonDb({
      corporations: [
        {
          _id: acme,
          name: "Acme",
          sequentialId: 7,
          ceoId: new ObjectId(),
          shareholders: [{ characterId, shares: 10 }],
        },
        // Run by the player: they cannot vote on its privatization.
        {
          _id: owned,
          name: "Mine",
          sequentialId: 8,
          ceoId: characterId,
          shareholders: [{ characterId, shares: 50 }],
        },
      ],
      corporationVotes: [
        { _id: governance, corporationId: acme, deadlineAtTurn: 103, votes: [] },
        {
          _id: new ObjectId(),
          corporationId: owned,
          deadlineAtTurn: 104,
          votes: [{ characterId }],
        },
        // Resolves on its deadline turn.
        { _id: new ObjectId(), corporationId: acme, deadlineAtTurn: 100, votes: [] },
      ],
      corporationPrivatizationVotes: [
        { _id: privatize, corporationId: acme, deadlineAtTurn: 100, votes: [] },
        { _id: new ObjectId(), corporationId: owned, deadlineAtTurn: 110, votes: [] },
      ],
    });
    const items = await corporateVotes(dueSoonContext(db, { characterId }));
    expect(items).toEqual([
      {
        kind: "corpVote",
        id: `corpVote:${governance.toString()}`,
        subject: "Acme",
        href: "/corporation/7",
        dueTurn: 103,
        dueAt: null,
      },
      {
        kind: "privatizationVote",
        id: `privatizationVote:${privatize.toString()}`,
        subject: "Acme",
        href: "/corporation/7",
        dueTurn: 101,
        dueAt: null,
      },
    ]);
    expect(filters.corporations?.[0]).toEqual({ "shareholders.characterId": characterId });
    expect(filters.corporationVotes?.[0]).toEqual({
      corporationId: { $in: [acme, owned] },
      status: "open",
    });
  });

  it("stops after the holdings read when the player holds no voting shares", async () => {
    const characterId = new ObjectId();
    const { db, filters } = fakeDueSoonDb({
      corporations: [
        { _id: new ObjectId(), name: "Sold", shareholders: [{ characterId, shares: 0 }] },
      ],
    });
    expect(await corporateVotes(dueSoonContext(db, { characterId }))).toEqual([]);
    expect(filters.corporationVotes).toBeUndefined();
  });
});
