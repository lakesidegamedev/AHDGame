import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { stateBillActions } from "./stateBills";
import { dueSoonContext, fakeDueSoonDb } from "./__tests__/fakeDb";

describe("stateBillActions", () => {
  it("lists unvoted floor and override votes for a state legislator", async () => {
    const characterId = new ObjectId();
    const floor = new ObjectId();
    const override = new ObjectId();
    const { db, filters } = fakeDueSoonDb({
      stateBills: [
        { _id: floor, stateId: "OH", title: "Parks", status: "active", votingEndsOnTurn: 102 },
        {
          _id: new ObjectId(),
          stateId: "OH",
          title: "Voted",
          status: "active",
          votingEndsOnTurn: 102,
          votes: { [characterId.toString()]: "against" },
        },
        {
          _id: override,
          stateId: "OH",
          title: "Tolls",
          status: "veto_override",
          overrideVotingEndsOnTurn: 105,
        },
        // Waiting on the governor, not on a legislator.
        {
          _id: new ObjectId(),
          stateId: "OH",
          title: "Fees",
          status: "passed",
          governorActionDeadline: new Date("2026-01-01T06:00:00Z"),
        },
      ],
    });
    const items = await stateBillActions(
      dueSoonContext(db, {
        characterId,
        seats: [{ officeType: "stateSenate", countryId: "US", state: "oh" }],
      })
    );
    expect(items.map((item) => [item.kind, item.subject, item.dueTurn])).toEqual([
      ["stateBillVote", "Parks", 102],
      ["stateOverrideVote", "Tolls", 105],
    ]);
    expect(items[0].href).toBe(`/country/us/region/oh/legislature/bills/${floor.toString()}`);
    expect(filters.stateBills?.[0]).toEqual({
      status: { $in: ["active", "veto_override"] },
      stateId: { $in: ["OH"] },
    });
  });

  it("asks the governor to sign bills still inside the dated action window", async () => {
    const { db } = fakeDueSoonDb({
      stateBills: [
        {
          _id: new ObjectId(),
          stateId: "OH",
          title: "Fees",
          status: "passed",
          governorActionDeadline: new Date("2026-01-01T06:00:00Z"),
        },
        {
          _id: new ObjectId(),
          stateId: "OH",
          title: "Late",
          status: "passed",
          governorActionDeadline: new Date("2025-12-31T23:00:00Z"),
        },
      ],
    });
    const items = await stateBillActions(
      dueSoonContext(db, { seats: [{ officeType: "governor", countryId: "US", state: "OH" }] })
    );
    expect(items.map((item) => [item.kind, item.subject, item.dueTurn, item.dueAt])).toEqual([
      ["stateBillSign", "Fees", null, "2026-01-01T06:00:00.000Z"],
    ]);
  });

  it("falls back to the voting date on bills that carry no turn", async () => {
    const { db } = fakeDueSoonDb({
      stateBills: [
        {
          _id: new ObjectId(),
          stateId: "OH",
          title: "Queued",
          status: "active",
          votingEndsAt: new Date("2026-01-01T03:00:00Z"),
        },
      ],
    });
    const items = await stateBillActions(
      dueSoonContext(db, { seats: [{ officeType: "stateSenate", countryId: "US", state: "OH" }] })
    );
    expect(items[0]).toMatchObject({ dueTurn: null, dueAt: "2026-01-01T03:00:00.000Z" });
  });

  it("skips the query without a regional seat", async () => {
    const { db, filters } = fakeDueSoonDb({});
    expect(
      await stateBillActions(
        dueSoonContext(db, { seats: [{ officeType: "house", countryId: "US" }] })
      )
    ).toEqual([]);
    expect(filters.stateBills).toBeUndefined();
  });
});
