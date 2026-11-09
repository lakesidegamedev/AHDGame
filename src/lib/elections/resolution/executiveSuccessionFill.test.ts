import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  govFind: vi.fn(),
  govBulk: vi.fn(),
  electionFind: vi.fn(),
  electionInsert: vi.fn(),
  officialFind: vi.fn(),
  officialBulk: vi.fn(),
  nppBulk: vi.fn(),
  preset: vi.fn(),
  vacate: vi.fn(),
  stateFind: vi.fn(),
  leaderBulk: vi.fn(),
}));

vi.mock("@/lib/db/collections/governmentFormation", () => ({
  getGovernmentFormationsCollection: () => ({ find: m.govFind, bulkWrite: m.govBulk }),
}));
vi.mock("@/lib/db/collections/elections", () => ({
  getElectionsCollection: async () => ({ find: m.electionFind, insertMany: m.electionInsert }),
}));
vi.mock("@/lib/db/collections/electedOfficials", () => ({
  getElectedOfficialsCollection: async () => ({ find: m.officialFind, bulkWrite: m.officialBulk }),
}));
vi.mock("@/lib/db/collections/npps", () => ({
  getNppsCollection: async () => ({ bulkWrite: m.nppBulk }),
}));
vi.mock("@/lib/db/collections/countryState", () => ({
  getCountryStateCollection: () => ({ find: m.stateFind }),
}));
vi.mock("@/lib/db/collections/countryLeaderState", () => ({
  getCountryLeaderStatesCollection: () => ({ bulkWrite: m.leaderBulk }),
}));
vi.mock("@/lib/db/collections/gameState", () => ({ getGameStatePreset: m.preset }));
vi.mock("@/lib/elections/vacateOfficesForExecutive", () => ({
  vacateNonExecutiveOfficesForExecutive: m.vacate,
}));
vi.mock("@/lib/elections/resolution/executiveSuccession", () => ({
  processSuccessions: vi.fn(),
}));
vi.mock("@/lib/campaignTargeting/rules", () => ({ withCampaignRules: (doc: unknown) => doc }));

import { processSuccessionFills } from "./executiveSuccessionFill";

const now = new Date("2027-03-01T00:00:00Z");
const db = {} as never;

function succession(over: Record<string, unknown>) {
  return {
    office: "president",
    fill: "direct_election",
    actingLabel: "Prime Minister",
    vacatedTurn: 100,
    actingUntilTurn: 268,
    fillByTurn: 436,
    overdue: false,
    ...over,
  };
}

function world(opts: {
  govs: Array<{ _id: string; succession: Record<string, unknown> }>;
  elections?: Array<{ countryId: string }>;
  officials?: Array<Record<string, unknown>>;
}) {
  m.govFind.mockReturnValue({ toArray: async () => opts.govs });
  m.electionFind.mockReturnValue({ toArray: async () => opts.elections ?? [] });
  m.officialFind.mockImplementation((query: { officeType?: unknown }) => ({
    toArray: async () => (opts.officials ?? []).filter((o) => matches(o, query)),
  }));
}

function matches(row: Record<string, unknown>, query: Record<string, any>): boolean {
  if (query.nppId?.$ne === null) {
    return row.nppId != null && !query.officeType?.$nin?.includes(row.officeType);
  }
  return query.officeType?.$in?.includes(row.officeType) ?? false;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.preset.mockResolvedValue("2027-default");
  m.vacate.mockResolvedValue(undefined);
  m.stateFind.mockReturnValue({ toArray: async () => [] });
});

describe("special presidential election", () => {
  it("opens once the acting period has run out", async () => {
    world({ govs: [{ _id: "FR", succession: succession({}) }] });
    const result = await processSuccessionFills(db, 300, now);
    expect(result.spawned).toBe(1);
    const docs = m.electionInsert.mock.calls[0]![0];
    expect(docs[0]).toMatchObject({
      electionType: "special_president",
      countryId: "FR",
      state: "FR",
      status: "active",
      totalSeats: 1,
      startTurn: 300,
      primaryEndTurn: 324,
      endTurn: 348,
    });
  });

  it("waits while the prime minister is still acting", async () => {
    world({ govs: [{ _id: "FR", succession: succession({}) }] });
    expect((await processSuccessionFills(db, 268, now)).spawned).toBe(0);
    expect(m.electionInsert).not.toHaveBeenCalled();
  });

  it("does not open a second election while one is live or just resolved", async () => {
    world({
      govs: [{ _id: "FR", succession: succession({}) }],
      elections: [{ countryId: "FR" }],
    });
    expect((await processSuccessionFills(db, 300, now)).spawned).toBe(0);
    expect(m.electionInsert).not.toHaveBeenCalled();
  });

  it("leaves the 1991 Russian presidency to its constitutional ballot", async () => {
    m.preset.mockResolvedValue("1991-default");
    world({ govs: [{ _id: "RU", succession: succession({}) }] });
    expect((await processSuccessionFills(db, 300, now)).spawned).toBe(0);
  });

  it("opens one for Russia in 2027", async () => {
    world({ govs: [{ _id: "RU", succession: succession({}) }] });
    expect((await processSuccessionFills(db, 300, now)).spawned).toBe(1);
  });
});

