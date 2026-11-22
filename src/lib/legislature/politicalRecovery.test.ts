import { beforeEach, describe, expect, it, vi } from "vitest";
import { BSON, ObjectId, type Db, type Document } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";

const mocks = vi.hoisted(() => ({ run: vi.fn(), getDb: vi.fn(), failLayer: false }));
vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: mocks.run,
  RequiredTransactionCleanupError: class extends Error {},
}));
vi.mock("@/lib/mongodb", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async () => {}),
  createNotifications: vi.fn(async () => {}),
}));
vi.mock("@/lib/achievements", () => ({
  awardAchievement: vi.fn(),
  resolveUserIdFromCharacter: vi.fn(),
}));
vi.mock("@/lib/news", () => ({
  generateBillSignedNews: vi.fn(async () => {}),
  generateBillVetoedNews: vi.fn(async () => {}),
}));
vi.mock("@/lib/governorOffice/access", () => ({ canManageOffice: vi.fn(async () => true) }));
vi.mock("@/lib/analytics/billStatusAnalytics", () => ({
  captureBillStatusChanged: vi.fn(async () => {}),
}));
vi.mock("@/lib/legislationEffects", () => ({
  applyLegislationEffect: async (db: Db) => {
    await db
      .collection<{
        _id: string;
        cash?: number;
        inventory?: number;
        construction?: number;
        refunds?: number;
      }>("economicState")
      .updateOne({ _id: "account" }, { $inc: { cash: -10, inventory: 2, construction: 1 } });
    return new Map();
  },
}));
vi.mock("@/lib/billEnactment", () => ({
  onBillEnacted: async (db: Db) => {
    await db
      .collection<{
        _id: string;
        cash?: number;
        inventory?: number;
        construction?: number;
        refunds?: number;
      }>("economicState")
      .updateOne({ _id: "account" }, { $inc: { refunds: 3 } });
    if (mocks.failLayer) {
      mocks.failLayer = false;
      throw new Error("interrupted enactment");
    }
  },
}));

vi.mock("@/lib/countries/runtimeOffices", () => ({
  loadRuntimeCountryOffices: async () => ({
    lowerOfficeType: "caCommons",
    headOfGovernmentOfficeKey: "primeMinister",
    config: {
      executiveTitle: "Prime Minister",
      legislature: { lowerChamber: { key: "caCommons", name: "Commons" } },
    },
  }),
}));
vi.mock("@/lib/countryState", () => ({
  getCountryState: async () => ({
    governmentType: "parliamentaryMonarchy",
    hasLeaderConfidenceModel: false,
  }),
}));
vi.mock("@/lib/analytics/officeTransitionAnalytics", () => ({
  captureOfficeTransition: vi.fn(async () => {}),
}));
vi.mock("@/lib/congress/governmentVoteBreakdown", () => ({
  computeParliamentaryGovernmentTally: async () => ({ votesFor: 2, votesAgainst: 0 }),
}));
vi.mock("@/lib/discordWebhooks", () => ({
  sendCountryGameEvent: vi.fn(async () => {}),
  DISCORD_COLORS: {},
}));
import { runBillLifecycle } from "@/lib/turn/billLifecycle/engine";
import type { BillLifecycleConfig } from "@/lib/turn/billLifecycle/types";
import { resolveParliamentaryAppointmentVote } from "@/lib/turn/parliamentaryGovernment";

import { processCompletedNationalElections } from "@/lib/elections/party/nationalPartyElections";
import { processCompletedElections } from "@/lib/elections/party/statePartyElections";
import { processCompletedCommitteeElections } from "@/lib/elections/party/nationalCommitteeElections";
import { createNotification, createNotifications } from "@/lib/notifications";
import { takeStateBillGovernorAction } from "./commands/stateBillActions";

type World = Record<string, Document[]>;
let world: World;
let db: Db;
let failWrite: string | undefined;
const now = new Date("2026-11-22T12:00:00Z");
const holder = new ObjectId();
const winner = new ObjectId();
const electionId = new ObjectId();

