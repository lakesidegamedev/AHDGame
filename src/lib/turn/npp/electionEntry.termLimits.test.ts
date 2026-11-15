import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { Election, ElectionCandidate, ElectedOfficial, NPP } from "@/lib/db/types";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { NPPContext } from "./context";
import { processElectionEntry } from "./electionEntry";

vi.mock("@/lib/events/substrate/rng", () => ({
  makeSeededRng: vi.fn(() => () => 0.5),
}));

function npp(overrides: Partial<NPP>): NPP {
  return {
    _id: new ObjectId(),
    name: "Test NPP",
    countryId: "US",
    homeState: "US",
    party: "republican",
    politicalInfluence: 50,
    favorability: 50,
    policies: { economic: 0, social: 0 },
    currentOffice: null,
    personality: { loyalty: 50, ambition: 50, stubbornness: 50 },
    generatedAt: new Date(),
    retiredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function office(holder: NPP, officeType: string): ElectedOfficial {
  return {
    _id: new ObjectId(),
    countryId: "US",
    officeType,
    state: "US",
    characterId: null,
    characterName: holder.name,
    party: holder.party,
    isNPP: true,
    nppId: holder._id,
    electedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ElectedOfficial;
}

function presidentialPrimary(): Election {
  return {
    _id: new ObjectId(),
    electionType: "president",
    state: "US",
    countryId: "US",
    cycle: 1,
    status: "active",
    startTime: new Date(),
    endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    primaryEndTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Election;
}

function context(db: MockDb, primary: Election, president: NPP, vicePresident: NPP): NPPContext {
  const npps = [president, vicePresident];
  return {
    now: new Date(),
    db: db as unknown as Db,
    allNPPs: npps,
    nppMap: new Map(npps.map((n) => [n._id.toString(), n])),
    openPrimaries: [primary],
    nppCandidacies: new Set<string>(),
    candidatesByElection: new Map([[primary._id.toString(), [] as ElectionCandidate[]]]),
    nppOfficials: [],
    officialsByNPP: new Map([
      [president._id.toString(), [office(president, "president")]],
      [vicePresident._id.toString(), [office(vicePresident, "vicePresident")]],
    ]),
    activeBills: [],
    billWhips: new Map(),
    activeStateBills: [],
    stateBillWhips: new Map(),
    statePartyOrgs: new Map(),
    partyByCompositeKey: new Map(),
    partyCountries: new Map(),
    legislationTypeMap: new Map(),
    stateDemographicsMap: new Map(),
    statesById: new Map(),
    currentTurn: 0,
    nppElectionEligiblePartyKeys: new Set(["US:republican"]),
  };
}

describe("processElectionEntry: executive term limits for NPPs", () => {
  let db: MockDb;

  beforeEach(() => {
    db = createMockDb();
    db.collection("slateCandidates");
    db.collectionMocks.slateCandidates.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    // Autonomy-active US (no players), so NPPs may contest the presidency.
    db.collection("gameState");
    db.collection("countryGameStates");
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      nppAutonomyEnabled: true,
      nppAutonomyLevel: "v4",
    });
    db.collectionMocks.countryGameStates.findOne.mockResolvedValue({
      _id: "US",
      enabledForPlayers: false,
      status: "beta",
    });
  });

  it("keeps the seeded two-term president out of the 2028 race and fields the vice president", async () => {
    // Created first, so the deterministic pick would choose him if eligible.
    const president = npp({ name: "President", executiveTermsServed: { US: 2 } });
    const vicePresident = npp({ name: "Vice President" });
    const primary = presidentialPrimary();

    const entered = await processElectionEntry(context(db, primary, president, vicePresident));

    expect(entered).toBe(1);
    const inserts = db.collectionMocks.electionCandidates.insertOne.mock.calls.map(
      (call) => call[0] as ElectionCandidate
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      electionId: primary._id,
      nppId: vicePresident._id,
      party: "republican",
    });
  });

  it("still fields a one-term president for re-election", async () => {
    const president = npp({ name: "President", executiveTermsServed: { US: 1 } });
    const vicePresident = npp({ name: "Vice President" });
    const primary = presidentialPrimary();

    await processElectionEntry(context(db, primary, president, vicePresident));

    const inserts = db.collectionMocks.electionCandidates.insertOne.mock.calls.map(
      (call) => call[0] as ElectionCandidate
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ nppId: president._id });
  });
});
