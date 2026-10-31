import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { loadChamberFloor } from "./chamberFloor";
import { loadMyRace } from "./myRace";
import { loadOfficeDashboard } from "./officeDashboard";
import { loadSinceAway } from "./sinceAway";

type Handlers = Record<string, Record<string, unknown>>;

/** A cursor that ignores sort/limit/project and resolves to `rows`. */
function cursor(rows: unknown[]) {
  const chain = {
    sort: () => chain,
    limit: () => chain,
    project: () => chain,
    toArray: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

const userId = new ObjectId();
const characterId = new ObjectId();

function fakeDb(collections: Handlers, character: Record<string, unknown> | null = {}): Db {
  const base: Handlers = {
    users: {
      findOne: vi.fn().mockResolvedValue({
        _id: userId,
        activeCharacterId: characterId,
        activeCharacterType: "character",
      }),
    },
    characters: {
      findOne: vi
        .fn()
        .mockResolvedValue(
          character ? { _id: characterId, countryId: "US", homeState: "CA", ...character } : null
        ),
    },
    gameState: {
      findOne: vi.fn().mockResolvedValue({ _id: "current", currentTurn: 100, preset: "default" }),
    },
  };
  return {
    collection: (name: string) => ({ ...base[name], ...collections[name] }),
  } as unknown as Db;
}

// A fresh object per call: loaders memoise reads on the viewer object.
const viewer = () => ({ userId: userId.toString() });

describe("myRace widget data", () => {
  it("is null for a player who is not standing", async () => {
    const db = fakeDb({ electionCandidates: { findOne: vi.fn().mockResolvedValue(null) } });
    expect(await loadMyRace(db, viewer())).toBeNull();
  });

  it("reports the viewer's share, place, the leader and links", async () => {
    const electionId = new ObjectId();
    const mine = new ObjectId();
    const rival = new ObjectId();
    const campaignId = new ObjectId();
    const candidates = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce({ _id: mine, electionId })
        .mockResolvedValueOnce({ _id: rival, characterName: "Rival" }),
    };
    const db = fakeDb({
      electionCandidates: candidates,
      elections: {
        findOne: vi.fn().mockResolvedValue({
          _id: electionId,
          electionType: "senate",
          countryId: "US",
          state: "CA",
          status: "active",
          endTurn: 104,
        }),
      },
      electionVoteTallies: {
        findOne: vi.fn().mockResolvedValue({
          totalVotes: { [mine.toString()]: 40, [rival.toString()]: 60 },
        }),
      },
      campaigns: { findOne: vi.fn().mockResolvedValue({ _id: campaignId }) },
    });
    const race = await loadMyRace(db, viewer());
    expect(race).toMatchObject({
      electionId: electionId.toString(),
      region: "CA",
      status: "active",
      turnsLeft: 4,
      myPct: 40,
      myRank: 2,
      candidates: 2,
      leader: { name: "Rival", pct: 60, isMe: false },
      campaignId: campaignId.toString(),
    });
    expect(race?.office).toBeTruthy();
  });

  it("drops a race whose election has closed", async () => {
    const db = fakeDb({
      electionCandidates: {
        findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(), electionId: new ObjectId() }),
      },
      elections: { findOne: vi.fn().mockResolvedValue(null) },
      electionVoteTallies: { findOne: vi.fn().mockResolvedValue(null) },
      campaigns: { findOne: vi.fn().mockResolvedValue(null) },
    });
    expect(await loadMyRace(db, viewer())).toBeNull();
  });
});

describe("chamberFloor widget data", () => {
  it("is null without a national seat", async () => {
    const db = fakeDb({ electedOfficials: { findOne: vi.fn().mockResolvedValue(null) } });
    expect(await loadChamberFloor(db, viewer())).toBeNull();
  });

  it("lists bills on the viewer's floor with their vote, unvoted first", async () => {
    const key = characterId.toString();
    const voted = new ObjectId();
    const waiting = new ObjectId();
    const elsewhere = new ObjectId();
    const find = vi.fn().mockReturnValue(
      cursor([
        {
          _id: voted,
          title: "Roads Act",
          status: "active",
          currentChamber: "house",
          votingEndsOnTurn: 101,
          votes: { [key]: "for" },
        },
        {
          _id: elsewhere,
          title: "Senate Bill",
          status: "active",
          currentChamber: "senate",
          votingEndsOnTurn: 101,
          votes: {},
        },
        {
          _id: waiting,
          title: "Schools Act",
          status: "active_other",
          currentChamber: "house",
          otherChamberVotingEndsOnTurn: 103,
          otherChamberVotes: {},
        },
      ])
    );
    const db = fakeDb({
      electedOfficials: { findOne: vi.fn().mockResolvedValue({ officeType: "house" }) },
      bills: { find },
    });
    const floor = await loadChamberFloor(db, viewer());
    expect(floor).toMatchObject({
      countryId: "US",
      chamber: "House",
      total: 2,
      bills: [
        { id: waiting.toString(), title: "Schools Act", vote: null, turnsLeft: 3 },
        { id: voted.toString(), title: "Roads Act", vote: "for", turnsLeft: 1 },
      ],
    });
    // Only the viewer's own vote is read off each bill.
    const projection = find.mock.calls[0][1].projection;
    expect(projection).toMatchObject({ [`votes.${key}`]: 1, [`otherChamberVotes.${key}`]: 1 });
    expect(projection).not.toHaveProperty("votes");
  });
});

