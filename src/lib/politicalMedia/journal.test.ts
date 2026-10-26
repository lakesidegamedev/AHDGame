import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  applyPoliticalMediaOrderEffect,
  fundPoliticalMediaOrder,
  loadPoliticalMediaOrdersForClearing,
  politicalMediaOrderKey,
  resumePoliticalMediaOrderFunding,
  savePoliticalMediaSettlementPlan,
  savePoliticalMediaSettlementPlans,
  settlePoliticalMediaOrder,
} from "./journal";
import { settlePoliticalAdMarket } from "./market";
import type { SectorClearingInput, SectorClearingResult } from "@/lib/market/clearing";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

function setup() {
  const memory = createInMemoryDb();
  memory.seed("characters", [{ _id: "payer", cash: 250, actions: 4 }]);
  memory.seed("corporations", [{ _id: "corp", liquidCapital: 5 }]);
  const db = memory as unknown as Db;
  return { memory, db };
}

const funding = (targetStateId = "CA") => ({
  orderId: "order-1",
  source: "advertise" as const,
  createdTurn: 12,
  countryId: "US",
  targetStateId,
  payer: {
    collection: "characters" as const,
    documentId: "payer",
    path: "cash",
    currencyCode: "USD",
    localPerAnchor: 2,
    amountLocal: 100,
    currentActions: 4,
    actionCost: 1,
  },
});

const plan = {
  plannedTurn: 12,
  deliveredAnchor: 30,
  unfilledAnchor: 20,
  deliveredUnits: 3,
  sellers: [
    {
      allocationId: "alloc-1",
      sectorId: "media-sector",
      corporationId: "corp",
      units: 3,
      amountAnchor: 30,
      sellerLocalAmount: 45,
      sellerCurrencyCode: "EUR",
      sellerLocalPerAnchor: 1.5,
    },
  ],
};

