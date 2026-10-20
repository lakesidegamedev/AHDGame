import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { ProducerOpeningPlan } from "./migrationRules";
import { applyProducerOpening } from "./openingApply";

const sectorId = new ObjectId();
const corpId = new ObjectId();

const plan = (changes: Partial<ProducerOpeningPlan> = {}): ProducerOpeningPlan =>
  ({
    version: 3,
    modeledLossPolicy: { kind: "openingAdjustment", approvalReference: "owner" },
    worldEpoch: "w",
    completedTurn: 99,
    firstSettlementTurn: 100,
    accounts: [
      {
        id: corpId.toHexString(),
        currency: "USD",
        localPerAnchor: 1,
        openingCashLocal: 10,
        openingCashAnchor: 10,
        spendableCashAnchor: 10,
        openingOverdraftAnchor: 0,
        producerPayables: { worldEpoch: "w", turn: 99, claims: [] },
      },
    ],
    sectors: [
      {
        id: sectorId.toHexString(),
        accountId: corpId.toHexString(),
        capacity: { completedTurn: 99, ownedDailyUnits: 1, paidBookAnchor: 1, buildQueue: [] },
        inputStock: [],
        outputStock: [{ commodity: "food", book: "world", units: 5 }],
        quotes: [
          { commodity: "food", book: "world", policy: { kind: "automatic", targetMarkup: 0 } },
        ],
        openingInventoryMemoValueAnchor: 0,
        transition: {
          mismatched: true,
          legacyRevenueAnchor: 50,
          fundedRevenueAnchor: 10,
          basisTurns: 5,
        },
      },
    ],
    openingQuoteAdjustments: [],
    protectedImages: [],
    requiredCreditorAccountIds: [],
    unresolvedModeledLossCarry: [],
    nonCashOpeningAdjustments: [
      {
        accountId: corpId.toHexString(),
      } as ProducerOpeningPlan["nonCashOpeningAdjustments"][number],
    ],
    reconciliation: {
      cashCreated: 0,
      inputStockCreated: 0,
    } as ProducerOpeningPlan["reconciliation"],
    ...changes,
  }) as ProducerOpeningPlan;

function world() {
  const memory = createInMemoryDb();
  memory.seed("gameState", [{ _id: "current", worldEpochId: "w" }]);
  memory.seed("corporateSectors", [{ _id: sectorId, corporationId: corpId, inventoryUnits: {} }]);
  memory.seed("corporations", [
    { _id: corpId, liquidCapital: 10, operatingCashArrearsByCurrency: { USD: 4 } },
  ]);
  return { memory, db: memory as unknown as Db };
}

describe("producer opening apply", () => {
  it("writes the reviewed plan, stamps the marker last, and a second run changes nothing", async () => {
    const { memory, db } = world();
    const first = await applyProducerOpening(db, {
      plan: plan(),
      planDigest: "d",
      approvedDigest: "d",
    });
    expect(first).toMatchObject({ status: "applied", sectors: 1, corporations: 1 });
    const sector = memory.collection("corporateSectors").docs[0];
    expect(sector.producerInventory).toEqual({
      worldEpoch: "w",
      turn: 99,
      inputStock: [],
      outputStock: [{ commodity: "food", book: "world", units: 5 }],
    });
    expect(sector.producerQuotes).toEqual({ food: { kind: "automatic", targetMarkup: 0 } });
    expect(sector.cutoverTransition).toMatchObject({ mismatched: true, legacyRevenueAnchor: 50 });
    const corp = memory.collection("corporations").docs[0];
    expect(corp.producerPayables).toEqual({ worldEpoch: "w", turn: 99, claims: [] });
    expect(corp.operatingCashArrearsByCurrency).toBeUndefined();
    expect(corp.liquidCapital).toBe(10);
    expect(memory.collection("gameState").docs[0].producerOpening).toEqual({
      worldEpoch: "w",
      turn: 99,
      digest: "d",
    });
    const again = await applyProducerOpening(db, {
      plan: plan(),
      planDigest: "d",
      approvedDigest: "d",
    });
    expect(again.status).toBe("alreadyApplied");
  });

  it("refuses an unreviewed digest, unresolved loss carry, or a different applied opening", async () => {
    const { memory, db } = world();
    await expect(
      applyProducerOpening(db, { plan: plan(), planDigest: "d", approvedDigest: "x" })
    ).rejects.toThrow(/reviewed census/);
    await expect(
      applyProducerOpening(db, {
        plan: plan({ unresolvedModeledLossCarry: [{ accountId: "a", amountAnchor: 1 }] }),
        planDigest: "d",
        approvedDigest: "d",
      })
    ).rejects.toThrow(/unresolved/);
    memory.collection("gameState").docs[0].producerOpening = {
      worldEpoch: "w",
      turn: 99,
      digest: "other",
    };
    await expect(
      applyProducerOpening(db, { plan: plan(), planDigest: "d", approvedDigest: "d" })
    ).rejects.toThrow(/different producer opening/);
  });

  it("finishes after a crash that left sectors written but no marker", async () => {
    const { memory, db } = world();
    memory.collection("corporateSectors").docs[0].producerInventory = {
      worldEpoch: "w",
      turn: 99,
      inputStock: [],
      outputStock: [],
    };
    const result = await applyProducerOpening(db, {
      plan: plan(),
      planDigest: "d",
      approvedDigest: "d",
    });
    expect(result.status).toBe("applied");
    expect(memory.collection("gameState").docs[0].producerOpening).toMatchObject({ digest: "d" });
  });

  it("refuses a sector that already holds another generation", async () => {
    const { memory, db } = world();
    memory.collection("corporateSectors").docs[0].producerInventory = {
      worldEpoch: "old",
      turn: 3,
      inputStock: [],
      outputStock: [],
    };
    await expect(
      applyProducerOpening(db, { plan: plan(), planDigest: "d", approvedDigest: "d" })
    ).rejects.toThrow(/matched 0 of 1 sectors/);
    expect(memory.collection("gameState").docs[0].producerOpening).toBeUndefined();
  });
});
