// Collection-spy route fixtures isolate admission and session transport.
vi.mock("@/lib/api/withAtomicEconomicCommand", () => ({
  withAtomicEconomicCommand: (db: unknown, work: (db: unknown) => unknown) => work(db),
  fenceEconomicTurn: async () => null,
}));
vi.mock("@/lib/turn/withTurnValueSettlement", async (original) => ({
  ...(await original<typeof import("@/lib/turn/withTurnValueSettlement")>()),
  withTurnValueSettlement: (
    db: unknown,
    _phase: string,
    _turn: number,
    work: (db: unknown) => unknown
  ) => work(db),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

const withTransaction = vi.fn(async (callback: (session: object) => Promise<void>) => callback({}));
const endSession = vi.fn().mockResolvedValue(undefined);
const makeSession = () => ({ withTransaction, endSession });
vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
  getMongoClient: vi.fn().mockResolvedValue({
    startSession: () => makeSession(),
  }),
}));
vi.mock("node:crypto", () => ({ randomInt: vi.fn().mockReturnValue(0) }));
const assertTransactionSupport = vi.fn();
vi.mock("@/lib/db/transactionSupport", () => ({
  assertTransactionSupportAtBoot: () => assertTransactionSupport(),
}));
vi.mock("@/lib/api/requireAuth", () => ({ requireHumanSession: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/db/characterLookup", () => ({ getCharacterByUserId: vi.fn() }));
vi.mock("@/lib/corporations/marketShare", () => ({
  fetchAttackerDefenderShares: vi
    .fn()
    .mockResolvedValue({ defenderSharePercent: 0, attackerSharePercent: 0 }),
}));
vi.mock("@/lib/wireEvent", () => ({
  logWireEvent: vi.fn(),
  wireHeadlineSectorAttack: vi.fn().mockReturnValue("headline"),
}));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/corporations/economicActionLog", () => ({
  logEconomicAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/currency/corporationCapital", () => ({
  anchorToCorpLiquidCapital: vi.fn((v: number) => v),
  corpLiquidCapitalToAnchor: vi.fn((v: number) => v),
  getCorpFxRate: vi.fn().mockResolvedValue(1),
  resolveCorpLiquidCurrencyCode: vi.fn().mockReturnValue("USD"),
}));

let db: MockDb;

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/country/US/region/CA/economy/attack-sector", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = () => ({ params: Promise.resolve({ code: "US", id: "CA" }) });

beforeEach(async () => {
  vi.clearAllMocks();
  assertTransactionSupport.mockResolvedValue(true);
  db = createMockDb();
  const { getMongoClient } = await import("@/lib/mongodb");
  vi.mocked(getMongoClient).mockResolvedValue({ startSession: () => makeSession() } as never);
  Object.assign(db, { client: await getMongoClient() });
  db.collection("gameState");
  db.collection("states");
  db.collection("users");
  db.collection("characters");
  db.collection("corporations");
  db.collection("corporateSectors");
  db.collection("exchangeRates");
  db.collection("gameConfig");
  db.collectionMocks.gameConfig.findOne.mockResolvedValue({
    _id: "default",
    marketSystemMode: "plants",
  });

  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);

  const { requireHumanSession } = await import("@/lib/api/requireAuth");
  vi.mocked(requireHumanSession).mockResolvedValue({
    ok: true,
    user: { userId: new ObjectId().toString() },
  } as never);
});

