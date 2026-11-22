import { beforeEach, describe, expect, it, vi } from "vitest";
import { BSON, ObjectId, type Db, type Document } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  getDb: vi.fn(),
  failBill: undefined as string | undefined,
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
vi.mock("@/lib/congress/governmentVoteBreakdown", () => ({
  computeCongressLeadershipTally: async () => ({ votesFor: 435 }),
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
vi.mock("@/lib/analytics/officeTransitionAnalytics", () => ({ captureOfficeTransition: vi.fn() }));
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
  mocks.failBill = undefined;
  mocks.turn = 100;
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

vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: async () => ({ currentTurn: 100, effectiveNow: now }),
}));
vi.mock("@/lib/congress/speaker/autoVoteNppsForVacate", () => ({
  autoVoteNppsForVacateMotion: async () => ({}),
}));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuth: async () => ({ ok: true, user: { userId: "000000000000000000000001" } }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  CONGRESS_LIMITS: {},
}));
vi.mock("@/lib/countries/uk/cabinetEligibility", () => ({
  requireCurrentPrimeMinister: async () => ({
    pmCharacterId: holder,
    pmCharacter: { _id: holder, name: "PM", countryId: "CA" },
  }),
  getCabinetEligibleChamberLabel: () => "Commons",
  getEligibleCabinetCharacters: vi.fn(),
}));
vi.mock("@/lib/legislature/chamberOfficeType", () => ({
  getCabinetEligibleOfficeTypes: () => ["commons"],
}));
vi.mock("@/lib/cabinet/liveGameYear", () => ({ getLiveGameYear: async () => 2027 }));
vi.mock("@/lib/countryState", () => ({
  getCountryState: async () => ({ governmentType: "parliamentaryMonarchy" }),
}));
vi.mock("@/lib/financialTxLog/expiresAt", () => ({ loadTurnLengthMinutes: async () => 60 }));
vi.mock("@/lib/legislationEffects", () => ({ applyLegislationEffect: vi.fn() }));
vi.mock("@/lib/billEnactment", () => ({
  onBillEnacted: async (_db: Db, bill: { _id: ObjectId }) => {
    if (mocks.failBill === bill._id.toString()) {
      mocks.failBill = undefined;
      mocks.turn = 100;
      throw new Error("interrupted bill");
    }
  },
}));
vi.mock("@/lib/analytics/billStatusAnalytics", () => ({ captureBillStatusChanged: vi.fn() }));

import { clearCabinetOnTransition } from "@/lib/cabinetTransition";
import { resolveSpeakerElection } from "@/lib/congress/speaker/resolveSpeakerElection";
import { resolveBundestagspraesidentElection } from "@/lib/congress/bundestagspraesident/resolveElection";
import { resolveNpcscChairElection } from "@/lib/congress/npcscChair/resolveElection";
import { resolveCppccChairElection } from "@/lib/congress/cppccChair/resolveElection";
import { resolveSpeakerVacateMotion } from "@/lib/congress/speaker/resolveVacateMotion";
import {
  appointCabinetMemberHandler,
  reshuffleCabinetHandler,
  fireCabinetMemberHandler,
  resignCabinetMemberHandler,
} from "@/lib/countries/uk/cabinetApi";
import { resolveCabinetNominationChoice } from "@/lib/cabinetNominationChoice";
import { expireLapsedActingAppointments } from "@/lib/cabinet/actingExpiry";
import { processFomcNominationLifecycle } from "@/lib/fomcNominationLifecycle";
import { processScotusNominationLifecycle } from "@/lib/turn/scotusNominationLifecycle";
import { runBillLifecycle } from "@/lib/turn/billLifecycle/engine";
import { applyCountryBillEffect } from "@/lib/turn/onePartyBillLifecycle";
import type { BillLifecycleConfig } from "@/lib/turn/billLifecycle/types";