describe("political media order journal", () => {
  it("preserves fractional action balances while funding an integer-cost ad", async () => {
    const { memory, db } = setup();
    memory.collection("characters").docs[0].actions = 4.5;
    const request = funding();
    request.payer.currentActions = 4.5;
    expect((await fundPoliticalMediaOrder(db, request)).status).toBe("applied");
    expect(memory.collection("characters").docs[0]).toMatchObject({ cash: 150, actions: 3.5 });
    expect((await fundPoliticalMediaOrder(db, request)).status).toBe("replayed");
    expect(memory.collection("characters").docs[0].actions).toBe(3.5);
  });

  it("rejects an ad when the remaining fractional action balance cannot fund it", async () => {
    const { memory, db } = setup();
    memory.collection("characters").docs[0].actions = 0.5;
    const request = funding();
    request.payer.currentActions = 0.5;
    expect((await fundPoliticalMediaOrder(db, request)).status).toBe("rejected");
    expect(memory.collection("characters").docs[0]).toMatchObject({ cash: 250, actions: 0.5 });
  });

  it("projects only order data when loading current and open orders", async () => {
    const { memory, db } = setup();
    expect((await fundPoliticalMediaOrder(db, funding())).status).toBe("applied");
    const find = vi.spyOn(memory.collection("bankMoneyMoves"), "find");

    await loadPoliticalMediaOrdersForClearing(db, 12);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "political-media-order",
        status: "applied",
        $or: expect.any(Array),
      }),
      { projection: { _id: 1, kind: 1, status: 1, politicalMediaOrder: 1 } }
    );
  });

  it("funds once, pays exact seller receipt, and refunds unfilled escrow at frozen payer FX", async () => {
    const { memory, db } = setup();

    expect((await fundPoliticalMediaOrder(db, funding())).status).toBe("applied");
    expect((await fundPoliticalMediaOrder(db, funding())).status).toBe("replayed");
    await savePoliticalMediaSettlementPlan(db, "order-1", plan);
    await expect(
      savePoliticalMediaSettlementPlan(db, "order-1", { ...plan, deliveredAnchor: 31 })
    ).rejects.toThrow("invalid settlement total");
    const results = await settlePoliticalMediaOrder(db, "order-1", 12);

    expect(results.every((result) => result.status === "applied")).toBe(true);
    expect(memory.collection("characters").docs[0]).toMatchObject({ cash: 190, actions: 3 });
    expect(memory.collection("corporations").docs[0]).toMatchObject({
      liquidCapital: 50,
      politicalMediaReceipts: {
        "order-1": { "alloc-1": expect.objectContaining({ sellerLocalAmount: 45 }) },
      },
    });
    const journal = memory
      .collection("bankMoneyMoves")
      .docs.find((row) => row._id === politicalMediaOrderKey("order-1"));
    expect(journal?.politicalMediaOrder).toMatchObject({
      status: "settled",
      escrowBalanceAnchor: 0,
    });
    expect((await settlePoliticalMediaOrder(db, "order-1", 13)).length).toBe(0);
    expect(memory.collection("characters").docs[0]?.cash).toBe(190);
  });

  it("replays a paid seller allocation after interruption before sector P&L publish", async () => {
    const { memory, db } = setup();
    const journal = memory.collection("bankMoneyMoves");
    expect((await fundPoliticalMediaOrder(db, funding())).status).toBe("applied");
    await savePoliticalMediaSettlementPlan(db, "order-1", plan);

    const write = journal.updateOne.bind(journal);
    const interrupt = vi
      .spyOn(journal, "updateOne")
      .mockImplementation(async (filter, update, options) => {
        const set = !Array.isArray(update)
          ? (update.$set as Record<string, unknown> | undefined)
          : undefined;
        if (set?.["politicalMediaOrder.status"] === "settled") {
          throw new Error("turn stopped before sector P&L publish");
        }
        return write(filter, update, options);
      });
    await expect(settlePoliticalMediaOrder(db, "order-1", 12)).rejects.toThrow(
      "turn stopped before sector P&L publish"
    );
    interrupt.mockRestore();

    expect(memory.collection("corporations").docs[0]?.liquidCapital).toBe(50);
    expect(memory.collection("characters").docs[0]?.cash).toBe(190);
    const pendingPnlReplay = await loadPoliticalMediaOrdersForClearing(db, 12);
    expect(pendingPnlReplay).toHaveLength(1);

    const sectorInput: SectorClearingInput = {
      sectorId: "media-sector",
      revenue: 100,
      supplyRates: { advertising: 0.5, software: 0.5 },
      posture: 0,
    };
    const sectorClearing: SectorClearingResult = {
      factor: 0.5,
      soldFraction: 0.5,
      soldByCommodity: { advertising: 0.5, software: 0.5 },
      effectivePosture: 0,
    };
    const published = settlePoliticalAdMarket({
      orders: [],
      persistedPlans: pendingPnlReplay
        .filter((order) => order.settlementPlan?.plannedTurn === 12)
        .map((order) => ({ orderId: order.orderId, plan: order.settlementPlan! })),
      offers: [
        {
          input: sectorInput,
          clearing: sectorClearing,
          corporationId: "corp",
          countryId: "US",
          stateId: "CA",
          basePrice: 240,
          priceRatio: 1,
          sellerCurrencyCode: "EUR",
          sellerLocalPerAnchor: 99,
          offeredUnits: 20,
        },
      ],
      clearingBySectorId: new Map([["media-sector", sectorClearing]]),
      clearingEnabled: true,
      qualityPremiumEnabled: true,
      turn: 12,
    });
    expect(published.sellerPayoutLocalByCorpId.get("corp")).toBe(45);
    expect(published.clearingBySectorId.get("media-sector")?.soldByCommodity?.advertising).toBe(
      0.65
    );

    await settlePoliticalMediaOrder(db, "order-1", 12);
    expect(memory.collection("corporations").docs[0]?.liquidCapital).toBe(50);
    expect(memory.collection("characters").docs[0]?.cash).toBe(190);
    expect(await applyPoliticalMediaOrderEffect(db, "order-1")).toBe(true);
    expect(await loadPoliticalMediaOrdersForClearing(db, 12)).toHaveLength(1);
    expect(await loadPoliticalMediaOrdersForClearing(db, 13)).toHaveLength(0);
  });

  it("rejects a changed target identity without taking a second payer debit", async () => {
    const { memory, db } = setup();

    expect((await fundPoliticalMediaOrder(db, funding())).status).toBe("applied");
    expect((await fundPoliticalMediaOrder(db, funding("NY"))).status).toBe("rejected");
    expect(memory.collection("characters").docs[0]?.cash).toBe(150);
  });

  it("does not create funded demand when the quoted payer balance is no longer available", async () => {
    const { memory, db } = setup();
    memory.collection("characters").docs[0]!.cash = 50;

    expect((await fundPoliticalMediaOrder(db, funding())).status).toBe("rejected");
    expect(memory.collection("characters").docs[0]?.cash).toBe(50);
    expect(memory.collection("bankMoneyMoves").docs[0]?.politicalMediaOrder).toMatchObject({
      status: "rejected",
      escrowBalanceAnchor: 0,
    });
  });

  it("resumes a crash after the escrow credit lands without repeating the funding debit", async () => {
    const { memory, db } = setup();
    const journal = memory.collection("bankMoneyMoves");
    const write = journal.updateOne.bind(journal);
    let interrupted = false;
    vi.spyOn(journal, "updateOne").mockImplementation(async (filter, update, options) => {
      const result = await write(filter, update, options);
      const increment = !Array.isArray(update)
        ? (update.$inc as Record<string, unknown> | undefined)
        : undefined;
      if (!interrupted && increment?.["politicalMediaOrder.escrowBalanceAnchor"] === 50) {
        interrupted = true;
        throw new Error("lost escrow acknowledgement");
      }
      return result;
    });

    await expect(fundPoliticalMediaOrder(db, funding())).rejects.toThrow(
      "lost escrow acknowledgement"
    );
    expect(memory.collection("characters").docs[0]?.cash).toBe(150);
    expect((await resumePoliticalMediaOrderFunding(db, "order-1")).status).toBe("applied");
    expect(memory.collection("characters").docs[0]?.cash).toBe(150);
    expect(journal.docs[0]?.politicalMediaOrder).toMatchObject({
      status: "open",
      escrowBalanceAnchor: 50,
    });
  });
});

