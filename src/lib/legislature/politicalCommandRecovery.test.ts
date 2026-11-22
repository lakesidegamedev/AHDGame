import { beforeEach, describe, expect, it, vi } from "vitest";
import { BSON, ObjectId, type Db, type Document } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  getDb: vi.fn(),

  turn: 100,
}));
vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: mocks.run,
  RequiredTransactionCleanupError: class extends Error {},
}));
vi.mock("@/lib/mongodb", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/gameState", () => ({ getGameState: async () => ({ currentTurn: mocks.turn }) }));
vi.mock("@/lib/utils/bannedCharacters", () => ({ getBannedCharacterIds: async () => new Set() }));
vi.mock("@/lib/wiki/markCongressLeadership", () => ({
  markCongressLeadershipHeld: vi.fn(async () => {}),
}));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
  createNotifications: vi.fn(),
}));
vi.mock("@/lib/discordWebhooks", () => ({
  sendCountryGameEvent: vi.fn(async () => {}),
  DISCORD_COLORS: {},
}));
vi.mock("@/lib/cabinet/officeCompatibility", () => ({
  getIncompatibleOfficeHolders: async () => new Set(),
}));
vi.mock("@/lib/analytics/officeTransitionAnalytics", () => ({
  captureOfficeTransition: vi.fn(async () => {}),
}));
vi.mock("@/lib/achievements", () => ({
  awardAchievement: vi.fn(),
  resolveUserIdFromCharacter: vi.fn(),
}));
vi.mock("@/lib/achievements/triggers", () => ({ checkOfficeHeldAchievements: vi.fn() }));

import { createNotification, createNotifications } from "@/lib/notifications";
import { sendCountryGameEvent } from "@/lib/discordWebhooks";

let memory: InMemoryDb;
let db: Db;
let fault: string | undefined;
let faultAfter: number;
let activeSession: object | undefined;
let retryCallback: boolean;
let commands: string[];
let competingCommit: (() => void) | undefined;
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

  mocks.turn = 100;
  memory = createInMemoryDb();
  fault = undefined;
  faultAfter = 1;
  retryCallback = false;
  competingCommit = undefined;
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
                if (fault === `${name}.${String(method)}` && --faultAfter === 0) {
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
    let saved = snapshot();
    activeSession = {};
    try {
      if (retryCallback) {
        retryCallback = false;
        await body(activeSession);
        restore(saved);
        competingCommit?.();
        saved = snapshot();
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

vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: async () => ({ currentTurn: 100, effectiveNow: now }),
}));
vi.mock("@/lib/api/requireAuth", () => ({
  requireBasicAuth: async () => ({ ok: true, user: { userId: "000000000000000000000001" } }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  CONGRESS_LIMITS: {},
}));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn(async () => {}) }));
vi.mock("@/lib/cabinet/liveGameYear", () => ({
  getLiveGameYear: async () => 2027,
  getManuallyEnabledSeats: async () => new Set(),
}));

import { COUNTRY_CONFIGS, getSubNationalLegislatureKey } from "@/lib/constants/countries";
import { mergePartyInto } from "@/lib/parties/mergeParty";
import { attemptResolution } from "@/lib/parties/proposals";
import { admitPartyToCoalition } from "@/lib/coalitions/admitParty";
import { processImpeachmentLifecycle } from "@/lib/turn/impeachmentLifecycle";
import { removeImpeachedGovernor } from "@/lib/impeachment/removeImpeachedExecutive";
import {
  proposeNoConfidence,
  triggerPrimeMinisterSnapElection,
} from "@/lib/government/commands/parliamentaryGovernment";
import { adminAppointPrimeMinister } from "@/lib/government/commands/appointments";
import { appointActingCabinetMember } from "@/lib/cabinet/appointActing";

