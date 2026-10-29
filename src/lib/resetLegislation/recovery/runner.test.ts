import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { buildOpeningLawBoards1991 } from "../openingBoards1991";
import { loadRecoverySnapshot, buildRecovery, applyLegacyRecovery } from "./runner";
const billId = new ObjectId("111111111111111111111111");
const policyId = new ObjectId("222222222222222222222222");
function fixture() {
  const db = createMockDb();
  const gs = {
    _id: "current",
    resetWorldId: "test-world",
    currentTurn: 100,
    currentYear: 1999,
    legislationSystemVersion: "v2",
    isProcessing: false,
  };
  const receipt = {
    programId: "legacy",
    legislationTypeId: "us.health.prevention.primary",
    policyOptionId: "l4",
    authorizedCost: 1000,
    fundedAmount: 800,
    unfundedAmount: 200,
    implementationFactor: 0.8,
    obligationPriority: 5,
    lastSettledTurn: 50,
    validThroughTurn: 150,
  };
  const rows: Record<string, unknown[]> = {
    stateBills: [
      {
        _id: billId,
        countryId: "US",
        stateId: "GA",
        title: "Health",
        summary: "Prevention",
        proposedByGovernor: {},
        provisions: [{ legislationTypeId: receipt.legislationTypeId, policyOptionId: "l4" }],
      },
    ],
    statePolicies: [
      {
        _id: policyId,
        stateId: "GA",
        countryId: "US",
        legislationTypeId: receipt.legislationTypeId,
        policyOptionId: "l4",
        enactedBy: { kind: "bill", id: billId },
        enactedTurn: 10,
      },
    ],
    legislationTypes: [
      {
        _id: receipt.legislationTypeId,
        policyOptions: [0, 1, 2, 3, 4].map((i) => ({ id: "l" + i })),
      },
    ],
    resetLawPrograms: [],
    resetLawOpeningBoards: buildOpeningLawBoards1991("test-world", 1).filter(
      (b) => b._id === "US:GA"
    ),
    stateBudgets: [
      {
        _id: "GA",
        countryId: "US",
        spending: { byCategory: { healthcare: 800 }, total: 800 },
        authorizedSpending: { byCategory: { healthcare: 1000 }, total: 1000 },
        regionalProgramSettlements: { legacy: receipt },
      },
    ],
    regionalBudgets: [],
    enactedLaws: [
      {
        _id: new ObjectId("333333333333333333333333"),
        billId,
        stateId: "GA",
        scope: "state",
        legislationTypeId: receipt.legislationTypeId,
        budgetCategory: "healthcare",
      },
    ],
    resetMetricSnapshots: [],
    states: [{ _id: "GA", countryId: "US", gdp: 200000, population: 1000000 }],
  };
  for (const [name, items] of Object.entries(rows))
    db.collection(name).find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue(items),
    });
  db.collection("gameState").findOne.mockResolvedValue(gs);
  const session = {
    withTransaction: vi.fn(async (body: () => Promise<unknown>) => body()),
    endSession: vi.fn(),
  };
  const client = { startSession: () => session } as unknown as MongoClient;
  return { db: db as unknown as Db, mocks: db.collectionMocks, gs, session, client };
}
beforeEach(() => vi.clearAllMocks());
describe("recovery transaction shell", () => {
  it("is read-only until explicitly applied", async () => {
    const f = fixture();
    const r = buildRecovery(await loadRecoverySnapshot(f.db));
    expect(r.programs).toHaveLength(1);
    expect(r.budgetUpdates[0]!.patch.spending.total).toBe(800);
    expect(f.mocks.resetLawPrograms!.replaceOne).not.toHaveBeenCalled();
  });
  it("checks the reviewed snapshot before any mutation", async () => {
    const f = fixture();
    await expect(applyLegacyRecovery(f.db, f.client, "wrong", false)).rejects.toThrow(
      "snapshot changed"
    );
    expect(f.mocks.gameState!.updateOne).not.toHaveBeenCalled();
    expect(f.session.endSession).toHaveBeenCalled();
  });
  it("keeps original bill attribution and a durable backup, within one session", async () => {
    const f = fixture();
    const r = buildRecovery(await loadRecoverySnapshot(f.db));
    await applyLegacyRecovery(f.db, f.client, r.hash, false);
    const [, program, options] = f.mocks.resetLawPrograms!.replaceOne.mock.calls[0]!;
    expect(program.enactedByBillId).toEqual(billId);
    expect(options.session).toBe(f.session);
    const receipt = f.mocks.resetLawEnactmentReceipts!.insertOne.mock.calls[0]![0];
    expect(receipt.recovery.before.policies[0]._id).toEqual(policyId);
    expect(receipt.transitionClaim).toBe(0);
    expect(f.mocks.resetMetricSnapshots!.updateOne).not.toHaveBeenCalled();
    expect(f.mocks.stateBills!.updateOne).not.toHaveBeenCalled();
  });
  it("is idempotent after its receipt exists", async () => {
    const f = fixture();
    f.mocks.resetLawEnactmentReceipts =
      f.mocks.resetLawEnactmentReceipts ?? (f.db.collection("resetLawEnactmentReceipts") as never);
    f.mocks.resetLawEnactmentReceipts!.findOne.mockResolvedValue({ _id: "already" });
    expect(await applyLegacyRecovery(f.db, f.client, "old", true)).toEqual({
      alreadyApplied: true,
    });
    expect(f.mocks.resetLawPrograms!.replaceOne).not.toHaveBeenCalled();
  });
  it("refuses concurrent turn processing", async () => {
    const f = fixture();
    const r = buildRecovery(await loadRecoverySnapshot(f.db));
    f.mocks.gameState!.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await expect(applyLegacyRecovery(f.db, f.client, r.hash, false)).rejects.toThrow(
      "Turn processing started"
    );
    expect(f.mocks.resetLawPrograms!.replaceOne).not.toHaveBeenCalled();
  });
  it("refuses a world already processing", async () => {
    const f = fixture();
    f.gs.isProcessing = true;
    await expect(loadRecoverySnapshot(f.db)).rejects.toThrow("idle v2 world");
  });
});
