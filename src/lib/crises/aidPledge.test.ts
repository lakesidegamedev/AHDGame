import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { CrisisInteraction } from "@/lib/db/types/crisis";
import { submitCrisisAidPledge } from "./aidPledge";
import { refundTreasurySpend, spendFromTreasury } from "@/lib/budget/treasurySpend";
import { applyCrisisEffects } from "@/lib/crises/applyEffects";
import { applyEffectsForCrisis } from "@/lib/crises/interactionEngine";
import { proposeCrisisAidBill } from "@/lib/legislature/commands/proposeCrisisAidBill";

vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/budget/treasurySpend", () => ({
  spendFromTreasury: vi.fn(),
  refundTreasurySpend: vi.fn(),
}));
vi.mock("@/lib/crises/applyEffects", () => ({ applyCrisisEffects: vi.fn() }));
vi.mock("@/lib/crises/interactionEngine", () => ({ applyEffectsForCrisis: vi.fn() }));
vi.mock("@/lib/legislature/commands/proposeCrisisAidBill", () => ({
  proposeCrisisAidBill: vi.fn(),
}));

let db: MockDb;

function makeInteraction(): CrisisInteraction {
  return {
    _id: new ObjectId(),
    crisisId: new ObjectId(),
    decisionTree: [
      {
        nodeId: "aid",
        type: "aid",
        title: "Aid",
        description: "",
        requiredRoles: ["headOfState"],
        timeLimitMinutes: null,
        options: [],
      },
    ],
    currentNodeId: "aid",
    collectiveTarget: null,
    collectiveCurrent: 0,
    contributors: [],
    decisionDeadline: null,
    autoResolveOnExpiry: true,
    resolvedAt: null,
    resolutionPath: [],
    resolutionOutcome: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CrisisInteraction;
}

function pledgeInput(interaction: CrisisInteraction) {
  return {
    interactionId: interaction._id,
    nodeId: "aid",
    pctGdp: 0.001,
    characterId: new ObjectId(),
    characterName: "Test Leader",
    senderCountryId: "US" as const,
    characterRoles: ["headOfState"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db = createMockDb();
  ["crisisInteractions", "crisisAidCommitments", "federalBudget", "crises"].forEach((n) =>
    db.collection(n)
  );
});

describe("submitCrisisAidPledge", () => {
  it("claims the pledge slot before it spends, applies effects or files the bill", async () => {
    const interaction = makeInteraction();
    db.collectionMocks.crisisInteractions.findOne.mockResolvedValue(interaction);
    db.collectionMocks.federalBudget.findOne.mockResolvedValue({ gdp: 1_000_000_000_000 });
    db.collectionMocks.crisisAidCommitments.insertOne.mockRejectedValue(
      Object.assign(new Error("E11000 duplicate key"), { code: 11000 })
    );

    await expect(
      submitCrisisAidPledge(db as unknown as Db, pledgeInput(interaction))
    ).rejects.toThrow("already pledged");

    expect(spendFromTreasury).not.toHaveBeenCalled();
    expect(applyEffectsForCrisis).not.toHaveBeenCalled();
    expect(applyCrisisEffects).not.toHaveBeenCalled();
    expect(proposeCrisisAidBill).not.toHaveBeenCalled();
  });

  it("releases the claim when the treasury spend fails", async () => {
    const interaction = makeInteraction();
    db.collectionMocks.crisisInteractions.findOne.mockResolvedValue(interaction);
    db.collectionMocks.federalBudget.findOne.mockResolvedValue({ gdp: 1_000_000_000_000 });
    vi.mocked(spendFromTreasury).mockRejectedValue(new Error("write failed"));

    await expect(
      submitCrisisAidPledge(db as unknown as Db, pledgeInput(interaction))
    ).rejects.toThrow("write failed");

    const inserted = db.collectionMocks.crisisAidCommitments.insertOne.mock.calls[0][0];
    expect(db.collectionMocks.crisisAidCommitments.deleteOne).toHaveBeenCalledWith({
      _id: inserted._id,
    });
    expect(applyEffectsForCrisis).not.toHaveBeenCalled();
    expect(proposeCrisisAidBill).not.toHaveBeenCalled();
  });

  it("files the bill under the id the commitment already names", async () => {
    const interaction = makeInteraction();
    db.collectionMocks.crisisInteractions.findOne.mockResolvedValue(interaction);
    db.collectionMocks.federalBudget.findOne.mockResolvedValue({ gdp: 1_000_000_000_000 });
    db.collectionMocks.crises.findOne.mockResolvedValue({ name: "Flood" });
    vi.mocked(spendFromTreasury).mockResolvedValue({ fromSurplus: 1, addedToDebt: 0 } as never);

    const result = await submitCrisisAidPledge(db as unknown as Db, pledgeInput(interaction));

    const inserted = db.collectionMocks.crisisAidCommitments.insertOne.mock.calls[0][0];
    expect(inserted.billId).toEqual(result.billId);
    expect(proposeCrisisAidBill).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ billId: result.billId, crisisAidId: inserted._id })
    );
    const order = [
      db.collectionMocks.crisisAidCommitments.insertOne.mock.invocationCallOrder[0],
      vi.mocked(spendFromTreasury).mock.invocationCallOrder[0],
    ];
    expect(order[0]).toBeLessThan(order[1]);
  });

  it("refunds the spend, reverses the effects and frees the slot when the bill cannot be filed", async () => {
    const interaction = makeInteraction();
    db.collectionMocks.crisisInteractions.findOne.mockResolvedValue(interaction);
    db.collectionMocks.federalBudget.findOne.mockResolvedValue({ gdp: 1_000_000_000_000 });
    db.collectionMocks.crises.findOne.mockResolvedValue({ name: "Flood" });
    vi.mocked(spendFromTreasury).mockResolvedValue({ fromSurplus: 1, addedToDebt: 0 } as never);
    vi.mocked(proposeCrisisAidBill).mockRejectedValue(new Error("bill insert failed"));

    await expect(
      submitCrisisAidPledge(db as unknown as Db, pledgeInput(interaction))
    ).rejects.toThrow("bill insert failed");

    const inserted = db.collectionMocks.crisisAidCommitments.insertOne.mock.calls[0][0];
    expect(refundTreasurySpend).toHaveBeenCalledWith(
      expect.anything(),
      "US",
      inserted.treasuryDebited,
      expect.objectContaining({
        flow: "crisis_aid",
        key: `crisis-aid:${interaction.crisisId.toString()}:US`,
      })
    );
    expect(applyEffectsForCrisis).toHaveBeenLastCalledWith(
      expect.anything(),
      interaction.crisisId,
      inserted.recoveryEffects.map((e: { value: number }) => ({ ...e, value: -e.value }))
    );
    expect(db.collectionMocks.crisisAidCommitments.deleteOne).toHaveBeenCalledWith({
      _id: inserted._id,
    });
  });
});