describe("POST /api/country/[code]/region/[id]/economy/attack-sector", () => {
  it("refuses a split while a turn is processing and changes no plant or cash", async () => {
    // A split landing mid-turn moves a plant the turn already planned with,
    // which stops the turn.
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentYear: 2027,
      isProcessing: true,
      processingKind: "turn",
      processingHeartbeatAt: new Date(),
    });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: new ObjectId().toHexString() }), ctx());
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toMatchObject({ code: "turn_processing" });
    expect(withTransaction).not.toHaveBeenCalled();
    expect(db.collectionMocks.corporateSectors.findOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.corporateSectors.updateOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.corporateSectors.insertOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.corporations.updateOne).not.toHaveBeenCalled();
  });

  it("blocks private attacks in an eastern-bloc command economy", async () => {
    const sectorId = new ObjectId();
    db.collectionMocks.gameState.findOne.mockResolvedValue({ _id: "current", currentYear: 1970 });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "PL-WAW",
      countryId: "PL",
      name: "Warsaw",
    });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: sectorId.toHexString() }), {
      params: Promise.resolve({ code: "PL", id: "PL-WAW" }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toMatch(/command economy/i);
    expect(db.collectionMocks.corporations.findOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.corporateSectors.insertOne).not.toHaveBeenCalled();
  });

  it("self-heals an orphan sector and returns a dissolved-defender 404", async () => {
    const attackerCharId = new ObjectId();
    const attackerCorpId = new ObjectId();
    const orphanCorpId = new ObjectId(); // points to a corp that no longer exists
    const orphanSectorId = new ObjectId();

    db.collectionMocks.gameState.findOne.mockResolvedValue({ _id: "current", currentYear: 1970 });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.users.findOne.mockResolvedValue({
      _id: new ObjectId(),
      activeCharacterType: "regular",
    });

    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({
      _id: attackerCharId,
      name: "Attacker",
    } as never);

    // First call to corporations.findOne: lookup attacker's own corp by ceoId.
    // Second call: defender corp lookup by _id — returns null (orphan).
    db.collectionMocks.corporations.findOne
      .mockResolvedValueOnce({
        _id: attackerCorpId,
        name: "Attacker Corp",
        liquidCapital: 100_000_000,
        marketingStrength: 500,
        splitEscalation: 0,
        countryId: "US",
        liquidCurrencyCode: "USD",
      })
      .mockResolvedValueOnce(null);

    db.collectionMocks.corporateSectors.findOne.mockResolvedValue({
      _id: orphanSectorId,
      corporationId: orphanCorpId,
      countryId: "US",
      stateId: "CA",
      sectorType: "extraction",
      revenue: 1_000_000,
    });

    db.collectionMocks.corporateSectors.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: orphanSectorId.toHexString() }), ctx());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toMatch(/dissolved/i);
    expect(data.error).toMatch(/refresh/i);
    // The orphan sector row should be removed so subsequent reads stop
    // exposing it as an attackable defender.
    expect(db.collectionMocks.corporateSectors.deleteOne).toHaveBeenCalledWith({
      _id: orphanSectorId,
    });
    // The attacker's corp should NOT be charged for the failed attack.
    expect(db.collectionMocks.corporations.updateOne).not.toHaveBeenCalled();
  });

  it("blocks attacks on a suspended (auction-shell) corporation", async () => {
    const attackerCharId = new ObjectId();
    const attackerCorpId = new ObjectId();
    const shellCorpId = new ObjectId();
    const shellSectorId = new ObjectId();

    db.collectionMocks.gameState.findOne.mockResolvedValue({ _id: "current", currentYear: 1970 });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.users.findOne.mockResolvedValue({
      _id: new ObjectId(),
      activeCharacterType: "regular",
    });

    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({
      _id: attackerCharId,
      name: "Attacker",
    } as never);

    db.collectionMocks.corporations.findOne
      .mockResolvedValueOnce({
        _id: attackerCorpId,
        name: "Attacker Corp",
        liquidCapital: 100_000_000,
        marketingStrength: 500,
        splitEscalation: 0,
        countryId: "US",
        liquidCurrencyCode: "USD",
      })
      // Defender: a suspended auction shell (no countryOwnerId).
      .mockResolvedValueOnce({
        _id: shellCorpId,
        name: "Carved Co (auction)",
        suspended: true,
        countryId: "US",
        liquidCurrencyCode: "USD",
      });

    db.collectionMocks.corporateSectors.findOne.mockResolvedValue({
      _id: shellSectorId,
      corporationId: shellCorpId,
      countryId: "US",
      stateId: "CA",
      sectorType: "extraction",
      revenue: 1_000_000,
    });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: shellSectorId.toHexString() }), ctx());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/suspended/i);
    // No capture, no charge.
    expect(db.collectionMocks.corporations.updateOne).not.toHaveBeenCalled();
  });

  it("atomically transfers the quoted whole plants on success", async () => {
    const attackerCharId = new ObjectId();
    const attackerCorpId = new ObjectId();
    const defenderCorpId = new ObjectId();
    const targetSectorId = new ObjectId();
    const attacker = {
      _id: attackerCorpId,
      ceoId: attackerCharId,
      name: "Attacker Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 200,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const defender = {
      _id: defenderCorpId,
      name: "Defender Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 100,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const target = {
      _id: targetSectorId,
      corporationId: defenderCorpId,
      countryId: "US",
      stateId: "CA",
      sectorType: "energy",
      strategyId: "standard",
      revenue: 1_000_000,
      capitalStock: 1_000,
      capacityBookAnchor: 1_000_000,
      plantCount: 100,
      plantUnitRemainder: 0,
    };
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 511,
    });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
    });
    db.collectionMocks.users.findOne.mockResolvedValue({
      _id: new ObjectId(),
      activeCharacterType: "regular",
    });
    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({ _id: attackerCharId } as never);
    db.collectionMocks.corporations.findOne
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender)
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender);
    db.collectionMocks.corporations.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.findOne
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(null);
    db.collectionMocks.corporateSectors.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: targetSectorId.toHexString() }), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      splitSucceeded: true,
      plantsAtRisk: 20,
      plantsTransferred: 20,
      attackCost: 100_000,
      msCost: 14,
    });
    expect(db.collectionMocks.corporations.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: attackerCorpId }),
      expect.objectContaining({
        $inc: expect.objectContaining({ liquidCapital: -100_000, marketingStrength: -14 }),
      }),
      expect.any(Object)
    );
    expect(db.collectionMocks.corporateSectors.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: targetSectorId, plantCount: 100 }),
      expect.objectContaining({
        $set: expect.objectContaining({
          plantCount: 80,
          capitalStock: 800,
          capacityBookAnchor: 800_000,
        }),
      }),
      expect.any(Object)
    );
    expect(db.collectionMocks.corporateSectors.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        corporationId: attackerCorpId,
        plantCount: 20,
        capitalStock: 200,
        capacityBookAnchor: 200_000,
      }),
      expect.any(Object)
    );
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it("refuses a poisoned session without writes and succeeds on a fresh request", async () => {
    const attackerCharId = new ObjectId();
    const attackerCorpId = new ObjectId();
    const defenderCorpId = new ObjectId();
    const targetSectorId = new ObjectId();
    const attacker = {
      _id: attackerCorpId,
      ceoId: attackerCharId,
      name: "Attacker Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 200,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const defender = {
      _id: defenderCorpId,
      name: "Defender Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 100,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const target = {
      _id: targetSectorId,
      corporationId: defenderCorpId,
      countryId: "US",
      stateId: "CA",
      sectorType: "energy",
      strategyId: "standard",
      revenue: 1_000_000,
      capitalStock: 1_000,
      capacityBookAnchor: 1_000_000,
      plantCount: 100,
      plantUnitRemainder: 0,
    };
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 511,
    });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
    });
    db.collectionMocks.users.findOne.mockResolvedValue({
      _id: new ObjectId(),
      activeCharacterType: "regular",
    });
    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({ _id: attackerCharId } as never);
    db.collectionMocks.corporations.findOne
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender)
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender);
    db.collectionMocks.corporations.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.findOne
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(null);
    db.collectionMocks.corporateSectors.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.insertOne.mockResolvedValue({
      insertedId: new ObjectId(),
    });

    // First session is poisoned: transaction start fails with Mongo code 117
    // (ConflictingOperationInProgress). The wrapper must open a fresh session
    // and retry, with the callback only actually running on the good session.
    const poisonedSession = {
      withTransaction: vi.fn().mockRejectedValue({
        code: 117,
        message:
          "Only servers in a sharded cluster can start a new transaction at the active transaction number",
      }),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    const { getMongoClient } = await import("@/lib/mongodb");
    vi.mocked(getMongoClient).mockResolvedValue({
      startSession: vi.fn().mockReturnValueOnce(poisonedSession).mockReturnValueOnce(makeSession()),
    } as never);

    Object.assign(db, { client: await getMongoClient() });
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: targetSectorId.toHexString() }), ctx());
    await response.json();

    // A non-retryable transaction-start failure must leave every money leg untouched.
    expect(response.status).toBe(500);
    expect(db.collectionMocks.corporations.updateOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.corporateSectors.insertOne).not.toHaveBeenCalled();
    expect(poisonedSession.withTransaction).toHaveBeenCalledTimes(1);
    expect(poisonedSession.endSession).toHaveBeenCalledTimes(1);
    expect(withTransaction).not.toHaveBeenCalled();

    // A subsequent request uses a healthy session and the same valid ownership rows.
    db.collectionMocks.corporations.findOne
      .mockReset()
      .mockImplementation(async (filter) =>
        filter.ceoId || String(filter._id) === String(attackerCorpId) ? attacker : defender
      );
    db.collectionMocks.corporateSectors.findOne
      .mockReset()
      .mockImplementation(async (filter) =>
        String(filter.corporationId) === String(attackerCorpId) ? null : target
      );

    // Restore the shared mock so later tests get the default session factory.
    vi.mocked(getMongoClient).mockResolvedValue({
      startSession: () => makeSession(),
    } as never);
    Object.assign(db, { client: await getMongoClient() });
    const retried = await POST(makeRequest({ sectorId: targetSectorId.toHexString() }), ctx());
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({ splitSucceeded: true, plantsTransferred: 20 });
  });

  it("spends the quoted cash and MS on failure without moving plants", async () => {
    const { randomInt } = await import("node:crypto");
    vi.mocked(randomInt as unknown as () => number).mockReturnValue(999_999_999);
    const attackerCharId = new ObjectId();
    const attackerCorpId = new ObjectId();
    const defenderCorpId = new ObjectId();
    const targetSectorId = new ObjectId();
    const attacker = {
      _id: attackerCorpId,
      ceoId: attackerCharId,
      name: "Attacker Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 100,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const defender = {
      _id: defenderCorpId,
      name: "Defender Corp",
      marketingStrength: 100,
      countryId: "US",
    };
    const target = {
      _id: targetSectorId,
      corporationId: defenderCorpId,
      countryId: "US",
      stateId: "CA",
      sectorType: "energy",
      revenue: 1_000_000,
      capitalStock: 1_000,
      capacityBookAnchor: 1_000_000,
      plantCount: 100,
    };
    db.collectionMocks.gameState.findOne.mockResolvedValue({ _id: "current", currentTurn: 511 });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
    });
    db.collectionMocks.users.findOne.mockResolvedValue({ activeCharacterType: "regular" });
    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({ _id: attackerCharId } as never);
    db.collectionMocks.corporations.findOne
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender)
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender);
    db.collectionMocks.corporations.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.findOne
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(target);

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: targetSectorId.toHexString() }), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ splitSucceeded: false, plantsTransferred: 0 });
    expect(db.collectionMocks.corporations.updateOne).toHaveBeenCalledTimes(1);
    expect(db.collectionMocks.corporateSectors.updateOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.corporateSectors.insertOne).not.toHaveBeenCalled();
  });

  it("refuses the split on Mongo without transaction support", async () => {
    // Ticket #1239: prod Mongo is standalone, so requiring a transaction turned
    // every attack into an opaque 500. The split must run sequentially instead.
    assertTransactionSupport.mockResolvedValue(false);
    Object.assign(db, {
      client: {
        startSession: () => ({
          withTransaction: async () => {
            throw Object.assign(new Error("Transaction numbers require a replica set"), {
              code: 20,
            });
          },
          endSession: async () => {},
        }),
      },
    });
    const attackerCharId = new ObjectId();
    const attackerCorpId = new ObjectId();
    const defenderCorpId = new ObjectId();
    const targetSectorId = new ObjectId();
    const attacker = {
      _id: attackerCorpId,
      ceoId: attackerCharId,
      name: "Attacker Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 200,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const defender = {
      _id: defenderCorpId,
      name: "Defender Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 100,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const target = {
      _id: targetSectorId,
      corporationId: defenderCorpId,
      countryId: "US",
      stateId: "CA",
      sectorType: "energy",
      strategyId: "standard",
      revenue: 1_000_000,
      capitalStock: 1_000,
      capacityBookAnchor: 1_000_000,
      plantCount: 100,
      plantUnitRemainder: 0,
    };
    db.collectionMocks.gameState.findOne.mockResolvedValue({ _id: "current", currentTurn: 511 });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
    });
    db.collectionMocks.users.findOne.mockResolvedValue({
      _id: new ObjectId(),
      activeCharacterType: "regular",
    });
    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({ _id: attackerCharId } as never);
    // A later-in-file sibling pins the roll high to force a miss, and
    // clearAllMocks leaves implementations in place, so pin it back.
    const { randomInt } = await import("node:crypto");
    vi.mocked(randomInt as unknown as () => number).mockReturnValue(0);
    db.collectionMocks.corporations.findOne
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender)
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender);
    db.collectionMocks.corporations.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.findOne
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(null);
    db.collectionMocks.corporateSectors.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: targetSectorId.toHexString() }), ctx());
    await response.json();

    expect(response.status).toBe(500);
    expect(db.collectionMocks.corporations.updateOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.corporateSectors.insertOne).not.toHaveBeenCalled();
  });

  it("aborts the debit when the split conflicts after charging the attacker", async () => {
    // All mutation writes join the transaction; the conflict must abort its debit.
    const attackerCharId = new ObjectId();
    const attackerCorpId = new ObjectId();
    const defenderCorpId = new ObjectId();
    const targetSectorId = new ObjectId();
    const attacker = {
      _id: attackerCorpId,
      ceoId: attackerCharId,
      name: "Attacker Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 200,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const defender = {
      _id: defenderCorpId,
      name: "Defender Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 100,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const target = {
      _id: targetSectorId,
      corporationId: defenderCorpId,
      countryId: "US",
      stateId: "CA",
      sectorType: "energy",
      strategyId: "standard",
      revenue: 1_000_000,
      capitalStock: 1_000,
      capacityBookAnchor: 1_000_000,
      plantCount: 100,
      plantUnitRemainder: 0,
    };
    db.collectionMocks.gameState.findOne.mockResolvedValue({ _id: "current", currentTurn: 511 });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
    });
    db.collectionMocks.users.findOne.mockResolvedValue({
      _id: new ObjectId(),
      activeCharacterType: "regular",
    });
    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({ _id: attackerCharId } as never);
    // A later-in-file sibling pins the roll high to force a miss, and
    // clearAllMocks leaves implementations in place, so pin it back.
    const { randomInt } = await import("node:crypto");
    vi.mocked(randomInt as unknown as () => number).mockReturnValue(0);
    db.collectionMocks.corporations.findOne
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender)
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender);
    db.collectionMocks.corporations.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.findOne
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(null);
    // The defender's plant ledger moves under us: the guarded write matches
    // nothing, which raises SplitConflictError after the debit already landed.
    db.collectionMocks.corporateSectors.updateOne.mockResolvedValue({ modifiedCount: 0 });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: targetSectorId.toHexString() }), ctx());

    expect(response.status).toBe(409);
    expect(db.collectionMocks.corporations.updateOne).toHaveBeenCalledTimes(1);
    expect(db.collectionMocks.corporations.updateOne.mock.calls[0][1]).toMatchObject({
      $inc: { liquidCapital: -100_000, marketingStrength: -14 },
    });
  });
  it("never runs two session operations at once inside the transaction", async () => {
    // Ticket #1239. A Mongo ClientSession cannot carry concurrent operations.
    // These reads used to go through Promise.all, so all four raced to open the
    // transaction on the same session and the losers got
    // "Only servers in a sharded cluster can start a new transaction at the
    // active transaction number". Retrying on a fresh session never helped,
    // because the race is in the call pattern, not the session.
    const attackerCharId = new ObjectId();
    const attackerCorpId = new ObjectId();
    const defenderCorpId = new ObjectId();
    const targetSectorId = new ObjectId();
    const attacker = {
      _id: attackerCorpId,
      ceoId: attackerCharId,
      name: "Attacker Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 200,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const defender = {
      _id: defenderCorpId,
      name: "Defender Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 100,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const target = {
      _id: targetSectorId,
      corporationId: defenderCorpId,
      countryId: "US",
      stateId: "CA",
      sectorType: "energy",
      strategyId: "standard",
      revenue: 1_000_000,
      capitalStock: 1_000,
      capacityBookAnchor: 1_000_000,
      plantCount: 100,
      plantUnitRemainder: 0,
    };
    db.collectionMocks.gameState.findOne.mockResolvedValue({ _id: "current", currentTurn: 511 });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
    });
    db.collectionMocks.users.findOne.mockResolvedValue({
      _id: new ObjectId(),
      activeCharacterType: "regular",
    });
    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({ _id: attackerCharId } as never);
    const { randomInt } = await import("node:crypto");
    vi.mocked(randomInt as unknown as () => number).mockReturnValue(0);

    // Track how many session-bound reads are in flight at once. Anything above
    // 1 is the bug: two operations sharing one session.
    let inFlight = 0;
    let maxInFlight = 0;
    const defer =
      <T>(value: T) =>
      async (_filter: unknown, options?: { session?: unknown }) => {
        if (!options || !("session" in options)) return value;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 0));
        inFlight -= 1;
        return value;
      };

    let corpCall = 0;
    db.collectionMocks.corporations.findOne.mockImplementation(
      async (filter: unknown, options?: { session?: unknown }) => {
        corpCall += 1;
        const value =
          corpCall <= 2
            ? corpCall === 1
              ? attacker
              : defender
            : corpCall === 3
              ? attacker
              : defender;
        return defer(value)(filter, options);
      }
    );
    let sectorCall = 0;
    db.collectionMocks.corporateSectors.findOne.mockImplementation(
      async (filter: unknown, options?: { session?: unknown }) => {
        sectorCall += 1;
        const value = sectorCall <= 2 ? target : null;
        return defer(value)(filter, options);
      }
    );
    db.collectionMocks.corporations.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    const { POST } = await import("./route");
    await POST(makeRequest({ sectorId: targetSectorId.toHexString() }), ctx());

    expect(maxInFlight).toBe(1);
  });
  it("says 'plant' not 'plants' when exactly one transfers", async () => {
    const attackerCharId = new ObjectId();
    const attackerCorpId = new ObjectId();
    const defenderCorpId = new ObjectId();
    const targetSectorId = new ObjectId();
    const attacker = {
      _id: attackerCorpId,
      ceoId: attackerCharId,
      name: "Attacker Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 200,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const defender = {
      _id: defenderCorpId,
      name: "Flower News",
      liquidCapital: 1_000_000,
      marketingStrength: 100,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    // 2 plants, so a 20% share seizes exactly 1.
    const target = {
      _id: targetSectorId,
      corporationId: defenderCorpId,
      countryId: "US",
      stateId: "CA",
      sectorType: "energy",
      strategyId: "standard",
      revenue: 1_000_000,
      capitalStock: 1_000,
      capacityBookAnchor: 1_000_000,
      plantCount: 2,
      plantUnitRemainder: 0,
    };
    db.collectionMocks.gameState.findOne.mockResolvedValue({ _id: "current", currentTurn: 526 });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
    });
    db.collectionMocks.users.findOne.mockResolvedValue({
      _id: new ObjectId(),
      activeCharacterType: "regular",
    });
    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({ _id: attackerCharId } as never);
    const { randomInt } = await import("node:crypto");
    vi.mocked(randomInt as unknown as () => number).mockReturnValue(0);
    db.collectionMocks.corporations.findOne
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender)
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender);
    db.collectionMocks.corporations.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.findOne
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(null);
    db.collectionMocks.corporateSectors.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: targetSectorId.toHexString() }), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.plantsTransferred).toBe(1);
    expect(data.message).toContain("1 whole plant from Flower News");
    expect(data.message).not.toContain("whole plants");
  });

  it("notifies the defender with sector, state, and book value (suggestion #324)", async () => {
    const attackerCharId = new ObjectId();
    const attackerCorpId = new ObjectId();
    const defenderCorpId = new ObjectId();
    const defenderUserId = new ObjectId();
    const targetSectorId = new ObjectId();
    const attacker = {
      _id: attackerCorpId,
      ceoId: attackerCharId,
      name: "Attacker Corp",
      liquidCapital: 1_000_000,
      marketingStrength: 200,
      countryId: "US",
      liquidCurrencyCode: "USD",
    };
    const defender = {
      _id: defenderCorpId,
      name: "Flower News",
      liquidCapital: 1_000_000,
      marketingStrength: 100,
      countryId: "US",
      liquidCurrencyCode: "USD",
      userId: defenderUserId,
    };
    const target = {
      _id: targetSectorId,
      corporationId: defenderCorpId,
      countryId: "US",
      stateId: "CA",
      sectorType: "energy",
      strategyId: "standard",
      revenue: 1_000_000,
      capitalStock: 1_000,
      capacityBookAnchor: 1_000_000,
      plantCount: 4,
      plantUnitRemainder: 0,
    };
    db.collectionMocks.gameState.findOne.mockResolvedValue({ _id: "current", currentTurn: 526 });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
    });
    db.collectionMocks.users.findOne.mockResolvedValue({
      _id: new ObjectId(),
      activeCharacterType: "regular",
    });
    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({ _id: attackerCharId } as never);
    const { randomInt } = await import("node:crypto");
    vi.mocked(randomInt as unknown as () => number).mockReturnValue(0);
    db.collectionMocks.corporations.findOne
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender)
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender);
    db.collectionMocks.corporations.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.findOne
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(null);
    db.collectionMocks.corporateSectors.updateOne.mockResolvedValue({ modifiedCount: 1 });
    db.collectionMocks.corporateSectors.insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sectorId: targetSectorId.toHexString() }), ctx());
    expect(response.status).toBe(200);

    const { createNotification } = await import("@/lib/notifications");
    expect(createNotification).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(createNotification).mock.calls[0][0] as {
      message: string;
      metadata: Record<string, unknown>;
    };
    expect(payload.message).toContain("Energy");
    expect(payload.message).toContain("California");
    expect(payload.message).toContain("book value");
    expect(payload.metadata).toMatchObject({
      stateName: "California",
      countryId: "US",
      captureKind: "capacity",
      splitSucceeded: true,
    });
    expect(payload.metadata.bookValueTransferredAnchor).toBeGreaterThan(0);
  });
});
