import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { billVoteSlot, nationalBillVotes, presidentialBillActions } from "./nationalBills";
import { dueSoonContext, fakeDueSoonDb } from "./__tests__/fakeDb";

const chambers = {
  lowerKey: "house",
  lowerOfficeType: "house",
  chamberOfficeTypes: ["house", "senate"],
};
const identity = (key: string) => key;
const deadlines = {
  votingEndsOnTurn: 10,
  otherChamberVotingEndsOnTurn: 20,
  overrideVotingEndsOnTurn: 30,
};

describe("billVoteSlot", () => {
  it("follows the chamber the bill is in for sequential votes", () => {
    const bill = { ...deadlines, status: "active" as const, currentChamber: "senate" };
    expect(billVoteSlot(bill, chambers, identity, ["house"])).toBeNull();
    expect(billVoteSlot(bill, chambers, identity, ["senate"])).toEqual({
      field: "votes",
      dueTurn: 10,
    });
    expect(
      billVoteSlot({ ...bill, status: "active_other" }, chambers, identity, ["senate"])
    ).toEqual({ field: "otherChamberVotes", dueTurn: 20 });
  });

  it("lets each chamber vote on its own clock when both vote at once", () => {
    const bill = { ...deadlines, status: "active_both" as const, currentChamber: "house" };
    expect(billVoteSlot(bill, chambers, identity, ["house"])?.dueTurn).toBe(10);
    expect(billVoteSlot(bill, chambers, identity, ["senate"])).toEqual({
      field: "otherChamberVotes",
      dueTurn: 20,
    });
  });

  it("opens veto overrides to either chamber and nothing to non-members", () => {
    const bill = { ...deadlines, status: "veto_override" as const, currentChamber: "house" };
    expect(billVoteSlot(bill, chambers, identity, ["senate"])?.field).toBe("vetoOverrideVotes");
    expect(billVoteSlot(bill, chambers, identity, ["governor"])).toBeNull();
  });
});

describe("nationalBillVotes", () => {
  it("lists open bills in the player's chamber that they have not voted on", async () => {
    const characterId = new ObjectId();
    const open = new ObjectId();
    const voted = new ObjectId();
    const closed = new ObjectId();
    const otherChamber = new ObjectId();
    const { db, filters } = fakeDueSoonDb({
      bills: [
        {
          _id: open,
          title: "Roads Act",
          status: "active",
          currentChamber: "house",
          votingEndsOnTurn: 103,
        },
        {
          _id: voted,
          title: "Voted Act",
          status: "active",
          currentChamber: "house",
          votingEndsOnTurn: 103,
          votes: { [characterId.toString()]: "for" },
        },
        {
          _id: closed,
          title: "Late Act",
          status: "active",
          currentChamber: "house",
          votingEndsOnTurn: 100,
        },
        {
          _id: otherChamber,
          title: "Senate Act",
          status: "active",
          currentChamber: "senate",
          votingEndsOnTurn: 103,
        },
      ],
    });
    const items = await nationalBillVotes(
      dueSoonContext(db, { characterId, seats: [{ officeType: "house", countryId: "US" }] })
    );
    expect(items).toEqual([
      {
        kind: "billVote",
        id: `bill:${open.toString()}`,
        subject: "Roads Act",
        href: `/congress/bills/${open.toString()}`,
        dueTurn: 103,
        dueAt: null,
      },
    ]);
    expect(filters.bills?.[0]).toMatchObject({ countryId: "US" });
  });

  it("does not query bills for a player without a legislative seat", async () => {
    const { db, filters } = fakeDueSoonDb({});
    const items = await nationalBillVotes(
      dueSoonContext(db, { seats: [{ officeType: "governor", countryId: "US", state: "OH" }] })
    );
    expect(items).toEqual([]);
    expect(filters.bills).toBeUndefined();
  });
});

describe("presidentialBillActions", () => {
  it("lists enrolled bills for a sitting president until the action window closes", async () => {
    const desk = new ObjectId();
    const { db, filters } = fakeDueSoonDb({
      bills: [
        { _id: desk, title: "Budget", presidentActionDeadlineOnTurn: 102 },
        { _id: new ObjectId(), title: "Expired", presidentActionDeadlineOnTurn: 100 },
      ],
    });
    const items = await presidentialBillActions(
      dueSoonContext(db, { seats: [{ officeType: "president", countryId: "US" }] })
    );
    expect(items).toEqual([
      {
        kind: "billSign",
        id: `bill:${desk.toString()}`,
        subject: "Budget",
        href: `/congress/bills/${desk.toString()}`,
        dueTurn: 102,
        dueAt: null,
      },
    ]);
    expect(filters.bills?.[0]).toEqual({
      countryId: { $in: ["US"] },
      status: "enrolled",
      currentChamber: { $ne: "lords" },
    });
  });

  it("asks nothing of players who are not president", async () => {
    const { db, filters } = fakeDueSoonDb({});
    expect(
      await presidentialBillActions(
        dueSoonContext(db, { seats: [{ officeType: "senate", countryId: "US" }] })
      )
    ).toEqual([]);
    expect(filters.bills).toBeUndefined();
  });
});