function assertRestored(saved: Record<string, Document[]>) {
  for (const name of Object.keys(saved)) expect(memory.collection(name).docs).toEqual(saved[name]);
  for (const [name, col] of memory.collections) if (!(name in saved)) expect(col.docs).toEqual([]);
  expect(notices()).toBe(0);
}
function seedParties() {
  memory.seed("politicalParties", [
    {
      _id: holder,
      countryId: "CA",
      sequentialId: 1,
      treasury: 10000000000.25,
      committeeIds: [winner],
    },
    { _id: electionId, countryId: "CA", sequentialId: 2, treasury: 50.5, committeeIds: [] },
  ]);
  memory.seed("characters", [{ _id: winner, countryId: "CA", party: "1", partyInfluence: 20 }]);
  memory.seed("statePartyOrg", [
    {
      _id: "ON_1",
      countryId: "CA",
      stateId: "ON",
      partyId: "1",
      organizationUnits: 10,
      organization: 10,
      treasury: 123.25,
    },
    {
      _id: "ON_2",
      countryId: "CA",
      stateId: "ON",
      partyId: "2",
      organizationUnits: 20,
      organization: 20,
      treasury: 456.75,
    },
  ]);
  memory.seed("electedOfficials", [
    {
      _id: new ObjectId(),
      characterId: winner,
      countryId: "CA",
      party: "1",
      officeType: "caCommons",
      state: "ON",
    },
  ]);
  memory.seed("electionCandidates", [
    { _id: new ObjectId(), characterId: winner, party: "1", countryId: "CA", status: "active" },
  ]);
}
const merge = () =>
  mergePartyInto(db, holder, electionId, 100, { requireAdjacency: false, enforceNppCap: false });
function seedInvite() {
  memory.seed("politicalParties", [{ _id: holder, sequentialId: 1, coalitionId: null }]);
  memory.seed("coalitions", [
    {
      _id: electionId,
      pendingInvites: [{ partyId: holder }],
      joinRequests: [{ partyId: holder }],
      members: [],
    },
  ]);
}
const admit = (from: "pendingInvites" | "joinRequests") =>
  admitPartyToCoalition(db, { _id: electionId }, { _id: holder, sequentialId: 1 }, from, now);
function seedGovernment() {
  memory.seed("gameState", [
    { _id: "current", currentTurn: 100, startingYear: 2027, preset: "2027-default" },
  ]);
  memory.seed("countryState", [{ _id: "CA", governmentType: "parliamentaryMonarchy" }]);
  memory.seed("governmentFormations", [
    {
      _id: "CA",
      status: "formed",
      pmCharacterId: holder,
      pmNppId: null,
      activeVoteId: null,
      pmName: "PM",
      majorityThreshold: 1,
      governingPartyId: "1",
      snapElectionsUsed: 0,
    },
  ]);
  memory.seed("characters", [
    {
      _id: holder,
      userId: new ObjectId(),
      name: "PM",
      countryId: "CA",
      currentOffice: { type: "primeMinister", state: "ON" },
      party: "1",
    },
    {
      _id: winner,
      userId: new ObjectId(),
      name: "MP",
      countryId: "CA",
      currentOffice: { type: "caCommons", state: "ON" },
      party: "1",
    },
  ]);
  memory.seed("electedOfficials", [
    {
      _id: new ObjectId(),
      characterId: holder,
      countryId: "CA",
      officeType: "caCommons",
      state: "ON",
      constituencyId: "ON-1",
      party: "1",
    },
    {
      _id: new ObjectId(),
      characterId: winner,
      countryId: "CA",
      officeType: "caCommons",
      state: "ON",
      constituencyId: "ON-2",
      party: "1",
    },
  ]);
  memory.seed("politicalParties", [{ _id: electionId, countryId: "CA", sequentialId: 1 }]);
  memory.seed("states", [{ _id: "ON", countryId: "CA", name: "Ontario", population: 1000 }]);
  memory.seed("bills", [
    { _id: new ObjectId(), countryId: "CA", currentChamber: "caCommons", status: "active" },
  ]);
}
const noConfidence = () =>
  proposeNoConfidence(db, "CA", "000000000000000000000002", { _id: winner, name: "MP" });