function equal(a: unknown, b: unknown): boolean {
  return a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a === b;
}
function matches(doc: Document, filter: Document): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((part: Document) => matches(doc, part));
    if (key === "$and") return value.every((part: Document) => matches(doc, part));
    const actual = key.split(".").reduce((v, k) => v?.[k], doc);
    if (
      value &&
      typeof value === "object" &&
      !(value instanceof ObjectId) &&
      !(value instanceof Date)
    ) {
      return Object.entries(value).every(([operator, operand]) => {
        if (operator === "$in") return (operand as unknown[]).some((v) => equal(actual, v));
        if (operator === "$nin") return !(operand as unknown[]).some((v) => equal(actual, v));
        if (operator === "$lte") return Number(actual) <= Number(operand);
        if (operator === "$exists") return (actual !== undefined) === operand;
        if (operator === "$ne") return !equal(actual, operand);
        return false;
      });
    }
    return equal(actual, value);
  });
}
function update(doc: Document, change: Document) {
  Object.assign(doc, change.$set ?? {});
  for (const [key, value] of Object.entries(change.$push ?? {}))
    doc[key] = [...(doc[key] ?? []), value];
  for (const [key, amount] of Object.entries(change.$inc ?? {}))
    doc[key] = (doc[key] ?? 0) + (amount as number);
}
function cursor(rows: Document[]) {
  return {
    toArray: async () => rows,
    project() {
      return this;
    },
    sort() {
      return this;
    },
    limit() {
      return this;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  world = {
    economicState: [{ _id: "account", cash: 100, inventory: 5, construction: 2, refunds: 0 }],
  };
  failWrite = undefined;
  mocks.failLayer = false;
  const mock = createMockDb();
  const collection = mock.collection;
  const names = [
    "bills",
    "economicState",
    "stateBills",
    "gameState",
    "politicalParties",
    "statePartyOrg",
    "nationalPartyElections",
    "nationalPartyCandidates",
    "nationalPartyVotes",
    "statePartyElections",
    "statePartyCandidates",
    "statePartyVotes",
    "nationalCommitteeElections",
    "nationalCommitteeCandidates",
    "nationalCommitteeVotes",
    "characters",
    "users",
    "coalitions",
    "pmAppointmentVotes",
    "governmentFormations",
    "electedOfficials",
    "billWhips",
  ];
  for (const name of names) {
    const coll = collection(name);
    coll.find.mockImplementation((query: Document) =>
      cursor((world[name] ?? []).filter((row) => matches(row, query)))
    );
    coll.findOne.mockImplementation(
      async (query: Document) => (world[name] ?? []).find((row) => matches(row, query)) ?? null
    );
    coll.findOneAndUpdate.mockImplementation(
      async (filter: Document, change: Document, options: { session?: unknown }) => {
        expect(options.session).toBeDefined();
        const doc = (world[name] ?? []).find((row) => matches(row, filter));
        const previous = doc ? BSON.deserialize(BSON.serialize(doc)) : null;
        if (doc) update(doc, change);
        return previous;
      }
    );
    coll.aggregate.mockImplementation(() => cursor(world[name] ?? []));
    coll.updateOne.mockImplementation(
      async (filter: Document, change: Document, options: { session?: unknown }) => {
        expect(options.session).toBeDefined();
        const doc = (world[name] ?? []).find((row) => matches(row, filter));
        if (doc) update(doc, change);
        if (failWrite === name) {
          failWrite = undefined;
          throw new Error("interrupted write");
        }
        return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
      }
    );
    coll.updateMany.mockImplementation(
      async (filter: Document, change: Document, options: { session?: unknown }) => {
        expect(options.session).toBeDefined();
        for (const doc of world[name] ?? []) if (matches(doc, filter)) update(doc, change);
        return { modifiedCount: 1 };
      }
    );
    coll.bulkWrite.mockImplementation(
      async (
        ops: Array<{ updateOne: { filter: Document; update: Document } }>,
        options: { session?: unknown }
      ) => {
        expect(options.session).toBeDefined();
        for (const op of ops) {
          const doc = (world[name] ?? []).find((row) => matches(row, op.updateOne.filter));
          if (doc) update(doc, op.updateOne.update);
        }
        if (failWrite === name) {
          failWrite = undefined;
          throw new Error("interrupted write");
        }
        return { modifiedCount: ops.length };
      }
    );
  }
  db = Object.assign(mock, { client: {} }) as unknown as Db;
  mocks.getDb.mockResolvedValue(db);
  mocks.run.mockImplementation(async (body) => {
    const snapshot = BSON.serialize(world);
    try {
      return await body({});
    } catch (error) {
      world = BSON.deserialize(snapshot) as World;
      throw error;
    }
  });
});

function electionFixture(kind: "national" | "regional" | "committee") {
  const collection =
    kind === "national"
      ? "nationalParty"
      : kind === "regional"
        ? "stateParty"
        : "nationalCommittee";
  world[`${collection}Elections`] = [
    {
      _id: electionId,
      partyId: "1",
      countryId: "US",
      stateId: "CA",
      position: "chair",
      status: "voting",
      endTurn: 10,
    },
  ];
  world[`${collection}Candidates`] = [
    {
      _id: new ObjectId(),
      electionId,
      characterId: winner,
      characterName: "Winner",
      enteredAt: now,
      status: "active",
    },
  ];
  world[`${collection}Votes`] =
    kind === "committee"
      ? [{ _id: new ObjectId(), electionId, voterId: winner, candidateIds: [winner], votedAt: now }]
      : [{ electionId, candidateId: winner, count: 1, partyInfluenceSum: 1 }];
  world.characters = [
    { _id: winner, party: "1", countryId: "US", userId: new ObjectId() },
    { _id: holder, party: "1", countryId: "US", userId: new ObjectId() },
  ];
  world.politicalParties = [
    {
      _id: new ObjectId(),
      countryId: "US",
      sequentialId: 1,
      chairId: holder,
      committeeIds: [holder],
    },
  ];
  world.statePartyOrg = [
    { _id: "CA_1", countryId: "US", stateId: "CA", partyId: "1", chairId: holder },
  ];
  return {
    collection,
    process:
      kind === "national"
        ? processCompletedNationalElections
        : kind === "regional"
          ? processCompletedElections
          : processCompletedCommitteeElections,
  };
}

describe("atomic political recovery", () => {
  it.each(["national", "regional", "committee"] as const)(
    "rolls back interrupted %s resolution and installs the winner once on retry",
    async (kind) => {
      const fixture = electionFixture(kind);
      failWrite = kind === "regional" ? "statePartyOrg" : "politicalParties";
      await expect(fixture.process(10, now, "US")).rejects.toThrow("interrupted write");
      expect(createNotification).not.toHaveBeenCalled();
      expect(createNotifications).not.toHaveBeenCalled();
      expect(world[`${fixture.collection}Elections`][0].status).toBe("voting");
      expect(world[`${fixture.collection}Candidates`][0].status).toBe("active");
      expect(world.politicalParties[0].chairId.equals(holder)).toBe(true);
      expect(world.statePartyOrg[0].chairId.equals(holder)).toBe(true);
      expect(await fixture.process(10, now, "US")).toBe(1);
      expect(world[`${fixture.collection}Elections`][0].status).toBe("completed");
      const installed =
        kind === "regional"
          ? world.statePartyOrg[0].chairId
          : kind === "committee"
            ? world.politicalParties[0].committeeIds[0]
            : world.politicalParties[0].chairId;
      expect(installed.equals(winner)).toBe(true);
      const notices =
        vi.mocked(createNotification).mock.calls.length +
        vi.mocked(createNotifications).mock.calls.length;
      expect(notices).toBeGreaterThan(0);
      expect(await fixture.process(10, now, "US")).toBe(0);
      expect(
        vi.mocked(createNotification).mock.calls.length +
          vi.mocked(createNotifications).mock.calls.length
      ).toBe(notices);
    }
  );

  it("rolls back a signed bill and both effect layers, then applies cash, inventory, construction and refunds once", async () => {
    const billId = new ObjectId();
    world.stateBills = [
      {
        _id: billId,
        stateId: "ON",
        countryId: "CA",
        status: "passed",
        title: "Recovery law",
        sponsorId: null,
        provisions: [],
      },
    ];
    world.gameState = [{ _id: "current", currentTurn: 10 }];
    const user = { character: { _id: winner, name: "Premier" } } as never;
    mocks.failLayer = true;
    await expect(
      takeStateBillGovernorAction(db, "CA", "ON", billId.toString(), user, "signed")
    ).rejects.toThrow("interrupted enactment");
    expect(world.stateBills[0].status).toBe("passed");
    expect(world.economicState[0]).toMatchObject({
      cash: 100,
      inventory: 5,
      construction: 2,
      refunds: 0,
    });
    mocks.failLayer = false;
    expect(
      (await takeStateBillGovernorAction(db, "CA", "ON", billId.toString(), user, "signed")).status
    ).toBe(200);
    expect(world.stateBills[0].status).toBe("enacted");
    expect(world.economicState[0]).toMatchObject({
      cash: 90,
      inventory: 7,
      construction: 3,
      refunds: 3,
    });
    expect(
      (await takeStateBillGovernorAction(db, "CA", "ON", billId.toString(), user, "signed")).status
    ).toBe(400);
    expect(world.economicState[0]).toMatchObject({
      cash: 90,
      inventory: 7,
      construction: 3,
      refunds: 3,
    });
  });

  it("retries a failed timer enactment and retains the original status until all effects commit", async () => {
    world.bills = [
      {
        _id: new ObjectId(),
        countryId: "US",
        stateId: "federal",
        status: "enrolled",
        originChamber: "house",
        presidentActionDeadlineOnTurn: 1,
        title: "Timer act",
        sponsorId: null,
      },
    ];
    const config: BillLifecycleConfig = {
      country: "US",
      level: "national",
      originChambers: ["house"],
      stages: [
        {
          kind: "executiveAction",
          status: "enrolled",
          execKind: "presidentVeto",
          officeType: "president",
          windowHours: 10,
          onTimeout: "sign",
        },
      ],
    };
    mocks.failLayer = true;
    await expect(runBillLifecycle(db, config, now, 10)).rejects.toThrow("interrupted enactment");
    expect(world.bills[0].status).toBe("enrolled");
    expect(world.economicState[0].cash).toBe(100);
    mocks.failLayer = false;
    const result = await runBillLifecycle(db, config, now, 10);
    expect(result.billsPassed).toBe(1);
    expect(world.bills[0].status).toBe("signed");
    expect(world.economicState[0]).toMatchObject({
      cash: 90,
      inventory: 7,
      construction: 3,
      refunds: 3,
    });
    expect((await runBillLifecycle(db, config, now, 10)).billsPassed).toBe(0);
    expect(world.economicState[0].refunds).toBe(3);
  });

  it("keeps timer counters and accounting exact when the transaction driver retries its callback", async () => {
    world.bills = [
      {
        _id: new ObjectId(),
        countryId: "US",
        stateId: "federal",
        status: "enrolled",
        originChamber: "house",
        presidentActionDeadlineOnTurn: 1,
        title: "Retried timer act",
        sponsorId: null,
      },
    ];
    const config: BillLifecycleConfig = {
      country: "US",
      level: "national",
      originChambers: ["house"],
      stages: [
        {
          kind: "executiveAction",
          status: "enrolled",
          execKind: "presidentVeto",
          officeType: "president",
          windowHours: 10,
          onTimeout: "sign",
        },
      ],
    };
    mocks.run.mockImplementation(async (body) => {
      const snapshot = BSON.serialize(world);
      try {
        return await body({});
      } catch {
        world = BSON.deserialize(snapshot) as World;
        return body({});
      }
    });
    mocks.failLayer = true;
    const result = await runBillLifecycle(db, config, now, 10);
    expect(result.billsPassed).toBe(1);
    expect(result.billsProcessed).toBe(1);
    expect(world.bills[0].status).toBe("signed");
    expect(world.economicState[0]).toMatchObject({
      cash: 90,
      inventory: 7,
      construction: 3,
      refunds: 3,
    });
  });

  it("retries an interrupted PM confidence resolution without stranding a completed vote", async () => {
    const voteId = new ObjectId();
    world.pmAppointmentVotes = [
      {
        _id: voteId,
        countryId: "CA",
        status: "active",
        isConfidenceMotion: true,
        nomineeCharacterId: winner,
        nomineePartyId: "1",
        votes: {},
        votesFor: 2,
        votesAgainst: 0,
      },
    ];
    world.governmentFormations = [
      { _id: "CA", status: "formed", pmCharacterId: winner, seatsByParty: { "1": 180 } },
    ];
    world.gameState = [{ _id: "current", currentTurn: 10 }];
    failWrite = "governmentFormations";
    await expect(resolveParliamentaryAppointmentVote(db, "CA", voteId, now)).rejects.toThrow(
      "interrupted write"
    );
    expect(world.pmAppointmentVotes[0].status).toBe("active");
    await resolveParliamentaryAppointmentVote(db, "CA", voteId, now);
    expect(world.pmAppointmentVotes[0].status).toBe("passed");
    expect(world.governmentFormations[0].pmCharacterId.equals(winner)).toBe(true);
    await resolveParliamentaryAppointmentVote(db, "CA", voteId, now);
    expect(world.pmAppointmentVotes[0].status).toBe("passed");
  });

  it("rolls back an interrupted new PM appointment, including the office and career entry", async () => {
    const voteId = new ObjectId();
    world.pmAppointmentVotes = [
      {
        _id: voteId,
        countryId: "CA",
        status: "active",
        nomineeCharacterId: winner,
        nomineeName: "New PM",
        nomineePartyId: "1",
        votes: {},
        votesFor: 2,
        votesAgainst: 0,
      },
    ];
    world.governmentFormations = [
      { _id: "CA", status: "pending", pmCharacterId: null, seatsByParty: { "1": 180 } },
    ];
    world.characters = [{ _id: winner, countryId: "CA", party: "1", careerHistory: [] }];
    world.gameState = [{ _id: "current", currentTurn: 10, preset: "2027-default" }];
    failWrite = "governmentFormations";
    await expect(resolveParliamentaryAppointmentVote(db, "CA", voteId, now)).rejects.toThrow(
      "interrupted write"
    );
    expect(world.pmAppointmentVotes[0].status).toBe("active");
    expect(world.characters[0].currentOffice).toBeUndefined();
    expect(world.characters[0].careerHistory).toHaveLength(0);
    await resolveParliamentaryAppointmentVote(db, "CA", voteId, now);
    expect(world.governmentFormations[0].status).toBe("formed");
    expect(world.characters[0].currentOffice.type).toBe("primeMinister");
    expect(world.characters[0].careerHistory).toHaveLength(1);
    await resolveParliamentaryAppointmentVote(db, "CA", voteId, now);
    expect(world.characters[0].careerHistory).toHaveLength(1);
  });

  it.each([false, true])(
    "regional incumbent standing=%s follows national renewal rules on an unvoted election",
    async (stood) => {
      const fixture = electionFixture("regional");
      world.statePartyVotes = [];
      world.statePartyCandidates = stood
        ? [
            {
              electionId,
              characterId: holder,
              characterName: "Incumbent",
              enteredAt: now,
              status: "active",
            },
          ]
        : [];
      await fixture.process(10, now, "US");
      expect(world.statePartyOrg[0].chairId?.toString() ?? null).toBe(
        stood ? holder.toString() : null
      );
    }
  );
});
