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
  requireAuth: async () => ({ ok: true, user: { userId: "000000000000000000000001" } }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  CONGRESS_LIMITS: {},
}));

import { appointSenator } from "@/lib/government/commands/appointments";
import { buildVoterPartyAndWeightMaps } from "@/lib/congress/governmentVoteBreakdown";
import { resignPosition } from "@/lib/settings/resignations";
import { resignCabinetMemberHandler } from "@/lib/countries/uk/cabinetApi";
import { updateParliamentaryGovernmentSeats } from "@/lib/turn/parliamentaryGovernment";
import { triggerSnapElection } from "@/lib/elections/resolution/snapElection";
import { vacateInactiveNationalLeadership } from "@/lib/elections/party/nationalPartyElections";

function request(body: unknown) {
  return new Request("http://localhost/cabinet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function assertRestored(saved: Record<string, Document[]>) {
  for (const name of Object.keys(saved)) expect(memory.collection(name).docs).toEqual(saved[name]);
  expect(notices()).toBe(0);
}
function seedSenate(vacancy = false) {
  memory.seed("characters", [
    {
      _id: holder,
      userId: new ObjectId("000000000000000000000001"),
      countryId: "US",
      homeState: "IL",
    },
    {
      _id: winner,
      userId: new ObjectId(),
      name: "Nominee",
      countryId: "US",
      homeState: "IL",
      party: "1",
    },
  ]);
  memory.seed("electedOfficials", [
    { _id: electionId, countryId: "US", officeType: "governor", state: "IL", characterId: holder },
    ...(vacancy
      ? [
          {
            _id: new ObjectId(),
            countryId: "US",
            officeType: "senate",
            state: "IL",
            senateClass: 2,
            characterId: null,
            nppId: null,
          },
        ]
      : []),
  ]);
}
const appoint = () =>
  appointSenator(db, "000000000000000000000001", {
    appointeeId: winner.toString(),
    appointeeType: "character",
    senateClass: 2,
  });
function seedMinister(countryId: "UK" | "CA" = "CA", second = false) {
  const positionId = countryId === "CA" ? "minister_of_finance" : "chancellor";
  memory.seed("characters", [
    {
      _id: winner,
      userId: new ObjectId("000000000000000000000001"),
      countryId,
      name: "Minister",
      currentOffice: {
        type: countryId === "UK" ? "ukCabinet" : "parliamentaryCabinet",
        positionId,
      },
    },
  ]);
  memory.seed("cabinetMembers", [
    { _id: electionId, countryId, positionId, characterId: winner },
    ...(second
      ? [
          {
            _id: new ObjectId(),
            countryId,
            positionId: "deputy_prime_minister",
            characterId: winner,
            roleSlot: "central",
          },
        ]
      : []),
  ]);
  memory.seed("electedOfficials", [
    {
      _id: new ObjectId(),
      countryId,
      officeType: countryId === "CA" ? "caCommons" : "commons",
      constituencyId: countryId === "CA" ? "ON-1" : "ENG-1",
      state: countryId === "UK" ? "ENG" : "ON",
      characterId: winner,
    },
  ]);
  memory.seed("gameConfig", [{ _id: "default", governmentConfidenceEnabled: false }]);
  return positionId;
}
function seedGovernment() {
  seedMinister();
  memory.seed("governmentFormations", [
    {
      _id: "CA",
      status: "formed",
      pmCharacterId: holder,
      pmName: "PM",
      formedTurn: 1,
      majorityThreshold: 1,
      governingPartyId: "1",
      seatsByParty: { "1": 1 },
    },
  ]);
  memory
    .collection("characters")
    .docs.push({ _id: holder, countryId: "CA", currentOffice: { type: "primeMinister" } });
  memory.seed("gameState", [{ _id: "current", preset: "2027-default", currentTurn: 100 }]);
}
function seedSnap() {
  seedGovernment();
  memory.collection("governmentFormations").docs[0].status = "pending";
  memory.collection("governmentFormations").docs[0].pmCharacterId = null;
  memory.collection("governmentFormations").docs[0].pmVacancyDeadlineTurn = 99;
  memory.seed("states", [{ _id: "ON", countryId: "CA", name: "Ontario", population: 1000 }]);
  memory.seed("bills", [
    { _id: new ObjectId(), countryId: "CA", currentChamber: "caCommons", status: "active" },
  ]);
}
const snap = () => triggerSnapElection(db, "CA", now, { reason: "auto-snap", bypassLimits: true });
function seedInactiveChair() {
  memory.seed("politicalParties", [
    {
      _id: electionId,
      countryId: "CA",
      sequentialId: 1,
      chairId: holder,
      viceChairId: null,
      treasurerId: null,
    },
  ]);
  memory.seed("coalitions", [
    { _id: new ObjectId(), chairPartyId: electionId, chairCharacterId: holder, countryId: "CA" },
  ]);
  const userId = new ObjectId();
  memory.seed("characters", [{ _id: holder, userId, countryId: "CA" }]);
  memory.seed("users", [{ _id: userId, lastActivity: new Date(0), createdAt: new Date(0) }]);
}

describe("political exit interruption and race recovery", () => {
  it("includes legacy untagged US Senate appointments without including foreign seats", async () => {
    seedSenate();
    memory.collection("electedOfficials").docs.push({
      _id: new ObjectId(),
      officeType: "senate",
      state: "IL",
      senateClass: 2,
      characterId: winner,
    });
    memory.collection("electedOfficials").docs.push({
      _id: new ObjectId(),
      countryId: "CA",
      officeType: "senate",
      characterId: holder,
    });
    const maps = await buildVoterPartyAndWeightMaps(db, "US", "senate", [
      winner.toString(),
      holder.toString(),
    ]);
    expect(maps.weightMap.get(winner.toString())).toBe(1);
    expect(maps.weightMap.has(holder.toString())).toBe(false);
  });
  it("keeps NPP Senate appointment and voting identity atomic", async () => {
    seedSenate();
    memory.seed("npps", [
      { _id: winner, countryId: "US", homeState: "IL", name: "Synthetic NPP", party: "1" },
    ]);
    const run = () =>
      appointSenator(db, "000000000000000000000001", {
        appointeeId: winner.toString(),
        appointeeType: "npp",
        senateClass: 2,
      });
    const saved = snapshot();
    fault = "npps.updateOne";
    await expect(run()).rejects.toThrow("interrupted resolution");
    assertRestored(saved);
    retryCallback = true;
    await run();
    expect(
      memory.collection("electedOfficials").docs.find((d) => d.officeType === "senate")
    ).toMatchObject({ countryId: "US", isNPP: true, nppId: winner });
    const maps = await buildVoterPartyAndWeightMaps(db, "US", "senate", [`npp_${winner}`]);
    expect(maps.weightMap.get(`npp_${winner}`)).toBe(1);
  });
  it.each([false, true])(
    "keeps Senate seating and voting identity atomic (existing vacancy %s)",
    async (vacancy) => {
      seedSenate(vacancy);
      const saved = snapshot();
      fault = "characters.updateOne";
      await expect(appoint()).rejects.toThrow("interrupted resolution");
      assertRestored(saved);
      retryCallback = true;
      await appoint();
      expect(
        memory.collection("electedOfficials").docs.find((d) => d.officeType === "senate")
      ).toMatchObject({ countryId: "US", characterId: winner });
      const tally = await buildVoterPartyAndWeightMaps(db, "US", "senate", [winner.toString()]);
      expect(tally.weightMap.get(winner.toString())).toBe(1);
      const committed = snapshot();
      await expect(appoint()).rejects.toThrow("No vacancy");
      expect(snapshot()).toEqual(committed);
    }
  );
  it.each([false, true])(
    "does not overwrite a competing Senate appointee (existing vacancy %s)",
    async (vacancy) => {
      seedSenate(vacancy);
      retryCallback = true;
      competingCommit = () => {
        const col = memory.collection("electedOfficials");
        const seat = col.docs.find((d) => d.officeType === "senate");
        const rival = {
          countryId: "US",
          officeType: "senate",
          state: "IL",
          senateClass: 2,
          characterId: new ObjectId(),
        };
        if (seat) Object.assign(seat, rival);
        else col.docs.push({ _id: new ObjectId(), ...rival });
      };
      await expect(appoint()).rejects.toThrow("No vacancy");
      expect(
        memory.collection("electedOfficials").docs.filter((d) => d.officeType === "senate")
      ).toHaveLength(1);
      expect(memory.collection("characters").docs[1].currentOffice).toBeUndefined();
      expect(notices()).toBe(0);
    }
  );
  it.each(["settings", "cabinet-ui"] as const)(
    "restores a minister's legislative seat and retries %s",
    async (entry) => {
      const positionId = seedMinister();
      const run = () =>
        entry === "settings"
          ? resignPosition(
              db,
              memory.collection("characters").docs[0] as never,
              `cabinet:${electionId}`
            )
          : resignCabinetMemberHandler(request({ positionId }), "CA");
      const saved = snapshot();
      fault = "characters.updateOne";
      if (entry === "settings") await expect(run()).rejects.toThrow("interrupted resolution");
      else expect(((await run()) as Response).status).toBe(500);
      assertRestored(saved);
      retryCallback = true;
      await run();
      expect(memory.collection("cabinetMembers").docs).toHaveLength(0);
      expect(memory.collection("characters").docs[0].currentOffice).toMatchObject({
        type: "caCommons",
        state: "ON",
      });
    }
  );
  it.each(["settings", "cabinet-ui"] as const)(
    "preserves a UK surviving ministry through %s",
    async (entry) => {
      const positionId = seedMinister("UK", true);
      const run = () =>
        entry === "settings"
          ? resignPosition(
              db,
              memory.collection("characters").docs[0] as never,
              `cabinet:${electionId}`
            )
          : resignCabinetMemberHandler(request({ positionId }), "UK");
      const saved = snapshot();
      fault = "characters.updateOne";
      if (entry === "settings") await expect(run()).rejects.toThrow();
      else expect(((await run()) as Response).status).toBe(500);
      assertRestored(saved);
      retryCallback = true;
      await run();
      expect(memory.collection("cabinetMembers").docs).toHaveLength(1);
      expect(memory.collection("characters").docs[0].currentOffice).toMatchObject({
        type: "ukCabinet",
        positionId: "deputy_prime_minister",
      });
    }
  );
  it.each(["settings", "cabinet-ui"] as const)(
    "does not remove a replacement minister through %s",
    async (entry) => {
      const positionId = seedMinister();
      retryCallback = true;
      competingCommit = () => {
        memory.collection("cabinetMembers").docs[0].characterId = holder;
        memory.collection("characters").docs[0].currentOffice = { type: "caCommons", state: "ON" };
      };
      const result = await (entry === "settings"
        ? resignPosition(
            db,
            memory.collection("characters").docs[0] as never,
            `cabinet:${electionId}`
          )
        : resignCabinetMemberHandler(request({ positionId }), "CA"));
      if (entry === "settings") expect(result).toMatchObject({ ok: false, status: 404 });
      else expect((result as Response).status).toBe(404);
      expect(memory.collection("cabinetMembers").docs[0].characterId).toEqual(holder);
      expect(notices()).toBe(0);
    }
  );
  it("rolls back a lost-seat government collapse before retry", async () => {
    seedGovernment();
    const saved = snapshot();
    fault = "cabinetMembers.deleteMany";
    await expect(updateParliamentaryGovernmentSeats(db, "CA", "2027-default")).rejects.toThrow();
    assertRestored(saved);
    retryCallback = true;
    await updateParliamentaryGovernmentSeats(db, "CA", "2027-default");
    expect(memory.collection("governmentFormations").docs[0]).toMatchObject({
      status: "pending",
      pmCharacterId: null,
    });
    expect(
      memory
        .collection("characters")
        .docs.find((d) => d._id instanceof ObjectId && d._id.equals(holder))?.currentOffice
    ).toBeNull();
    expect(memory.collection("characters").docs[0].currentOffice).toMatchObject({
      type: "caCommons",
    });
  });
  it("does not collapse a replacement PM after a transaction conflict", async () => {
    seedGovernment();
    retryCallback = true;
    competingCommit = () => {
      memory.collection("governmentFormations").docs[0].pmCharacterId = winner;
      memory.collection("characters").docs[0].currentOffice = {
        type: "primeMinister",
        state: "ON",
      };
    };
    await updateParliamentaryGovernmentSeats(db, "CA", "2027-default");
    expect(memory.collection("governmentFormations").docs[0]).toMatchObject({
      status: "formed",
      pmCharacterId: winner,
    });
  });
  it.each([
    "elections.insertMany",
    "electedOfficials.deleteMany",
    "governmentFormations.updateOne",
  ])("recovers snap dissolution interrupted at %s", async (point) => {
    seedSnap();
    const saved = snapshot();
    fault = point;
    await expect(snap()).rejects.toThrow();
    assertRestored(saved);
    retryCallback = true;
    await snap();
    expect(memory.collection("elections").docs).toHaveLength(1);
    expect(memory.collection("electedOfficials").docs).toHaveLength(0);
    expect(memory.collection("bills").docs[0].status).toBe("failed");
    const committed = snapshot();
    await snap();
    expect(snapshot()).toEqual(committed);
  });
  it.each(["auto-snap", "admin", "pm-trigger", "regime-change"] as const)(
    "keeps a competing committed snap batch on %s conflict retry",
    async (reason) => {
      seedSnap();
      retryCallback = true;
      competingCommit = () => {
        memory.seed("elections", [
          {
            _id: new ObjectId(),
            countryId: "CA",
            electionType: "snap_caCommons",
            status: "active",
          },
        ]);
        memory.collection("electedOfficials").docs = [];
        memory.collection("cabinetMembers").docs = [];
        memory.collection("bills").docs[0].status = "failed";
        memory.collection("governmentFormations").docs[0].lastSnapElectionTurn = 100;
      };
      const attempt = triggerSnapElection(db, "CA", now, { reason, bypassLimits: true });
      if (reason === "auto-snap") expect((await attempt).electionsSpawned).toBe(0);
      else await expect(attempt).rejects.toThrow("already in progress");
      expect(memory.collection("elections").docs).toHaveLength(1);
      expect(memory.collection("electedOfficials").docs).toHaveLength(0);
      expect(notices()).toBe(0);
    }
  );
  it.each(["inactivity", "settings"] as const)(
    "commits party and coalition chair removal together through %s",
    async (entry) => {
      seedInactiveChair();
      const run = () =>
        entry === "inactivity"
          ? vacateInactiveNationalLeadership(db, 100, now)
          : resignPosition(
              db,
              memory.collection("characters").docs[0] as never,
              `national-party:${electionId}:chairId`
            );
      const saved = snapshot();
      fault = "coalitions.updateMany";
      await expect(run()).rejects.toThrow();
      assertRestored(saved);
      retryCallback = true;
      await run();
      expect(memory.collection("politicalParties").docs[0].chairId).toBeNull();
      expect(memory.collection("coalitions").docs[0].chairCharacterId).toBeNull();
    }
  );
  it.each(["inactivity", "settings"] as const)(
    "does not clear a replacement party chair through %s",
    async (entry) => {
      seedInactiveChair();
      retryCallback = true;
      competingCommit = () => {
        memory.collection("politicalParties").docs[0].chairId = winner;
        memory.collection("coalitions").docs[0].chairCharacterId = winner;
      };
      await (entry === "inactivity"
        ? vacateInactiveNationalLeadership(db, 100, now)
        : resignPosition(
            db,
            memory.collection("characters").docs[0] as never,
            `national-party:${electionId}:chairId`
          ));
      expect(memory.collection("politicalParties").docs[0].chairId).toEqual(winner);
      expect(memory.collection("coalitions").docs[0].chairCharacterId).toEqual(winner);
      expect(notices()).toBe(0);
    }
  );
});
