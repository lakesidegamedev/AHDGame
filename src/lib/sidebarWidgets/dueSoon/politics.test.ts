import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { confirmationVotes, partyBallots } from "./politics";
import { dueSoonContext, fakeDueSoonDb } from "./__tests__/fakeDb";

const veteran = {
  party: "4",
  homeState: "oh",
  partyJoinedTurn: 10,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  userCreatedAt: new Date("2025-01-01T00:00:00Z"),
};

describe("partyBallots", () => {
  it("lists national and state ballots the member has not cast", async () => {
    const characterId = new ObjectId();
    const chair = new ObjectId();
    const treasurer = new ObjectId();
    const stateChair = new ObjectId();
    const { db, filters } = fakeDueSoonDb({
      politicalParties: [{ _id: new ObjectId(), name: "Union Party", sequentialId: 4 }],
      nationalPartyElections: [
        { _id: chair, position: "chair", endTurn: 105 },
        { _id: treasurer, position: "treasurer", endTurn: 105 },
        { _id: new ObjectId(), position: "viceChair", endTurn: 100 },
      ],
      statePartyElections: [{ _id: stateChair, position: "chair", endTurn: 102, stateId: "OH" }],
      nationalPartyVotes: [{ electionId: treasurer }],
      statePartyVotes: [],
    });
    const items = await partyBallots(dueSoonContext(db, { characterId, member: veteran }));
    expect(items).toEqual([
      {
        kind: "partyElection",
        id: `partyElection:${chair.toString()}`,
        subject: "Union Party",
        position: "chair",
        href: "/country/us/parties/4",
        dueTurn: 105,
        dueAt: null,
      },
      {
        kind: "partyElection",
        id: `statePartyElection:${stateChair.toString()}`,
        subject: "Union Party · OH",
        position: "chair",
        href: "/country/us/region/oh/party/4",
        dueTurn: 102,
        dueAt: null,
      },
    ]);
    expect(filters.statePartyElections?.[0]).toEqual({
      countryId: "US",
      stateId: "OH",
      partyId: "4",
      status: "voting",
    });
    expect(filters.nationalPartyVotes?.[0]).toEqual({
      electionId: { $in: [chair, treasurer] },
      voterId: characterId,
    });
  });

  it("holds back ballots from new members unless the election is a founding one", async () => {
    const founding = new ObjectId();
    const { db } = fakeDueSoonDb({
      politicalParties: [{ _id: new ObjectId(), name: "Union Party", sequentialId: 4 }],
      nationalPartyElections: [
        { _id: new ObjectId(), position: "chair", endTurn: 105 },
        { _id: founding, position: "viceChair", endTurn: 105, founding: true },
      ],
    });
    const items = await partyBallots(
      dueSoonContext(db, { member: { ...veteran, homeState: undefined, partyJoinedTurn: 95 } })
    );
    expect(items.map((item) => item.id)).toEqual([`partyElection:${founding.toString()}`]);
  });

  it("skips committee-elected parties and players without a party", async () => {
    const { db } = fakeDueSoonDb({
      politicalParties: [
        {
          _id: new ObjectId(),
          name: "Board",
          sequentialId: 4,
          leadershipElectionMethod: "committee",
        },
      ],
      nationalPartyElections: [{ _id: new ObjectId(), position: "chair", endTurn: 105 }],
    });
    expect(await partyBallots(dueSoonContext(db, { member: veteran }))).toEqual([]);
    expect(await partyBallots(dueSoonContext(db, { member: {} }))).toEqual([]);
  });
});

describe("confirmationVotes", () => {
  it("gives senators cabinet and court nominations they have not voted on", async () => {
    const characterId = new ObjectId();
    const cabinet = new ObjectId();
    const court = new ObjectId();
    const { db } = fakeDueSoonDb({
      cabinetNominations: [
        {
          _id: cabinet,
          positionId: "treasury",
          nomineeCharacterName: "A. Smith",
          votingEndsOnTurn: 104,
        },
        {
          _id: new ObjectId(),
          positionId: "defense",
          nomineeCharacterName: "Voted",
          votingEndsOnTurn: 104,
          votes: { [characterId.toString()]: "for" },
        },
      ],
      scotusNominations: [{ _id: court, nomineeName: "J. Doe", votingEndsOnTurn: 103 }],
    });
    const items = await confirmationVotes(
      dueSoonContext(db, { characterId, seats: [{ officeType: "senate", countryId: "US" }] })
    );
    expect(items.map((item) => [item.subject, item.href, item.dueTurn])).toEqual([
      ["A. Smith", `/congress/nominations/${cabinet.toString()}`, 104],
      ["J. Doe", `/congress/scotus-nominations/${court.toString()}`, 103],
    ]);
  });

  it("asks House members only about a vice presidential nomination", async () => {
    const { db, filters } = fakeDueSoonDb({
      cabinetNominations: [
        {
          _id: new ObjectId(),
          positionId: "vicePresident",
          nomineeCharacterName: "V. P.",
          votingEndsOnTurn: 104,
        },
      ],
    });
    const items = await confirmationVotes(
      dueSoonContext(db, { seats: [{ officeType: "house", countryId: "US" }] })
    );
    expect(items.map((item) => item.subject)).toEqual(["V. P."]);
    expect(filters.cabinetNominations?.[0]).toEqual({
      countryId: "US",
      status: "active",
      positionId: "vicePresident",
    });
    expect(filters.scotusNominations).toBeUndefined();
  });
});