const snap = () => triggerPrimeMinisterSnapElection(db, "CA", { _id: holder, name: "PM" });
function seedImpeachment(governor: boolean) {
  memory.seed("characters", [
    {
      _id: holder,
      countryId: "US",
      currentOffice: { type: governor ? "governor" : "president", state: "TX" },
    },
  ]);
  memory.seed("electedOfficials", [
    {
      _id: electionId,
      countryId: "US",
      officeType: governor ? "governor" : "president",
      state: "TX",
      characterId: holder,
    },
    {
      _id: new ObjectId(),
      countryId: "US",
      officeType: governor ? getSubNationalLegislatureKey("US") : "senate",
      state: "TX",
      characterId: winner,
      seatsHeld: 10,
    },
  ]);
  memory.seed("impeachments", [
    {
      _id: new ObjectId(),
      countryId: "US",
      targetOffice: governor ? "governor" : "president",
      targetCharacterId: holder,
      state: "TX",
      stage: "senate",
      senateVotingEndsOnTurn: 99,
      senateVotes: { [winner.toString()]: "aye" },
    },
  ]);
}
function seedActing() {
  memory.seed("characters", [
    {
      _id: holder,
      userId: new ObjectId("000000000000000000000001"),
      name: "President",
      countryId: "US",
      party: "1",
    },
    { _id: winner, userId: new ObjectId(), name: "Nominee", countryId: "US", party: "1" },
  ]);
  memory.seed("electedOfficials", [
    {
      _id: electionId,
      countryId: "US",
      officeType: "president",
      characterId: holder,
      electedAt: now,
    },
  ]);
}
const acting = () =>
  appointActingCabinetMember(
    new Request("http://localhost/acting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: "secretary_of_treasury", characterId: winner.toString() }),
    }),
    "US"
  );