/** Fund each order in turn: every funding spends one action, so each request
 * must quote the balance it actually finds. */
async function fundOrders(db: Db, memory: ReturnType<typeof createInMemoryDb>, ids: string[]) {
  memory.collection("characters").docs[0].cash = 1000;
  let actions = 4;
  for (const orderId of ids) {
    const request = funding();
    request.orderId = orderId;
    request.payer.currentActions = actions;
    memory.collection("characters").docs[0].actions = actions;
    expect((await fundPoliticalMediaOrder(db, request)).status).toBe("applied");
    actions -= 1;
  }
}

describe("political media settlement plans saved as one turn batch", () => {
  it("writes every plan in three round trips and keeps each order's own plan", async () => {
    const { memory, db } = setup();
    await fundOrders(db, memory, ["order-1", "order-2", "order-3"]);
    const journal = memory.collection("bankMoneyMoves");
    const find = vi.spyOn(journal, "find");
    const bulkWrite = vi.spyOn(journal, "bulkWrite");

    const saved = await savePoliticalMediaSettlementPlans(db, [
      { orderId: "order-1", plan },
      { orderId: "order-2", plan },
      { orderId: "order-3", plan },
    ]);

    expect(saved.get("order-2")).toEqual(plan);
    // One read for the whole cohort, one guarded write, one re-read.
    expect(find).toHaveBeenCalledTimes(2);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    for (const orderId of ["order-1", "order-2", "order-3"]) {
      expect(
        journal.docs.find((row) => row._id === politicalMediaOrderKey(orderId))?.politicalMediaOrder
      ).toMatchObject({ status: "settling", settlementPlan: plan });
    }
  });

  it("returns the durable plan an order already carries instead of overwriting it", async () => {
    const { memory, db } = setup();
    await fundOrders(db, memory, ["order-1", "order-2"]);
    const first = {
      ...plan,
      deliveredAnchor: 20,
      unfilledAnchor: 30,
      deliveredUnits: 2,
      sellers: [{ ...plan.sellers[0], units: 2, amountAnchor: 20, sellerLocalAmount: 30 }],
    };
    await savePoliticalMediaSettlementPlans(db, [{ orderId: "order-1", plan: first }]);

    const saved = await savePoliticalMediaSettlementPlans(db, [
      { orderId: "order-1", plan },
      { orderId: "order-2", plan },
    ]);

    // The first turn's plan wins for order-1, exactly as the per-order saver did.
    expect(saved.get("order-1")).toEqual(first);
    expect(saved.get("order-2")).toEqual(plan);
  });

  it("refuses the batch before writing anything when an order never funded", async () => {
    const { memory, db } = setup();
    await fundOrders(db, memory, ["order-1"]);
    const journal = memory.collection("bankMoneyMoves");
    const before = JSON.stringify(journal.docs);

    await expect(
      savePoliticalMediaSettlementPlans(db, [
        { orderId: "order-1", plan },
        { orderId: "order-missing", plan },
      ])
    ).rejects.toThrow("Political media order order-missing is not fully funded.");
    expect(JSON.stringify(journal.docs)).toBe(before);
  });
});