describe("legislature and party votes", () => {
  const legislator = (party: string) => ({
    countryId: "CN",
    officeType: "npcDelegate",
    nppId: new ObjectId(),
    party,
  });
  const premierRow = {
    _id: new ObjectId(),
    countryId: "CN",
    officeType: "premier",
    characterId: null,
    nppId: null,
  };
  const partyVote = succession({
    office: "premier",
    fill: "party_vote",
    actingUntilTurn: 124,
    fillByTurn: 172,
  });

  it("seats a member of the largest bloc and clears the succession", async () => {
    const bloc = [legislator("1"), legislator("1"), legislator("2")];
    world({
      govs: [{ _id: "CN", succession: partyVote }],
      officials: [premierRow, ...bloc],
    });
    const result = await processSuccessionFills(db, 130, now);
    expect(result.voted).toBe(1);
    const seated = m.officialBulk.mock.calls[0]![0][0].updateOne;
    expect(seated.filter._id).toBe(premierRow._id);
    expect(seated.update.$set.party).toBe("1");
    expect([bloc[0]!.nppId, bloc[1]!.nppId]).toContainEqual(seated.update.$set.nppId);
    expect(m.govBulk.mock.calls[0]![0][0].updateOne.update).toEqual({ $unset: { succession: "" } });
    expect(m.vacate).toHaveBeenCalledWith(db, { nppId: seated.update.$set.nppId }, now);
  });

  it("does nothing while the acting period runs or the office is already held", async () => {
    world({
      govs: [{ _id: "CN", succession: partyVote }],
      officials: [premierRow, legislator("1")],
    });
    expect((await processSuccessionFills(db, 124, now)).voted).toBe(0);

    world({
      govs: [{ _id: "CN", succession: partyVote }],
      officials: [{ ...premierRow, nppId: new ObjectId() }, legislator("1")],
    });
    expect((await processSuccessionFills(db, 130, now)).voted).toBe(0);
    expect(m.officialBulk).not.toHaveBeenCalled();
  });

  it("leaves the office empty when there are no legislators to choose from", async () => {
    world({ govs: [{ _id: "CN", succession: partyVote }], officials: [premierRow] });
    expect((await processSuccessionFills(db, 130, now)).voted).toBe(0);
    expect(m.govBulk).not.toHaveBeenCalled();
  });

  it("never seats a player, even one with a larger bloc", async () => {
    const player = (party: string) => ({
      countryId: "CN",
      officeType: "npcDelegate",
      nppId: new ObjectId(),
      characterId: new ObjectId(),
      party,
    });
    const npp = legislator("2");
    world({
      govs: [{ _id: "CN", succession: partyVote }],
      officials: [premierRow, player("1"), player("1"), player("1"), npp],
    });
    await processSuccessionFills(db, 130, now);
    const seated = m.officialBulk.mock.calls[0]![0][0].updateOne.update.$set;
    expect(seated.nppId).toBe(npp.nppId);
    expect(seated.isNPP).toBe(true);
    expect(seated.characterId).toBeNull();
    const query = m.officialFind.mock.calls.at(-1)![0];
    expect(query.nppId).toEqual({ $ne: null });
  });

  it("leaves the office empty when only players sit in the legislature", async () => {
    world({
      govs: [{ _id: "CN", succession: partyVote }],
      officials: [
        premierRow,
        { ...legislator("1"), characterId: new ObjectId() },
        { ...legislator("1"), characterId: new ObjectId() },
      ],
    });
    expect((await processSuccessionFills(db, 130, now)).voted).toBe(0);
    expect(m.officialBulk).not.toHaveBeenCalled();
  });

  it("starts fresh leader confidence for a party-state leader", async () => {
    m.stateFind.mockReturnValue({ toArray: async () => [{ _id: "CN" }] });
    const npp = { ...legislator("1"), characterName: "New Leader" };
    world({ govs: [{ _id: "CN", succession: partyVote }], officials: [premierRow, npp] });
    await processSuccessionFills(db, 130, now);
    const update = m.govBulk.mock.calls[0]![0][0].updateOne.update;
    expect(update.$unset).toEqual({ succession: "" });
    expect(update.$set).toEqual({
      pmNppId: npp.nppId,
      pmCharacterId: null,
      pmName: "New Leader",
    });
    const state = m.leaderBulk.mock.calls[0]![0][0].replaceOne.replacement;
    expect(state).toMatchObject({
      _id: `CN_npp_${String(npp.nppId)}`,
      countryId: "CN",
      leaderNppId: npp.nppId,
      leaderCharacterId: null,
      leaderOfficeType: "premier",
      governingPartyId: "1",
      partyConfidence: 75,
      startedAtTurn: 130,
      renewalCount: 0,
      confidenceHistory: [],
    });
  });

  it("writes no confidence state where the country has no confidence model", async () => {
    world({
      govs: [{ _id: "CN", succession: partyVote }],
      officials: [premierRow, legislator("1")],
    });
    await processSuccessionFills(db, 130, now);
    expect(m.leaderBulk).not.toHaveBeenCalled();
    expect(m.govBulk.mock.calls[0]![0][0].updateOne.update).toEqual({ $unset: { succession: "" } });
  });
});
