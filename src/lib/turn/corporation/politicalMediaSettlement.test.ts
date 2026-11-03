/**
 * The turn shell around political media settlement: planned units, paid seller
 * units and settled orders are what the product and editorial phases read, and
 * every settled order's effect has to be applied once.
 */
import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  fundPoliticalMediaOrder,
  loadPoliticalMediaOrdersForClearing,
  savePoliticalMediaSettlementPlans,
} from "@/lib/politicalMedia/journal";
import { settlePoliticalMediaOrdersTurn } from "./politicalMediaSettlement";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const TURN = 21;

async function world() {
  const memory = createInMemoryDb();
  memory.seed("characters", [
    { _id: "payer", cash: 500, actions: 5 },
    { _id: "target", favorability: 20 },
  ]);
  memory.seed("corporations", [
    { _id: "corp-eur", liquidCapital: 0 },
    { _id: "corp-gbp", liquidCapital: 0 },
  ]);
  const db = memory as unknown as Db;
  const orders = [
    {
      orderId: "order-early",
      amountLocal: 80,
      plan: {
        plannedTurn: TURN,
        deliveredAnchor: 40,
        unfilledAnchor: 0,
        deliveredUnits: 2,
        sellers: [
          {
            allocationId: "alloc-early",
            sectorId: "media-a",
            corporationId: "corp-eur",
            units: 2,
            amountAnchor: 40,
            sellerLocalAmount: 60,
            sellerCurrencyCode: "EUR",
            sellerLocalPerAnchor: 1.5,
          },
        ],
      },
    },
    {
      orderId: "order-late",
      amountLocal: 40,
      plan: {
        plannedTurn: TURN - 1,
        deliveredAnchor: 20,
        unfilledAnchor: 0,
        deliveredUnits: 1,
        sellers: [
          {
            allocationId: "alloc-late",
            sectorId: "media-b",
            corporationId: "corp-gbp",
            units: 1,
            amountAnchor: 20,
            sellerLocalAmount: 16,
            sellerCurrencyCode: "GBP",
            sellerLocalPerAnchor: 0.8,
          },
        ],
      },
    },
  ];
  for (const order of orders) {
    const funded = await fundPoliticalMediaOrder(db, {
      orderId: order.orderId,
      source: "advertise",
      createdTurn: TURN - 1,
      countryId: "US",
      targetStateId: "CA",
      payer: {
        collection: "characters",
        documentId: "payer",
        path: "cash",
        currencyCode: "USD",
        localPerAnchor: 2,
        amountLocal: order.amountLocal,
      },
      details: {
        effect: {
          kind: "favorability",
          targetCollection: "characters",
          targetDocumentId: "target",
          targetDocumentIdIsObjectId: false,
          amount: 8,
        },
      },
    });
    expect(funded.status).toBe("applied");
  }
  await savePoliticalMediaSettlementPlans(
    db,
    orders.map((order) => ({
      orderId: order.orderId,
      plan: order.plan,
    }))
  );
  return { memory, db, orders };
}

describe("political media settlement turn", () => {
  it("reports this turn's planned and paid seller units and settles its orders", async () => {
    const { memory, db } = await world();
    const loaded = await loadPoliticalMediaOrdersForClearing(db, TURN);

    const result = await settlePoliticalMediaOrdersTurn({
      db,
      orders: loaded,
      turn: TURN,
      currentTurnNumber: TURN,
      plannedByOrderId: new Map(),
      mediaProductSlatesEnabled: true,
    });

    // Only the plan this turn's clearing wrote counts as planned units.
    expect([...result.plannedUnitsBySectorId]).toEqual([["media-a", 2]]);
    // A plan from an earlier turn still pays, but does not count as this turn's
    // media product delivery.
    expect([...result.paidSellerBySectorId]).toEqual([["media-a", { units: 2, amountAnchor: 40 }]]);
    // Attention only carries the orders that settled this turn.
    expect(result.settledOrders.map((order) => order.orderId)).toEqual(["order-early"]);
    expect(memory.collection("corporations").docs).toMatchObject([
      { _id: "corp-eur", liquidCapital: 60 },
      { _id: "corp-gbp", liquidCapital: 16 },
    ]);
    // Both orders settled, so both applied their favour, each scaled by its own
    // fill ratio.
    expect(memory.collection("characters").docs.find((doc) => doc._id === "target")!).toMatchObject(
      {
        favorability: 36,
      }
    );
  });

  it("leaves nothing planned or paid when no order carries a plan", async () => {
    const { db } = await world();
    const result = await settlePoliticalMediaOrdersTurn({
      db,
      orders: [],
      turn: TURN,
      currentTurnNumber: TURN,
      plannedByOrderId: new Map(),
      mediaProductSlatesEnabled: false,
    });
    expect(result.plannedUnitsBySectorId.size).toBe(0);
    expect(result.paidSellerBySectorId.size).toBe(0);
    expect(result.settledOrders).toHaveLength(0);
  });
});