describe("political command interruption and race recovery", () => {
  it.each(["politicalParties.updateOne", "statePartyOrg.bulkWrite", "electedOfficials.updateMany"])(
    "conserves merger cash and seats after %s fails",
    async (operation) => {
      seedParties();
      const saved = snapshot();
      fault = operation;
      await expect(merge()).rejects.toThrow();
      assertRestored(saved);
      retryCallback = true;
      await merge();
      const parties = memory.collection("politicalParties").docs;
      expect(parties[0].treasury).toBe(0);
      expect(parties[1].treasury).toBe(10000000050.75);
      expect(memory.collection("characters").docs[0]).toMatchObject({
        party: "2",
        partyInfluence: 10,
      });
      expect(memory.collection("electedOfficials").docs[0].party).toBe("2");
      expect(memory.collection("electionCandidates").docs[0].party).toBe("2");
      expect(memory.collection("statePartyOrg").docs[0].treasury).toBe(580);
      const committed = snapshot();
      await merge();
      expect(snapshot()).toEqual(committed);
    }
  );
  it("preserves negative balances and a treasury in a region with no organization", async () => {
    seedParties();
    memory.collection("politicalParties").docs[0].treasury = -125.5;
    memory.collection("statePartyOrg").docs[0].organizationUnits = 0;
    memory.collection("statePartyOrg").docs[0].treasury = -123.25;
    await merge();
    expect(memory.collection("politicalParties").docs[1].treasury).toBe(-75);
    expect(memory.collection("statePartyOrg").docs[0].treasury).toBe(333.5);
  });
  it("retains a cash-only regional treasury when the target has no row", async () => {
    seedParties();
    memory.collection("statePartyOrg").docs.splice(1, 1);
    memory.collection("statePartyOrg").docs[0].organizationUnits = 0;
    await merge();
    expect(memory.collection("statePartyOrg").docs[0]).toMatchObject({
      _id: "ON_2",
      treasury: 123.25,
      organizationUnits: 0,
      hasPresence: false,
    });
  });
  it("rejects an overflowing treasury sum without changing either party", async () => {
    seedParties();
    memory.collection("politicalParties").docs.forEach((row) => {
      row.treasury = Number.MAX_VALUE;
    });
    const saved = snapshot();
    await expect(merge()).rejects.toThrow("Invalid party treasury");
    assertRestored(saved);
  });
  it("does not re-credit a merger committed by another resolver", async () => {
    seedParties();
    retryCallback = true;
    competingCommit = () => {
      const rows = memory.collection("politicalParties").docs;
      Object.assign(rows[0], { isDefunct: true, mergedIntoPartyId: electionId, treasury: 0 });
      rows[1].treasury = 10000000050.75;
    };
    await merge();
    expect(memory.collection("politicalParties").docs[1].treasury).toBe(10000000050.75);
  });
  it.each([false, true])(
    "rolls back convicted status and office removal (governor %s)",
    async (governor) => {
      seedImpeachment(governor);
      const saved = snapshot();
      fault = "characters.updateOne";
      await expect(processImpeachmentLifecycle(db, 100, now)).rejects.toThrow();
      assertRestored(saved);
      retryCallback = true;
      await processImpeachmentLifecycle(db, 100, now);
      expect(memory.collection("impeachments").docs[0].stage).toBe("convicted");
      expect(memory.collection("electedOfficials").docs[0].characterId).toBeNull();
      const committed = snapshot();
      await processImpeachmentLifecycle(db, 100, now);
      expect(snapshot()).toEqual(committed);
    }
  );
  it.each([false, true])(
    "preserves a replacement executive during conviction (governor %s)",
    async (governor) => {
      seedImpeachment(governor);
      retryCallback = true;
      competingCommit = () => {
        memory.collection("electedOfficials").docs[0].characterId = winner;
      };
      await processImpeachmentLifecycle(db, 100, now);
      expect(memory.collection("impeachments").docs[0].stage).toBe("cancelled");
      expect(memory.collection("electedOfficials").docs[0].characterId).toEqual(winner);
      expect(memory.collection("characters").docs[0].careerHistory).toBeUndefined();
    }
  );
  it("commits batched House advancement once after an interrupted write", async () => {
    seedImpeachment(false);
    const caseDoc = memory.collection("impeachments").docs[0];
    Object.assign(caseDoc, {
      stage: "house",
      houseVotingEndsOnTurn: 99,
      houseVotes: { [winner.toString()]: "aye" },
    });
    memory.collection("electedOfficials").docs[1].officeType = "house";
    const saved = snapshot();
    fault = "impeachments.bulkWrite";
    await expect(processImpeachmentLifecycle(db, 100, now)).rejects.toThrow();
    assertRestored(saved);
    retryCallback = true;
    await processImpeachmentLifecycle(db, 100, now);
    expect(memory.collection("impeachments").docs[0].stage).toBe("senate");
    expect(memory.collection("electedOfficials").docs[0].characterId).toEqual(holder);
  });
  it("rejects a direct removal naming the former governor", async () => {
    seedImpeachment(true);
    memory.collection("electedOfficials").docs[0].characterId = winner;
    await expect(removeImpeachedGovernor(db, "US", "TX", holder, now)).rejects.toThrow(
      "no longer holds"
    );
    expect(memory.collection("electedOfficials").docs[0].characterId).toEqual(winner);
  });
  it.each(["pendingInvites", "joinRequests"] as const)(
    "recovers interrupted coalition admission from %s",
    async (from) => {
      seedInvite();
      const saved = snapshot();
      fault = "politicalParties.updateOne";
      await expect(admit(from)).rejects.toThrow();
      assertRestored(saved);
      retryCallback = true;
      expect(await admit(from)).toBe(true);
      expect(await admit(from)).toBe(false);
      expect(memory.collection("coalitions").docs[0].members).toHaveLength(1);
      expect(memory.collection("politicalParties").docs[0].coalitionId).toEqual(electionId);
    }
  );
  it.each(["pendingInvites", "joinRequests"] as const)(
    "preserves a competing coalition admission from %s",
    async (from) => {
      seedInvite();
      const other = new ObjectId();
      retryCallback = true;
      competingCommit = () => {
        memory.collection("politicalParties").docs[0].coalitionId = other;
      };
      expect(await admit(from)).toBe(false);
      expect(memory.collection("coalitions").docs[0].members).toEqual([]);
      expect(memory.collection("politicalParties").docs[0].coalitionId).toEqual(other);
    }
  );
  it.each(["noConfidenceVotes.insertOne", "governmentFormations.findOneAndUpdate"])(
    "rolls back motion creation after %s",
    async (operation) => {
      seedGovernment();
      const saved = snapshot();
      fault = operation;
      await expect(noConfidence()).rejects.toThrow();
      assertRestored(saved);
      retryCallback = true;
      await noConfidence();
      expect(memory.collection("noConfidenceVotes").docs).toHaveLength(1);
      expect(memory.collection("governmentFormations").docs[0].activeVoteId).toEqual(
        memory.collection("noConfidenceVotes").docs[0]._id
      );
      await expect(noConfidence()).rejects.toThrow("already in progress");
    }
  );
  it("keeps a concurrently filed no-confidence motion", async () => {
    seedGovernment();
    retryCallback = true;
    const other = new ObjectId();
    competingCommit = () => {
      memory.collection("governmentFormations").docs[0].activeVoteId = other;
      memory
        .collection("noConfidenceVotes")
        .docs.push({ _id: other, countryId: "CA", status: "active" });
    };
    await expect(noConfidence()).rejects.toThrow("already in progress");
    expect(memory.collection("noConfidenceVotes").docs).toHaveLength(1);
    expect(notices()).toBe(0);
  });
  it("rolls back an interrupted PM dissolution", async () => {
    seedGovernment();
    const saved = snapshot();
    fault = "electedOfficials.deleteMany";
    await expect(snap()).rejects.toThrow();
    assertRestored(saved);
    retryCallback = true;
    await snap();
    expect(memory.collection("elections").docs).toHaveLength(1);
  });
  it("rechecks PM authority when the transaction retries", async () => {
    seedGovernment();
    retryCallback = true;
    competingCommit = () => {
      memory.collection("governmentFormations").docs[0].pmCharacterId = winner;
    };
    await expect(snap()).rejects.toThrow("Only the sitting PM");
    expect(memory.collection("elections").docs).toHaveLength(0);
    expect(notices()).toBe(0);
    expect(memory.collection("bills").docs[0].status).toBe("active");
  });
  it.each(["actingAppointmentCharges.insertOne", "cabinetMembers.insertOne"])(
    "rolls back acting appointment and charge after %s",
    async (operation) => {
      seedActing();
      const saved = snapshot();
      fault = operation;
      expect((await acting()).status).toBe(500);
      assertRestored(saved);
      retryCallback = true;
      expect((await acting()).status).toBe(200);
      expect(memory.collection("actingAppointmentCharges").docs).toHaveLength(1);
      expect(memory.collection("cabinetMembers").docs).toHaveLength(1);
      expect((await acting()).status).toBe(409);
    }
  );
  it("does not let a former President spend an acting charge", async () => {
    seedActing();
    retryCallback = true;
    competingCommit = () => {
      memory.collection("electedOfficials").docs[0].characterId = winner;
    };
    expect((await acting()).status).toBe(403);
    expect(memory.collection("actingAppointmentCharges").docs).toHaveLength(0);
    expect(memory.collection("cabinetMembers").docs).toHaveLength(0);
    expect(notices()).toBe(0);
  });
  it("does not charge for a seat filled by a competing appointment", async () => {
    seedActing();
    retryCallback = true;
    competingCommit = () => {
      memory.collection("cabinetMembers").docs.push({
        _id: new ObjectId(),
        countryId: "US",
        positionId: "secretary_of_treasury",
        characterId: new ObjectId(),
      });
    };
    expect((await acting()).status).toBe(409);
    expect(memory.collection("actingAppointmentCharges").docs).toHaveLength(0);
    expect(notices()).toBe(0);
  });
  it.each(["cabinetMembers.deleteMany", "characters.updateOne"])(
    "atomically restores offices on admin removal after %s",
    async (operation) => {
      seedGovernment();
      memory.collection("characters").docs[1].currentOffice = {
        type: "parliamentaryCabinet",
        positionId: "minister_of_finance",
      };
      memory.seed("cabinetMembers", [
        {
          _id: new ObjectId(),
          countryId: "CA",
          positionId: "minister_of_finance",
          characterId: winner,
        },
      ]);
      const run = () => adminAppointPrimeMinister(db, "staff", "CA", COUNTRY_CONFIGS.CA, null);
      const saved = snapshot();
      fault = operation;
      await expect(run()).rejects.toThrow();
      assertRestored(saved);
      retryCallback = true;
      await run();
      expect(memory.collection("cabinetMembers").docs).toEqual([]);
      expect(memory.collection("characters").docs.map((c) => c.currentOffice)).toEqual([
        expect.objectContaining({ type: "caCommons", constituencyId: "ON-1" }),
        expect.objectContaining({ type: "caCommons", constituencyId: "ON-2" }),
      ]);
      const committed = snapshot();
      await run();
      expect(memory.collection("characters").docs).toEqual(committed.characters);
    }
  );
  it("restores an NPP PM's retained seats on admin removal", async () => {
    seedGovernment();
    const npp = new ObjectId();
    Object.assign(memory.collection("governmentFormations").docs[0], {
      pmCharacterId: null,
      pmNppId: npp,
    });
    memory.collection("characters").docs[0].currentOffice = { type: "caCommons", state: "ON" };
    memory.seed("npps", [{ _id: npp, countryId: "CA", currentOffice: { type: "primeMinister" } }]);
    memory.collection("electedOfficials").docs.push({
      _id: new ObjectId(),
      countryId: "CA",
      officeType: "caCommons",
      characterId: null,
      nppId: npp,
      state: "ON",
      seatsHeld: 5,
    });
    await adminAppointPrimeMinister(db, "staff", "CA", COUNTRY_CONFIGS.CA, null);
    expect(memory.collection("governmentFormations").docs[0]).toMatchObject({
      pmCharacterId: null,
      pmNppId: null,
    });
    expect(memory.collection("npps").docs[0].currentOffice).toMatchObject({
      type: "caCommons",
      state: "ON",
      seatsHeld: 5,
    });
  });
  it("seats an admin-appointed Canadian PM once with the correct chamber tally", async () => {
    seedGovernment();
    retryCallback = true;
    const run = () =>
      adminAppointPrimeMinister(db, "staff", "CA", COUNTRY_CONFIGS.CA, winner.toString());
    await run();
    expect(memory.collection("governmentFormations").docs[0]).toMatchObject({
      pmCharacterId: winner,
      totalSeatsSupporting: 2,
    });
    expect(memory.collection("characters").docs[0].currentOffice).toMatchObject({
      type: "caCommons",
      constituencyId: "ON-1",
    });
    expect(memory.collection("characters").docs[1].careerHistory).toHaveLength(1);
    await run();
    expect(memory.collection("characters").docs[1].careerHistory).toHaveLength(1);
  });
  it("retains a parliamentary seat won while an admin removal retries", async () => {
    seedGovernment();
    retryCallback = true;
    competingCommit = () => {
      memory.collection("electedOfficials").docs[0].constituencyId = "ON-new";
    };
    await adminAppointPrimeMinister(db, "staff", "CA", COUNTRY_CONFIGS.CA, null);
    expect(memory.collection("characters").docs[0].currentOffice).toMatchObject({
      type: "caCommons",
      constituencyId: "ON-new",
    });
  });
  it.each(["effect", "terminal"] as const)(
    "retries proposal resolution after interrupted %s without a durable partial claim",
    async (stage) => {
      seedParties();
      const proposal = {
        _id: new ObjectId(),
        countryId: "CA",
        partyId: holder,
        type: "electionDuration",
        status: "open",
        electionDuration: { durationTurns: 12 },
        proposingVotes: [{ voterId: winner, vote: "yes" }],
      };
      memory.seed("committeeProposals", [proposal]);
      const saved = snapshot();
      fault = stage === "effect" ? "politicalParties.updateOne" : "committeeProposals.updateOne";
      faultAfter = stage === "terminal" ? 2 : 1;
      await expect(attemptResolution(db, proposal as never, 100)).rejects.toThrow();
      assertRestored(saved);
      retryCallback = true;
      await attemptResolution(db, proposal as never, 100);
      expect(memory.collection("committeeProposals").docs[0].status).toBe("passed");
      expect(memory.collection("politicalParties").docs[0].customElectionDurationTurns).toBe(12);
      const committed = snapshot();
      await attemptResolution(db, proposal as never, 100);
      expect(snapshot()).toEqual(committed);
    }
  );
  it("uses current ballots rather than a stale proposal passed by its caller", async () => {
    seedParties();
    const proposal = {
      _id: new ObjectId(),
      countryId: "CA",
      partyId: holder,
      type: "electionDuration",
      status: "open",
      electionDuration: { durationTurns: 12 },
      proposingVotes: [{ voterId: winner, vote: "yes" }],
    };
    memory.seed("committeeProposals", [
      { ...proposal, proposingVotes: [{ voterId: winner, vote: "no" }] },
    ]);
    await attemptResolution(db, proposal as never, 100);
    expect(memory.collection("committeeProposals").docs[0].status).toBe("rejected");
    expect(
      memory.collection("politicalParties").docs[0].customElectionDurationTurns
    ).toBeUndefined();
  });
  it("does not apply an effect after a competing resolver closes the proposal", async () => {
    seedParties();
    const proposal = {
      _id: new ObjectId(),
      countryId: "CA",
      partyId: holder,
      type: "electionDuration",
      status: "open",
      electionDuration: { durationTurns: 12 },
      proposingVotes: [{ voterId: winner, vote: "yes" }],
    };
    memory.seed("committeeProposals", [proposal]);
    retryCallback = true;
    competingCommit = () => {
      memory.collection("committeeProposals").docs[0].status = "rejected";
    };
    await attemptResolution(db, proposal as never, 100);
    expect(
      memory.collection("politicalParties").docs[0].customElectionDurationTurns
    ).toBeUndefined();
  });
});