describe("officeDashboard widget data", () => {
  it("is null for a player without an office", async () => {
    const db = fakeDb({
      electedOfficials: { findOne: vi.fn().mockResolvedValue(null) },
      cabinetMembers: { findOne: vi.fn().mockResolvedValue(null) },
    });
    expect(await loadOfficeDashboard(db, viewer())).toBeNull();
  });

  it("shows a governor their state's approval, balance and economy", async () => {
    const db = fakeDb({
      electedOfficials: { findOne: vi.fn().mockResolvedValue({ state: "CA" }) },
      cabinetMembers: { findOne: vi.fn().mockResolvedValue(null) },
      states: { findOne: vi.fn().mockResolvedValue({ _id: "CA", name: "California" }) },
      stateApprovalHistory: { findOne: vi.fn().mockResolvedValue({ approvalRating: 54 }) },
      macroMetrics: {
        findOne: vi.fn().mockResolvedValue({
          economic: { gdpGrowth: { value: 2.1 }, unemploymentRate: { value: 4.5 } },
        }),
      },
      stateBudgets: {
        findOne: vi.fn().mockResolvedValue({
          revenue: { total: 900 },
          spending: { total: 1000, byCategory: {} },
        }),
      },
    });
    expect(await loadOfficeDashboard(db, viewer())).toMatchObject({
      scope: "state",
      countryId: "US",
      stateId: "CA",
      name: "California",
      approval: 54,
      gdpGrowth: 2.1,
      unemployment: 4.5,
      currencyCode: "USD",
    });
  });

  it("shows a head of government their nation, with weighted unemployment", async () => {
    const db = fakeDb(
      {
        electedOfficials: { findOne: vi.fn().mockResolvedValue(null) },
        cabinetMembers: { findOne: vi.fn().mockResolvedValue(null) },
        governmentApprovals: { findOne: vi.fn().mockResolvedValue({ approvalRating: 47 }) },
        federalBudget: {
          findOne: vi.fn().mockResolvedValue({
            countryId: "US",
            revenue: { total: 100 },
            spending: { total: 130 },
            economicFactors: { gdpGrowth: 1.5 },
          }),
        },
        states: {
          find: vi.fn().mockReturnValue(
            cursor([
              { _id: "CA", population: 3 },
              { _id: "WY", population: 1 },
            ])
          ),
        },
        macroMetrics: {
          find: vi.fn().mockReturnValue(
            cursor([
              { _id: "CA", economic: { unemploymentRate: { value: 4 } } },
              { _id: "WY", economic: { unemploymentRate: { value: 8 } } },
            ])
          ),
        },
      },
      { currentOffice: { type: "president" } }
    );
    expect(await loadOfficeDashboard(db, viewer())).toMatchObject({
      scope: "nation",
      stateId: null,
      approval: 47,
      budgetBalance: -30,
      gdpGrowth: 1.5,
      unemployment: 5,
    });
  });
});

describe("sinceAway widget data", () => {
  it("compares the two newest snapshots and groups unread notifications", async () => {
    const aggregate = vi.fn().mockReturnValue(
      cursor([
        { _id: "bill_vote_open", count: 2 },
        { _id: "bill_signed", count: 1 },
        { _id: "crisis", count: 4 },
      ])
    );
    const db = fakeDb({
      portfolioHistory: {
        find: vi.fn().mockReturnValue(
          cursor([
            {
              turn: 100,
              netValue: 110,
              cashValue: 50,
              stockValue: 60,
              exchangeRatesSnapshot: { USD: 2 },
            },
            { turn: 99, netValue: 100, cashValue: 55, stockValue: 45 },
          ])
        ),
      },
      notifications: { aggregate },
    });
    const away = await loadSinceAway(db, viewer());
    expect(away).toMatchObject({
      turn: 100,
      netWorthChange: 20,
      netWorthChangePct: 10,
      cashChange: -10,
      currencyCode: "USD",
      holdings: [{ kind: "stocks", change: expect.closeTo(33.33, 1) }],
      unread: [
        { category: "crisis", count: 4 },
        { category: "legislation", count: 3 },
      ],
      unreadTotal: 7,
      unreadCapped: false,
    });
    expect(aggregate.mock.calls[0][0][0].$match).toMatchObject({ userId, read: false });
  });

  it("still counts notifications before a second snapshot exists", async () => {
    const db = fakeDb({
      portfolioHistory: { find: vi.fn().mockReturnValue(cursor([{ turn: 1, netValue: 5 }])) },
      notifications: { aggregate: vi.fn().mockReturnValue(cursor([])) },
    });
    expect(await loadSinceAway(db, viewer())).toMatchObject({
      netWorthChangePct: null,
      netWorthChange: null,
      holdings: [],
      unreadTotal: 0,
    });
  });
});
