import { it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { recordBondCouponFees } from "./bondCouponFeeHistory";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
it.each([false, true])(
  "replays a fee/history write interrupted afterWrite=%s without accumulating",
  async (afterWrite) => {
    const memory = createInMemoryDb();
    const corp = new ObjectId();
    memory.seed("corporationHistory", [
      {
        _id: new ObjectId(),
        corporationId: corp,
        turn: 5,
        currencyCode: "JPY",
        fxRateAtWrite: 150,
      },
    ]);
    memory.seed("bankMoneyMoves", [
      {
        _id: "funded",
        kind: "sovereign_coupon_funded_payout",
        turn: 5,
        legs: [
          {
            kind: "credit",
            amount: 300,
            valuation: { currencyCode: "JPY", localPerAnchor: 150 },
            collection: "corporations",
            filter: { _id: corp },
            path: "liquidCapital",
            applied: true,
          },
        ],
      },
    ]);
    const fault = withInjectedCrash(memory, {
      collection: "corporationHistory",
      op: "bulkWrite",
      onCall: 1,
      afterWrite,
    });
    const fees = new Map([[corp.toHexString(), 0.5]]);
    const income = new Map([[corp.toHexString(), 10]]);
    const costs = new Map([[corp.toHexString(), 3]]);
    try {
      await recordBondCouponFees(fault.db, 5, fees, income, costs);
    } catch {
      /* Simulated process interruption. */
    }
    expect(fault.crashed).toBe(true);
    fault.disarm();
    await recordBondCouponFees(fault.db, 5, fees, income, costs);
    await recordBondCouponFees(fault.db, 5, fees, income, costs);
    expect(memory.collection("corporationHistory").docs[0]).toMatchObject({
      bondCouponFxFees: 75,
      settledBondCouponIncome: 1800,
      settledBondInterestPaid: 450,
    });
  }
);
it("does not claim a complete result for an interrupted funded payout", async () => {
  const memory = createInMemoryDb();
  const corp = new ObjectId();
  memory.seed("corporationHistory", [
    { _id: new ObjectId(), corporationId: corp, turn: 5, currencyCode: "USD", fxRateAtWrite: 1 },
  ]);
  memory.seed("bankMoneyMoves", [
    {
      _id: "partial",
      kind: "sovereign_coupon_funded_payout",
      turn: 5,
      legs: [
        {
          kind: "credit",
          amount: 10,
          collection: "corporations",
          filter: { _id: corp },
          path: "liquidCapital",
          applied: false,
        },
      ],
    },
  ]);
  await recordBondCouponFees(memory as unknown as Db, 5, new Map(), new Map(), new Map());
  expect(memory.collection("corporationHistory").docs[0].settledBondCouponIncome).toBeUndefined();
});
