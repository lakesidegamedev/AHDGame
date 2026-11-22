import { beforeEach, describe, expect, it, vi } from "vitest";
import { BSON, ObjectId, type Db, type Document } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";

const mocks = vi.hoisted(() => ({ run: vi.fn(), getDb: vi.fn() }));
vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: mocks.run,
  RequiredTransactionCleanupError: class extends Error {},
}));
vi.mock("@/lib/mongodb", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/gameState", () => ({ getGameState: async () => ({ currentTurn: 100 }) }));
vi.mock("@/lib/utils/bannedCharacters", () => ({ getBannedCharacterIds: async () => new Set() }));
vi.mock("@/lib/wiki/markCongressLeadership", () => ({ markCongressLeadershipHeld: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
  createNotifications: vi.fn(),
}));
vi.mock("@/lib/discordWebhooks", () => ({
  sendCountryGameEvent: vi.fn(async () => {}),
  DISCORD_COLORS: {},
}));
vi.mock("@/lib/congress/governmentVoteBreakdown", () => ({
  computeCongressLeadershipTally: async () => ({ votesFor: 1 }),
  computeParliamentaryGovernmentTally: async () => ({ votesFor: 1, votesAgainst: 0 }),
  computeCabinetNominationTally: async () => ({
    votesFor: 1,
    votesAgainst: 0,
    votesAbstain: 0,
    houseVotesFor: 1,
    houseVotesAgainst: 0,
  }),
}));
vi.mock("@/lib/turn/parliamentaryGovernment", () => ({
  autoAyeNPPsForParliamentaryAppointment: vi.fn(),
}));
vi.mock("@/lib/countries/runtimeOffices", () => ({
  loadRuntimeCountryOffices: async () => ({
    config: { headOfStateSelection: "legislatureAppointment", headOfStateTitle: "President" },
    headOfStateOfficeType: "president",
    jointSittingOfficeTypes: ["supremeSoviet"],
  }),
}));
vi.mock("@/lib/cabinet/officeCompatibility", () => ({
  getIncompatibleOfficeHolders: async () => new Set(),
}));
vi.mock("@/lib/cabinetNominationChoice", () => ({
  expireUnansweredCabinetNominationChoices: vi.fn(),
  CABINET_NOMINATION_CHOICE_TURNS: 12,
}));
vi.mock("@/lib/cabinet/actingExpiry", () => ({ expireLapsedActingAppointments: vi.fn() }));
vi.mock("@/lib/analytics/officeTransitionAnalytics", () => ({ captureOfficeTransition: vi.fn() }));
vi.mock("@/lib/achievements", () => ({
  awardAchievement: vi.fn(),
  resolveUserIdFromCharacter: vi.fn(),
}));
vi.mock("@/lib/achievements/triggers", () => ({ checkOfficeHeldAchievements: vi.fn() }));

import { resolveLeadershipElection } from "@/lib/congress/leadershipElections";
import { processCompletedCaucusChairElections } from "@/lib/elections/party/caucusChairElections";
import { processCabinetNominationLifecycle } from "@/lib/cabinetNominationLifecycle";
import { resolveHeadOfStateAppointmentVote } from "@/lib/turn/hosAppointment";
import { processCompletedNationalElections } from "@/lib/elections/party/nationalPartyElections";
import { processCompletedElections } from "@/lib/elections/party/statePartyElections";
import { processCompletedCommitteeElections } from "@/lib/elections/party/nationalCommitteeElections";
import { createNotification, createNotifications } from "@/lib/notifications";
import { sendCountryGameEvent } from "@/lib/discordWebhooks";

let memory: InMemoryDb;
let db: Db;
let fault: string | undefined;
let activeSession: object | undefined;
let retryCallback: boolean;
let commands: string[];
const now = new Date("2026-11-22T12:00:00Z");
const winner = new ObjectId(),
  holder = new ObjectId(),
  electionId = new ObjectId();
const writes = new Set([
  "updateOne",
  "updateMany",
  "insertOne",
  "insertMany",
  "deleteOne",
  "deleteMany",
  "bulkWrite",
  "findOneAndUpdate",
]);

function snapshot(): Record<string, Document[]> {
  return Object.fromEntries(
    [...memory.collections].map(([name, col]) => [
      name,
      BSON.deserialize(BSON.serialize({ docs: col.docs })).docs,
    ])
  );
}
function restore(saved: Record<string, Document[]>) {
  for (const [name, col] of memory.collections) col.docs = saved[name] ?? [];
}
function notices() {
  return (
    vi.mocked(createNotification).mock.calls.length +
    vi.mocked(createNotifications).mock.calls.length +
    vi.mocked(sendCountryGameEvent).mock.calls.length
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  memory = createInMemoryDb();
  fault = undefined;
  retryCallback = false;
  activeSession = undefined;
  commands = [];
  db = new Proxy(
    { client: {} },
    {
      get(target, key) {
        if (key !== "collection") return Reflect.get(target, key);
        return (name: string) =>
          new Proxy(memory.collection(name), {
            get(col, method) {
              const value = Reflect.get(col, method);
              if (typeof value !== "function") return value;
              if (!writes.has(String(method)))
                return (...args: unknown[]) => {
                  commands.push(`${name}.${String(method)}`);
                  return value.apply(col, args);
                };
              return async (...args: unknown[]) => {
                commands.push(`${name}.${String(method)}`);
                expect(activeSession).toBeDefined();
                expect((args.at(-1) as { session?: unknown }).session).toBe(activeSession);
                const result = await value.apply(col, args);
                if (fault === `${name}.${String(method)}`) {
                  fault = undefined;
                  throw new Error("interrupted resolution");
                }
                return result;
              };
            },
          });
      },
    }
  ) as Db;
  mocks.getDb.mockResolvedValue(db);
  mocks.run.mockImplementation(async (body) => {
    const saved = snapshot();
    activeSession = {};
    try {
      if (retryCallback) {
        retryCallback = false;
        await body(activeSession);
        restore(saved);
      }
      return await body(activeSession);
    } catch (error) {
      restore(saved);
      throw error;
    } finally {
      activeSession = undefined;
    }
  });
});

describe("political resolution interruption recovery", () => {
  it("confirms two cabinet positions with one participant read and one write batch per collection", async () => {
    const secondWinner = new ObjectId();
    const positions = ["secretary_of_treasury", "attorney_general"];
    const nominees = [winner, secondWinner];
    memory.seed(
      "characters",
      nominees.map((_id) => ({ _id, userId: new ObjectId(), careerHistory: [] }))
    );
    memory.seed(
      "cabinetNominations",
      positions.map((positionId, i) => ({
        _id: new ObjectId(),
        countryId: "US",
        positionId,
        status: "active",
        votingEndsOnTurn: 100,
        nomineeCharacterId: nominees[i],
        nomineeCharacterName: "Nominee",
        nomineeParty: "1",
        proposedByPresidentId: holder,
        votes: {},
      }))
    );
    memory.seed(
      "cabinetMembers",
      positions.map((positionId) => ({
        _id: new ObjectId(),
        countryId: "US",
        positionId,
        characterId: holder,
      }))
    );
    expect(await processCabinetNominationLifecycle(now)).toEqual({ nominationsProcessed: 2 });
    expect(memory.collection("cabinetMembers").docs.map((d) => d.characterId)).toEqual(nominees);
    expect(
      memory.collection("characters").docs.map((d) => (d.careerHistory as unknown[]).length)
    ).toEqual([1, 1]);
    for (const name of [
      "characters.find",
      "cabinetMembers.bulkWrite",
      "characters.bulkWrite",
      "cabinetNominations.bulkWrite",
      "cabinetSettings.updateMany",
    ])
      expect(commands.filter((command) => command === name)).toHaveLength(1);
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it.each(["characters.updateOne", "electedOfficials.updateOne", "cabinetNominations.bulkWrite"])(
    "restores the VP, nominee's old seat and career after %s",
    async (point) => {
      memory.seed("cabinetNominations", [
        {
          _id: electionId,
          countryId: "US",
          positionId: "vicePresident",
          status: "active",
          votingEndsOnTurn: 100,
          nomineeCharacterId: winner,
          nomineeCharacterName: "Winner",
          nomineeParty: "1",
          proposedByPresidentId: holder,
          votes: {},
          houseVotes: {},
        },
      ]);
      memory.seed("electedOfficials", [
        {
          _id: new ObjectId(),
          countryId: "US",
          officeType: "vicePresident",
          state: "US",
          characterId: holder,
        },
        {
          _id: new ObjectId(),
          countryId: "US",
          officeType: "house",
          state: "CA",
          characterId: winner,
        },
      ]);
      memory.seed("characters", [
        {
          _id: winner,
          userId: new ObjectId(),
          currentOffice: { type: "house", state: "CA" },
          careerHistory: [],
        },
        { _id: holder, currentOffice: { type: "vicePresident" } },
      ]);
      const saved = snapshot();
      fault = point;
      await expect(processCabinetNominationLifecycle(now)).rejects.toThrow(
        "interrupted resolution"
      );
      for (const name of Object.keys(saved))
        expect(memory.collection(name).docs).toEqual(saved[name]);
      expect(notices()).toBe(0);
      retryCallback = true;
      await processCabinetNominationLifecycle(now);
      expect(memory.collection("cabinetNominations").docs[0].status).toBe("confirmed");
      expect(memory.collection("characters").docs[0]).toMatchObject({
        currentOffice: { type: "vicePresident" },
      });
      expect(memory.collection("characters").docs[0].careerHistory).toHaveLength(1);
      expect(
        memory.collection("electedOfficials").docs.find((d) => d.officeType === "vicePresident")
          ?.characterId
      ).toEqual(winner);
      expect(
        memory.collection("electedOfficials").docs.find((d) => d.officeType === "house")
          ?.characterId
      ).toBeNull();
      const sent = notices();
      await processCabinetNominationLifecycle(now);
      expect(notices()).toBe(sent);
      expect(memory.collection("characters").docs[0].careerHistory).toHaveLength(1);
    }
  );

  it("drops a departed national voter even when their chosen candidate is still eligible", async () => {
    const rival = new ObjectId(),
      departed = new ObjectId();
    memory.seed("nationalPartyElections", [
      {
        _id: electionId,
        countryId: "US",
        partyId: "1",
        position: "chair",
        status: "voting",
        endTurn: 10,
      },
    ]);
    memory.seed(
      "nationalPartyCandidates",
      [winner, rival].map((id) => ({
        _id: new ObjectId(),
        electionId,
        characterId: id,
        characterName: "Candidate",
        status: "active",
        enteredAt: id.equals(winner) ? now : new Date(now.getTime() - 1),
      }))
    );
    memory.seed(
      "characters",
      [winner, rival, departed].map((id) => ({
        _id: id,
        userId: new ObjectId(),
        countryId: "US",
        party: id.equals(departed) ? "2" : "1",
      }))
    );
    memory.seed("nationalPartyVotes", [
      { _id: new ObjectId(), electionId, voterId: winner, candidateId: winner, votedAt: now },
      { _id: new ObjectId(), electionId, voterId: departed, candidateId: rival, votedAt: now },
    ]);
    memory.seed("politicalParties", [
      { _id: new ObjectId(), sequentialId: 1, countryId: "US", chairId: holder },
    ]);
    await processCompletedNationalElections(10, now, "US");
    expect(memory.collection("politicalParties").docs[0].chairId).toEqual(winner);
  });

  it.each([
    "houseLeadershipNominations.updateOne",
    "houseLeadershipNominations.updateMany",
    "congressLeaders.updateOne",
    "houseLeadershipElections.updateOne",
  ])("restores congressional nominations and holder after %s", async (point) => {
    memory.seed("houseLeadershipElections", [{ _id: "minority_leader", status: "voting" }]);
    memory.seed("houseLeadershipNominations", [
      {
        _id: new ObjectId(),
        role: "minority_leader",
        nomineeId: winner,
        nomineeName: "Winner",
        nomineeParty: "1",
        status: "voting",
        createdAt: now,
        votes: {},
      },
    ]);
    memory.seed("congressLeaders", [
      { _id: new ObjectId(), role: "minority_leader_house", characterId: holder },
    ]);
    const run = () =>
      resolveLeadershipElection(db, "minority_leader", "minority_leader_house", "house", true);
    const saved = snapshot();
    fault = point;
    await expect(run()).rejects.toThrow("interrupted resolution");
    for (const name of Object.keys(saved))
      expect(memory.collection(name).docs).toEqual(saved[name]);
    expect(notices()).toBe(0);
    retryCallback = true;
    expect(await run()).toBe(true);
    expect(memory.collection("congressLeaders").docs[0].characterId).toEqual(winner);
    expect(memory.collection("houseLeadershipElections").docs[0].status).toBe("closed");
    const sent = notices();
    expect(sent).toBeGreaterThan(0);
    expect(await run()).toBe(false);
    expect(notices()).toBe(sent);
  });

  it.each(["caucuses.bulkWrite", "caucusMemberships.bulkWrite", "caucusChairElections.bulkWrite"])(
    "restores caucus roles and term count after %s",
    async (point) => {
      const caucusId = new ObjectId();
      memory.seed("caucuses", [
        {
          _id: caucusId,
          name: "Caucus",
          countryId: "CA",
          partyId: "1",
          chairId: holder,
          termsServed: 0,
        },
      ]);
      memory.seed("caucusChairElections", [
        { _id: electionId, caucusId, status: "voting", endTurn: 10 },
      ]);
      memory.seed("caucusChairCandidates", [
        {
          _id: new ObjectId(),
          electionId,
          characterId: winner,
          characterName: "Winner",
          status: "active",
          enteredAt: now,
        },
      ]);
      memory.seed("caucusChairVotes", [
        { _id: new ObjectId(), electionId, candidateId: winner, voterId: winner },
      ]);
      memory.seed("caucusMemberships", [
        {
          _id: new ObjectId(),
          caucusId,
          memberType: "character",
          memberId: holder,
          role: "chair",
          status: "active",
        },
        {
          _id: new ObjectId(),
          caucusId,
          memberType: "character",
          memberId: winner,
          role: "member",
          status: "active",
        },
      ]);
      memory.seed("characters", [
        { _id: winner, userId: new ObjectId() },
        { _id: holder, userId: new ObjectId() },
      ]);
      const saved = snapshot();
      fault = point;
      await expect(processCompletedCaucusChairElections(10)).rejects.toThrow(
        "interrupted resolution"
      );
      for (const name of Object.keys(saved))
        expect(memory.collection(name).docs).toEqual(saved[name]);
      expect(notices()).toBe(0);
      retryCallback = true;
      expect(await processCompletedCaucusChairElections(10)).toBe(1);
      expect(memory.collection("caucuses").docs[0]).toMatchObject({
        chairId: winner,
        termsServed: 1,
      });
      expect(memory.collection("caucusMemberships").docs.map((d) => d.role)).toEqual([
        "member",
        "chair",
      ]);
      const sent = notices();
      expect(sent).toBeGreaterThan(0);
      expect(await processCompletedCaucusChairElections(10)).toBe(0);
      expect(notices()).toBe(sent);
    }
  );

  it.each([
    "pmAppointmentVotes.findOneAndUpdate",
    "electedOfficials.deleteMany",
    "electedOfficials.insertOne",
    "governmentFormations.updateOne",
  ])("keeps a head-of-state vote retryable after %s", async (point) => {
    memory.seed("pmAppointmentVotes", [
      {
        _id: electionId,
        countryId: "RU",
        status: "active",
        office: "headOfState",
        nomineeCharacterId: winner,
        nomineeName: "Winner",
        votes: {},
      },
    ]);
    memory.seed("electedOfficials", [
      { _id: new ObjectId(), countryId: "RU", officeType: "president", characterId: holder },
    ]);
    memory.seed("governmentFormations", [{ _id: "RU", hosCharacterId: holder }]);
    memory.seed("characters", [{ _id: winner, party: "1", userId: new ObjectId() }]);
    const run = () => resolveHeadOfStateAppointmentVote(db, "RU", electionId, now);
    const saved = snapshot();
    fault = point;
    await expect(run()).rejects.toThrow("interrupted resolution");
    for (const name of Object.keys(saved))
      expect(memory.collection(name).docs).toEqual(saved[name]);
    expect(notices()).toBe(0);
    retryCallback = true;
    await run();
    expect(memory.collection("pmAppointmentVotes").docs[0].status).toBe("passed");
    expect(memory.collection("electedOfficials").docs).toHaveLength(1);
    expect(memory.collection("electedOfficials").docs[0].characterId).toEqual(winner);
    expect(memory.collection("governmentFormations").docs[0].hosCharacterId).toEqual(winner);
    const sent = notices();
    expect(sent).toBeGreaterThan(0);
    await run();
    expect(notices()).toBe(sent);
  });

  it.each([
    "cabinetMembers.bulkWrite",
    "cabinetSettings.updateMany",
    "characters.bulkWrite",
    "cabinetNominations.bulkWrite",
  ])("rolls back cabinet seating, cooldowns and career after %s", async (point) => {
    memory.seed("cabinetNominations", [
      {
        _id: electionId,
        countryId: "US",
        positionId: "secretary_of_treasury",
        status: "active",
        votingEndsOnTurn: 100,
        nomineeCharacterId: winner,
        nomineeCharacterName: "Winner",
        nomineeParty: "1",
        proposedByPresidentId: holder,
        votes: {},
      },
    ]);
    memory.seed("cabinetMembers", [
      {
        _id: new ObjectId(),
        countryId: "US",
        positionId: "secretary_of_treasury",
        characterId: holder,
        ministerialActions: 1,
      },
    ]);
    memory.seed("cabinetSettings", [
      { _id: "US_secretary_of_treasury", allocationLastChangedTurn: 99 },
    ]);
    memory.seed("characters", [
      { _id: winner, userId: new ObjectId(), careerHistory: [] },
      { _id: holder, userId: new ObjectId() },
    ]);
    const run = () => processCabinetNominationLifecycle(now);
    const saved = snapshot();
    fault = point;
    await expect(run()).rejects.toThrow("interrupted resolution");
    for (const name of Object.keys(saved))
      expect(memory.collection(name).docs).toEqual(saved[name]);
    expect(notices()).toBe(0);
    retryCallback = true;
    await run();
    expect(memory.collection("cabinetMembers").docs).toHaveLength(1);
    expect(memory.collection("cabinetMembers").docs[0].characterId).toEqual(winner);
    expect(memory.collection("characters").docs[0].careerHistory).toHaveLength(1);
    expect(memory.collection("cabinetNominations").docs[0].status).toBe("confirmed");
    memory.collection("cabinetMembers").docs[0].ministerialActions = 0;
    memory.collection("cabinetSettings").docs[0].allocationLastChangedTurn = 100;
    const sent = notices();
    expect(sent).toBeGreaterThan(0);
    await run();
    expect(notices()).toBe(sent);
    expect(memory.collection("cabinetMembers").docs[0].ministerialActions).toBe(0);
    expect(memory.collection("cabinetSettings").docs[0].allocationLastChangedTurn).toBe(100);
    expect(memory.collection("characters").docs[0].careerHistory).toHaveLength(1);
  });

  it.each(["national", "regional", "committee"] as const)(
    "revalidates departed candidates and voters after interrupted %s resolution",
    async (kind) => {
      const prefix =
        kind === "national"
          ? "nationalParty"
          : kind === "regional"
            ? "stateParty"
            : "nationalCommittee";
      const departed = new ObjectId();
      memory.seed(`${prefix}Elections`, [
        {
          _id: electionId,
          partyId: "1",
          countryId: "US",
          stateId: "CA",
          position: "chair",
          status: "voting",
          endTurn: 10,
        },
      ]);
      memory.seed(
        `${prefix}Candidates`,
        [winner, departed].map((id) => ({
          _id: new ObjectId(),
          electionId,
          characterId: id,
          characterName: id.equals(winner) ? "Winner" : "Departed",
          enteredAt: now,
          status: "active",
        }))
      );
      memory.seed(`${prefix}Votes`, [
        {
          _id: new ObjectId(),
          electionId,
          voterId: winner,
          candidateId: winner,
          candidateIds: [winner],
          votedAt: now,
        },
        {
          _id: new ObjectId(),
          electionId,
          voterId: holder,
          candidateId: departed,
          candidateIds: [departed],
          votedAt: now,
        },
        {
          _id: new ObjectId(),
          electionId,
          voterId: departed,
          candidateId: departed,
          candidateIds: [departed],
          votedAt: now,
        },
      ]);
      memory.seed(
        "characters",
        [winner, holder, departed].map((id) => ({
          _id: id,
          userId: new ObjectId(),
          countryId: "US",
          party: "1",
        }))
      );
      memory.seed("politicalParties", [
        {
          _id: new ObjectId(),
          countryId: "US",
          sequentialId: 1,
          chairId: holder,
          committeeIds: [holder],
        },
      ]);
      memory.seed("statePartyOrg", [
        { _id: "CA_1", countryId: "US", stateId: "CA", partyId: "1", chairId: holder },
      ]);
      const process =
        kind === "national"
          ? processCompletedNationalElections
          : kind === "regional"
            ? processCompletedElections
            : processCompletedCommitteeElections;
      fault = `${prefix}Elections.bulkWrite`;
      await expect(process(10, now, "US")).rejects.toThrow("interrupted resolution");
      expect(notices()).toBe(0);
      memory
        .collection("characters")
        .docs.find((d) => (d._id as ObjectId).equals(departed))!.party = "2";
      expect(await process(10, now, "US")).toBe(1);
      const installed =
        kind === "regional"
          ? memory.collection("statePartyOrg").docs[0].chairId
          : kind === "committee"
            ? (memory.collection("politicalParties").docs[0].committeeIds as ObjectId[])[0]
            : memory.collection("politicalParties").docs[0].chairId;
      expect(installed).toEqual(winner);
      expect(await process(10, now, "US")).toBe(0);
    }
  );
});