function assertRestored(saved: Record<string, Document[]>) {
  for (const name of Object.keys(saved)) expect(memory.collection(name).docs).toEqual(saved[name]);
  expect(notices()).toBe(0);
}
function seedCabinet() {
  memory.seed("characters", [
    { _id: holder, countryId: "CA", userId: new ObjectId() },
    {
      _id: winner,
      name: "Minister",
      countryId: "CA",
      userId: new ObjectId(),
      careerHistory: [],
      currentOffice: { type: "parliamentaryCabinet", positionId: "minister_of_finance" },
    },
  ]);
  memory.seed("cabinetMembers", [
    {
      _id: new ObjectId(),
      countryId: "CA",
      positionId: "minister_of_finance",
      characterId: winner,
    },
  ]);
  memory.seed("electedOfficials", [
    {
      _id: new ObjectId(),
      countryId: "CA",
      officeType: "commons",
      state: "ON",
      characterId: winner,
    },
  ]);
  memory.seed("governmentFormations", [
    {
      _id: "CA",
      pmCharacterId: holder,
      cycle: 1,
      formedTurn: 1,
      status: "formed",
      reshuffleLog: [],
    },
  ]);
}
function request(body: unknown) {
  return new Request("http://localhost/cabinet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("remaining political interruption recovery", () => {
  it("restores Canada ministers and their elected offices atomically", async () => {
    seedCabinet();
    const saved = snapshot();
    fault = "characters.updateOne";
    await expect(clearCabinetOnTransition(db, "CA")).rejects.toThrow("interrupted resolution");
    assertRestored(saved);
    retryCallback = true;
    await clearCabinetOnTransition(db, "CA");
    expect(memory.collection("cabinetMembers").docs).toHaveLength(0);
    expect(memory.collection("characters").docs[1].currentOffice).toMatchObject({
      type: "commons",
      state: "ON",
    });
    const sent = notices();
    await clearCabinetOnTransition(db, "CA");
    expect(notices()).toBe(sent);
  });

  it.each([
    ["speaker", "speaker_of_the_house", resolveSpeakerElection],
    ["bundestagspraesident", "speaker_of_the_bundestag", resolveBundestagspraesidentElection],
    ["npcscChair", "chair_npcsc", resolveNpcscChairElection],
    ["cppccChair", "chair_cppcc", resolveCppccChairElection],
  ] as const)("rolls back %s nominations and seat before retry", async (prefix, role, resolve) => {
    memory.seed(`${prefix}Elections`, [{ _id: "current", status: "voting" }]);
    memory.seed(`${prefix}Nominations`, [
      {
        _id: electionId,
        status: "voting",
        nomineeId: winner,
        nomineeName: "Winner",
        createdAt: now,
        votes: {},
      },
    ]);
    memory.seed("congressLeaders", [{ _id: new ObjectId(), role, characterId: holder }]);
    const saved = snapshot();
    fault = "congressLeaders.updateOne";
    await expect(resolve(db, new Map(), true)).rejects.toThrow("interrupted resolution");
    assertRestored(saved);
    retryCallback = true;
    await resolve(db, new Map(), true);
    expect(memory.collection("congressLeaders").docs[0].characterId).toEqual(winner);
    expect(memory.collection(`${prefix}Elections`).docs[0].status).toBe("closed");
    const sent = notices();
    await resolve(db, new Map(), true);
    expect(notices()).toBe(sent);
  });

  it("retries removal and replacement ballot together", async () => {
    memory.seed("speakerVacateMotions", [{ _id: "current", status: "voting", votes: {} }]);
    memory.seed("congressLeaders", [
      { _id: new ObjectId(), role: "speaker_of_the_house", characterId: holder },
    ]);
    const saved = snapshot();
    fault = "speakerElections.updateOne";
    await expect(
      resolveSpeakerVacateMotion(db, { totalSeats: 435 } as never, true)
    ).rejects.toThrow("interrupted resolution");
    assertRestored(saved);
    retryCallback = true;
    await resolveSpeakerVacateMotion(db, { totalSeats: 435 } as never, true);
    expect(memory.collection("speakerVacateMotions").docs[0].status).toBe("passed");
    expect(memory.collection("congressLeaders").docs[0].characterId).toBeNull();
    expect(memory.collection("speakerElections").docs[0].status).toBe("voting");
    expect(await resolveSpeakerVacateMotion(db, { totalSeats: 435 } as never, true)).toBe(false);
  });

  it.each(["appoint", "reshuffle"] as const)(
    "restores the roster, careers and token after interrupted %s",
    async (kind) => {
      seedCabinet();
      if (kind === "appoint") {
        memory.collection("cabinetMembers").docs = [];
        memory.collection("characters").docs[1].currentOffice = { type: "commons", state: "ON" };
      }
      const body =
        kind === "appoint"
          ? { positionId: "minister_of_finance", characterId: winner.toString() }
          : {
              appointments: [{ positionId: "minister_of_finance", characterId: winner.toString() }],
            };
      const run = () =>
        kind === "appoint"
          ? appointCabinetMemberHandler(request(body), "CA")
          : reshuffleCabinetHandler(request(body), "CA");
      const saved = snapshot();
      fault = "characters.updateOne";
      expect((await run()).status).toBe(500);
      assertRestored(saved);
      retryCallback = true;
      expect((await run()).status).toBe(200);
      expect(memory.collection("cabinetMembers").docs).toHaveLength(1);
      expect(memory.collection("characters").docs[1].careerHistory).toHaveLength(1);
      expect((await run()).status).toBeGreaterThanOrEqual(400);
      expect(memory.collection("characters").docs[1].careerHistory).toHaveLength(1);
    }
  );

  it.each(["fire", "resign"] as const)(
    "restores a deleted seat after interrupted %s",
    async (kind) => {
      seedCabinet();
      memory.collection("characters").docs[1].userId = new ObjectId("000000000000000000000001");
      const run = () =>
        (kind === "fire" ? fireCabinetMemberHandler : resignCabinetMemberHandler)(
          request({ positionId: "minister_of_finance" }),
          "CA"
        );
      const saved = snapshot();
      fault = "characters.updateOne";
      expect((await run()).status).toBe(500);
      assertRestored(saved);
      retryCallback = true;
      expect((await run()).status).toBe(200);
      expect(memory.collection("cabinetMembers").docs).toHaveLength(0);
      expect(memory.collection("characters").docs[1].currentOffice).toMatchObject({
        type: "commons",
      });
      expect((await run()).status).toBe(404);
    }
  );

  function seedOffer() {
    memory.seed("cabinetNominations", [
      {
        _id: electionId,
        status: "awaiting_choice",
        countryId: "US",
        nomineeCharacterId: winner,
        proposedByPresidentId: holder,
        positionId: "secretary_of_treasury",
        choiceExpiresOnTurn: 101,
      },
    ]);
    memory.seed("electedOfficials", [
      { _id: new ObjectId(), countryId: "US", officeType: "president", characterId: holder },
    ]);
    memory.seed("characters", [
      { _id: winner, currentOffice: { type: "centralBankChair" }, userId: new ObjectId() },
    ]);
    memory.seed("centralBanks", [
      { _id: "USD", countryId: "US", chairCharacterId: winner, fomcBoard: [] },
    ]);
  }
  it("does not lose the bank role on interrupted acceptance", async () => {
    seedOffer();
    const saved = snapshot();
    fault = "characters.updateOne";
    const run = () =>
      resolveCabinetNominationChoice(db, {
        nominationId: electionId,
        characterId: winner,
        decision: "accept",
        now,
        currentTurn: 100,
      });
    await expect(run()).rejects.toThrow("interrupted resolution");
    assertRestored(saved);
    retryCallback = true;
    expect(await run()).toMatchObject({ ok: true });
    expect(memory.collection("centralBanks").docs[0].chairCharacterId).toBeNull();
    expect(memory.collection("cabinetNominations").docs[0].status).toBe("active");
  });
  it("withdraws old-government offers without touching bank offices", async () => {
    seedOffer();
    memory.collection("electedOfficials").docs[0].characterId = new ObjectId();
    expect(
      await resolveCabinetNominationChoice(db, {
        nominationId: electionId,
        characterId: winner,
        decision: "accept",
        now,
        currentTurn: 100,
      })
    ).toMatchObject({ ok: false });
    expect(memory.collection("centralBanks").docs[0].chairCharacterId).toEqual(winner);
    memory.collection("cabinetNominations").docs[0].status = "awaiting_choice";
    await clearCabinetOnTransition(db, "US");
    expect(memory.collection("cabinetNominations").docs[0].status).toBe("withdrawn");
  });
  it("does not discard acting-holder recovery data before restoration commits", async () => {
    seedCabinet();
    Object.assign(memory.collection("cabinetMembers").docs[0], {
      acting: true,
      actingExpiresOnTurn: 100,
    });
    const saved = snapshot();
    fault = "characters.updateOne";
    await expect(expireLapsedActingAppointments(db, 100)).rejects.toThrow("interrupted resolution");
    assertRestored(saved);
    retryCallback = true;
    await expireLapsedActingAppointments(db, 100);
    expect(memory.collection("cabinetMembers").docs).toHaveLength(0);
    expect(memory.collection("characters").docs[1].currentOffice).toMatchObject({
      type: "commons",
    });
    expect(await expireLapsedActingAppointments(db, 100)).toMatchObject({ expired: 0 });
  });

  it("commits FOMC seating and confirmation together without reanchoring terms", async () => {
    memory.seed("centralBanks", [
      {
        _id: "USD",
        countryId: "US",
        fomcBoard: [{ seatId: "seat-1", isChair: true, termExpiresAtTurn: 1 }],
      },
    ]);
    memory.seed("fomcNominations", [
      {
        _id: electionId,
        countryId: "US",
        bankId: "USD",
        seatId: "seat-1",
        status: "active",
        votingEndsOnTurn: 100,
        occupantType: "player",
        nomineeCharacterId: winner,
        nomineeName: "Winner",
        makeChair: true,
        proposedByPresidentId: holder,
        votes: {},
      },
    ]);
    const saved = snapshot();
    fault = "fomcNominations.bulkWrite";
    await expect(processFomcNominationLifecycle(now)).rejects.toThrow("interrupted resolution");
    assertRestored(saved);
    retryCallback = true;
    await processFomcNominationLifecycle(now);
    expect(memory.collection("centralBanks").docs[0].fomcBoard).toEqual([
      expect.objectContaining({
        characterId: winner,
        appointedAtTurn: 100,
        termExpiresAtTurn: expect.any(Number),
      }),
    ]);
    const board = snapshot().centralBanks;
    mocks.turn = 101;
    await processFomcNominationLifecycle(now);
    expect(snapshot().centralBanks).toEqual(board);
    expect(memory.collection("fomcNominations").docs[0].status).toBe("confirmed");
  });
  it("keeps court confirmation and career history retryable together", async () => {
    memory.seed("scotusNominations", [
      {
        _id: electionId,
        countryId: "US",
        seatNumber: 1,
        status: "active",
        votingEndsOnTurn: 100,
        nomineeMode: "character",
        nomineeCharacterId: winner,
        nomineeName: "Winner",
        proposedByPresidentId: holder,
        votes: {},
      },
    ]);
    memory.seed("supremeCourtSeats", [
      { _id: new ObjectId(), countryId: "US", seatNumber: 1, justiceCharacterId: holder },
    ]);
    memory.seed("characters", [{ _id: winner, userId: new ObjectId(), careerHistory: [] }]);
    const saved = snapshot();
    fault = "characters.bulkWrite";
    await expect(processScotusNominationLifecycle(now, db)).rejects.toThrow(
      "interrupted resolution"
    );
    assertRestored(saved);
    retryCallback = true;
    await processScotusNominationLifecycle(now, db);
    expect(memory.collection("scotusNominations").docs[0].status).toBe("confirmed");
    expect(memory.collection("characters").docs[0].careerHistory).toHaveLength(1);
    const character = snapshot().characters;
    await processScotusNominationLifecycle(now, db);
    expect(snapshot().characters).toEqual(character);
  });

  it("recovers committed bill categories and transitions after a later enactment fails", async () => {
    const second = new ObjectId();
    memory.seed(
      "bills",
      [electionId, second].map((_id, i) => ({
        _id,
        countryId: "US",
        status: "enrolled",
        originChamber: "house",
        currentChamber: "house",
        presidentActionDeadlineOnTurn: 1,
        title: "Act",
        sponsorId: null,
        category: i ? "economy" : "health",
        votesFor: 1,
        votesAgainst: 0,
      }))
    );
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
    mocks.failBill = second.toString();
    await expect(runBillLifecycle(db, config, now, 100)).rejects.toThrow("interrupted bill");
    expect(memory.collection("bills").docs.map((b) => b.status)).toEqual(["signed", "enrolled"]);
    retryCallback = true;
    const result = await runBillLifecycle(db, config, now, 100);
    expect(result.billsPassed).toBe(2);
    expect(result.enactedCategories).toEqual(["health", "economy"]);
    expect(
      memory.collection("bills").docs.map((b) => (b.lifecycleReceipts as unknown[]).length)
    ).toEqual([1, 1]);
    expect((await runBillLifecycle(db, config, now, 100)).billsPassed).toBe(2);
  });
  it.each(["popular", "confidence", "escalation"] as const)(
    "rolls back and retries the %s effect and receipt together",
    async (effect) => {
      memory.seed("countryGameStates", [{ _id: "CN" }]);
      memory.seed("countryLeaderStates", [{ _id: "leader", confidence: 50 }]);
      const work = async (tx: Db) => {
        await tx
          .collection<{ _id: string; confidence: number }>("countryLeaderStates")
          .updateOne({ _id: "leader" }, { $inc: { confidence: 1 } });
      };
      const saved = snapshot();
      fault = "countryGameStates.updateOne";
      await expect(applyCountryBillEffect(db, "CN", 100, effect, work)).rejects.toThrow(
        "interrupted resolution"
      );
      assertRestored(saved);
      retryCallback = true;
      await applyCountryBillEffect(db, "CN", 100, effect, work);
      await applyCountryBillEffect(db, "CN", 100, effect, work);
      expect(memory.collection("countryLeaderStates").docs[0].confidence).toBe(51);
    }
  );
});
