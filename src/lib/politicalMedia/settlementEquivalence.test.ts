/**
 * One journaled settlement per buyer pays the same money as one move per seller
 * allocation.
 *
 * Funding, plans and the per-allocation settlement are the code this change
 * replaced, kept below as `settlePerAllocationReference` so the two settlements
 * can be run against the same world and compared document for document. The
 * fixture is deliberately awkward: six orders, sellers in four currencies, two
 * allocations paid to one corporation, one order filled short enough to refund,
 * one no-outlet fallback, one order whose escrow stays short when an allocation
 * cannot be delivered, and effects on three different targets.
 *
 * A refused payout is where the two paths differ in shape and must not differ in
 * outcome: the per-seller path converges on its next pass, so the reference is
 * run to convergence and the batch has to reach the same documents in one pass.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import { withInjectedCrash, InjectedCrash } from "@/lib/test-utils/faultyDb";
import {
  applyMoneyMove,
  MONEY_MOVE_COLLECTION,
  resumeMoneyMove,
  type MoneyMoveResult,
} from "@/lib/banking/moneyMove";
import {
  applyPoliticalMediaOrderEffects,
  fundPoliticalMediaOrder,
  loadPoliticalMediaOrdersForClearing,
  savePoliticalMediaSettlementPlans,
  settleLoadedPoliticalMediaOrders,
  politicalMediaOrderKey,
  POLITICAL_MEDIA_ORDER_KIND,
  type PoliticalMediaOrderForClearing,
  type PoliticalMediaSettlementPlan,
} from "./journal";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const TURN = 12;

interface SellerSpec {
  allocationId: string;
  sectorId: string;
  corporationId: string;
  units: number;
  amountAnchor: number;
  currency: string;
  localPerAnchor: number;
}

interface OrderSpec {
  orderId: string;
  payerId: string;
  payerCurrency: string;
  payerLocalPerAnchor: number;
  requestedAnchor: number;
  plan: {
    deliveredAnchor: number;
    unfilledAnchor: number;
    deliveredUnits: number;
    sellers: PoliticalMediaSettlementPlan["sellers"];
    fallbackSpend?: PoliticalMediaSettlementPlan["fallbackSpend"];
  };
  effect?: Record<string, unknown>;
}

function seller(spec: SellerSpec): PoliticalMediaSettlementPlan["sellers"][number] {
  return {
    allocationId: spec.allocationId,
    sectorId: spec.sectorId,
    corporationId: spec.corporationId,
    units: spec.units,
    amountAnchor: spec.amountAnchor,
    sellerLocalAmount: spec.amountAnchor * spec.localPerAnchor,
    sellerCurrencyCode: spec.currency,
    sellerLocalPerAnchor: spec.localPerAnchor,
  };
}

/**
 * Six funded orders. `order-delta` names `corp-absent`, which is never seeded,
 * so its middle allocation can never be delivered.
 */
const ORDERS: OrderSpec[] = [
  {
    orderId: "order-apex",
    payerId: "payer-usd",
    payerCurrency: "USD",
    payerLocalPerAnchor: 2,
    requestedAnchor: 60,
    plan: {
      deliveredAnchor: 40,
      unfilledAnchor: 20,
      deliveredUnits: 4,
      sellers: [
        seller({
          allocationId: "alloc-apex-1",
          sectorId: "media-ca-a",
          corporationId: "corp-usd",
          units: 4,
          amountAnchor: 40,
          currency: "USD",
          localPerAnchor: 2,
        }),
      ],
    },
  },
  {
    orderId: "order-beacon",
    payerId: "payer-usd",
    payerCurrency: "USD",
    payerLocalPerAnchor: 2,
    requestedAnchor: 90,
    plan: {
      deliveredAnchor: 90,
      unfilledAnchor: 0,
      deliveredUnits: 6,
      sellers: [
        seller({
          allocationId: "alloc-beacon-1",
          sectorId: "media-ca-a",
          corporationId: "corp-eur",
          units: 3,
          amountAnchor: 50,
          currency: "EUR",
          localPerAnchor: 1.5,
        }),
        seller({
          allocationId: "alloc-beacon-2",
          sectorId: "media-ca-b",
          corporationId: "corp-gbp",
          units: 3,
          amountAnchor: 40,
          currency: "GBP",
          localPerAnchor: 0.8,
        }),
      ],
    },
    effect: {
      kind: "favorability",
      targetCollection: "characters",
      targetDocumentId: "target-one",
      targetDocumentIdIsObjectId: false,
      amount: 12,
    },
  },
  {
    orderId: "order-civic",
    payerId: "payer-gbp",
    payerCurrency: "GBP",
    payerLocalPerAnchor: 0.8,
    requestedAnchor: 40,
    plan: {
      deliveredAnchor: 40,
      unfilledAnchor: 0,
      deliveredUnits: 6,
      sellers: [
        // Two allocations of one corporation: one payee, one credit.
        seller({
          allocationId: "alloc-civic-1",
          sectorId: "media-ny-a",
          corporationId: "corp-eur",
          units: 2,
          amountAnchor: 20,
          currency: "EUR",
          localPerAnchor: 1.5,
        }),
        seller({
          allocationId: "alloc-civic-2",
          sectorId: "media-ny-b",
          corporationId: "corp-eur",
          units: 1,
          amountAnchor: 10,
          currency: "EUR",
          localPerAnchor: 1.5,
        }),
        seller({
          allocationId: "alloc-civic-3",
          sectorId: "media-ny-c",
          corporationId: "corp-gbp",
          units: 1,
          amountAnchor: 3,
          currency: "GBP",
          localPerAnchor: 0.8,
        }),
        seller({
          allocationId: "alloc-civic-4",
          sectorId: "media-ny-d",
          corporationId: "corp-jpy",
          units: 1,
          amountAnchor: 3,
          currency: "JPY",
          localPerAnchor: 100,
        }),
        seller({
          allocationId: "alloc-civic-5",
          sectorId: "media-ny-e",
          corporationId: "corp-usd",
          units: 1,
          amountAnchor: 4,
          currency: "USD",
          localPerAnchor: 2,
        }),
      ],
    },
  },
  {
    orderId: "order-delta",
    payerId: "payer-usd",
    payerCurrency: "USD",
    payerLocalPerAnchor: 2,
    requestedAnchor: 30,
    plan: {
      deliveredAnchor: 30,
      unfilledAnchor: 0,
      deliveredUnits: 3,
      sellers: [
        seller({
          allocationId: "alloc-delta-1",
          sectorId: "media-tx-a",
          corporationId: "corp-usd",
          units: 1,
          amountAnchor: 10,
          currency: "USD",
          localPerAnchor: 2,
        }),
        seller({
          allocationId: "alloc-delta-2",
          sectorId: "media-tx-b",
          corporationId: "corp-absent",
          units: 1,
          amountAnchor: 10,
          currency: "USD",
          localPerAnchor: 2,
        }),
        seller({
          allocationId: "alloc-delta-3",
          sectorId: "media-tx-c",
          corporationId: "corp-gbp",
          units: 1,
          amountAnchor: 10,
          currency: "GBP",
          localPerAnchor: 0.8,
        }),
      ],
    },
  },
  {
    orderId: "order-echo",
    payerId: "payer-usd",
    payerCurrency: "USD",
    payerLocalPerAnchor: 2,
    requestedAnchor: 50,
    plan: {
      deliveredAnchor: 25,
      unfilledAnchor: 25,
      deliveredUnits: 0,
      sellers: [],
      fallbackSpend: {
        amountAnchor: 25,
        countryId: "US",
        budgetId: "budget-us",
        currencyCode: "USD",
        currencyCodePresent: true,
        rawCurrencyCode: "USD",
        localPerAnchor: 2,
        amountLocal: 50,
        balancePath: "treasuryBalance",
      },
    },
    effect: {
      kind: "targeted_ad",
      targetCollection: "characters",
      targetDocumentId: "target-two",
      targetDocumentIdIsObjectId: false,
      ad: { stateId: "CA", dimension: "economic", bucket: "all", bonus: 4, lastPurchaseTurn: TURN },
    },
  },
  {
    orderId: "order-foxtrot",
    payerId: "payer-gbp",
    payerCurrency: "GBP",
    payerLocalPerAnchor: 0.8,
    requestedAnchor: 30,
    plan: {
      deliveredAnchor: 30,
      unfilledAnchor: 0,
      deliveredUnits: 3,
      sellers: [
        seller({
          allocationId: "alloc-foxtrot-1",
          sectorId: "media-fl-a",
          corporationId: "corp-usd",
          units: 3,
          amountAnchor: 30,
          currency: "USD",
          localPerAnchor: 2,
        }),
      ],
    },
  },
];

function buildWorld(): InMemoryDb {
  const memory = createInMemoryDb();
  memory.seed("characters", [
    { _id: "payer-usd", cash: 1000, actions: 20, favorability: 40 },
    { _id: "payer-gbp", cash: 1000, actions: 20, favorability: 10 },
    { _id: "target-one", favorability: 40 },
    { _id: "target-two", favorability: 10 },
  ]);
  memory.seed("corporations", [
    { _id: "corp-usd", liquidCapital: 100 },
    { _id: "corp-eur", liquidCapital: 100 },
    { _id: "corp-gbp", liquidCapital: 100 },
    { _id: "corp-jpy", liquidCapital: 100 },
  ]);
  memory.seed("federalBudget", [
    { _id: "budget-us", countryId: "US", currencyCode: "USD", treasuryBalance: 500 },
  ]);
  return memory;
}

/** Fund every order and store its clearing plan, exactly as the turn does. */
async function fundAndPlan(db: Db, memory: InMemoryDb): Promise<void> {
  const actions = new Map<string, number>();
  for (const spec of ORDERS) {
    const payer = memory.collection("characters").docs.find((doc) => doc._id === spec.payerId)!;
    const currentActions = (actions.get(spec.payerId) ?? (payer.actions as number)) as number;
    actions.set(spec.payerId, currentActions - 0);
    const result = await fundPoliticalMediaOrder(db, {
      orderId: spec.orderId,
      source: "advertise",
      createdTurn: TURN,
      countryId: "US",
      targetStateId: "CA",
      payer: {
        collection: "characters",
        documentId: spec.payerId,
        path: "cash",
        currencyCode: spec.payerCurrency,
        localPerAnchor: spec.payerLocalPerAnchor,
        amountLocal: spec.requestedAnchor * spec.payerLocalPerAnchor,
      },
      ...(spec.effect ? { details: { effect: spec.effect } } : {}),
    });
    expect(result.status).toBe("applied");
  }
  await savePoliticalMediaSettlementPlans(
    db,
    ORDERS.map((spec) => ({
      orderId: spec.orderId,
      plan: {
        plannedTurn: TURN,
        deliveredAnchor: spec.plan.deliveredAnchor,
        unfilledAnchor: spec.plan.unfilledAnchor,
        deliveredUnits: spec.plan.deliveredUnits,
        sellers: spec.plan.sellers,
        ...(spec.plan.fallbackSpend ? { fallbackSpend: spec.plan.fallbackSpend } : {}),
      },
    }))
  );
}

/** The settlement this change replaced, copied verbatim as the A/B reference. */
function persistedId(value: string, isObjectId: boolean): ObjectId | string {
  return isObjectId ? new ObjectId(value) : value;
}

async function finishOrResumeMove(
  db: Db,
  key: string,
  result: MoneyMoveResult
): Promise<MoneyMoveResult> {
  if (result.status === "applied" || result.status === "rejected") return result;
  if (result.status === "partial") return resumeMoneyMove(db, key);
  const record = await db
    .collection(MONEY_MOVE_COLLECTION)
    .findOne({ _id: key }, { projection: { status: 1 } });
  if (!record) return { status: "rejected", applied: [], error: `no money move ${key}` };
  if (record.status === "applied") return { status: "applied", applied: [] };
  if (record.status === "rejected")
    return { status: "rejected", applied: [], error: `money move ${key} was rejected` };
  return resumeMoneyMove(db, key);
}

async function settlePerAllocationReference(
  db: Db,
  order: Pick<PoliticalMediaOrderForClearing, "orderId" | "status" | "identity" | "settlementPlan">,
  turn: number
): Promise<MoneyMoveResult[]> {
  const { orderId } = order;
  const key = politicalMediaOrderKey(orderId);
  const orders = db.collection(MONEY_MOVE_COLLECTION);
  const saved = order;
  if (!saved.settlementPlan) throw new Error("no funded settlement plan");
  if (saved.status === "settled") return [];
  const plan = saved.settlementPlan;
  const results: MoneyMoveResult[] = [];
  for (const planSeller of plan.sellers) {
    const receiptIdentity = {
      orderId,
      allocationId: planSeller.allocationId,
      targetStateId: saved.identity.targetStateId,
      sectorId: planSeller.sectorId,
      corporationId: planSeller.corporationId,
      units: planSeller.units,
      amountAnchor: planSeller.amountAnchor,
      sellerLocalAmount: planSeller.sellerLocalAmount,
      sellerCurrencyCode: planSeller.sellerCurrencyCode,
      sellerLocalPerAnchor: planSeller.sellerLocalPerAnchor,
    };
    const payoutKey = `political-media-seller:${orderId}:${planSeller.allocationId}`;
    const payoutAttempt = await applyMoneyMove(db, {
      key: payoutKey,
      kind: "political-media-seller-receipt",
      turn,
      quoteIdentity: receiptIdentity,
      record: { politicalMediaOrderIdentity: receiptIdentity },
      legs: [
        {
          kind: "debit",
          amount: planSeller.amountAnchor,
          valuation: { currencyCode: "AHD", localPerAnchor: 1 },
          collection: MONEY_MOVE_COLLECTION,
          filter: { _id: key, kind: POLITICAL_MEDIA_ORDER_KIND, status: "applied" },
          path: "politicalMediaOrder.escrowBalanceAnchor",
          note: `pay seller ${planSeller.corporationId} for political advertising order ${orderId}`,
        },
        {
          kind: "credit",
          amount: planSeller.sellerLocalAmount,
          valuation: {
            currencyCode: planSeller.sellerCurrencyCode,
            localPerAnchor: planSeller.sellerLocalPerAnchor,
          },
          collection: "corporations",
          filter: {
            _id: persistedId(planSeller.corporationId, ObjectId.isValid(planSeller.corporationId)),
          },
          path: "liquidCapital",
          set: {
            [`politicalMediaReceipts.${orderId}.${planSeller.allocationId}`]: receiptIdentity,
          },
          note: `political advertising receipt for order ${orderId}`,
        },
      ],
    });
    const payout = await finishOrResumeMove(db, payoutKey, payoutAttempt);
    results.push(payout);
    if (payout.status !== "applied" && payout.status !== "replayed") return results;
  }
  const fallback = plan.fallbackSpend;
  if (fallback && fallback.amountAnchor > 0) {
    const fallbackKey = `political-media-no-outlet:${orderId}`;
    const rawCurrencyGuard = fallback.currencyCodePresent
      ? [{ currencyCode: { $exists: true } }, { currencyCode: fallback.rawCurrencyCode }]
      : [{ currencyCode: { $exists: false } }];
    const fallbackIdentity = {
      orderId,
      countryId: fallback.countryId,
      targetStateId: saved.identity.targetStateId,
      amountAnchor: fallback.amountAnchor,
      budgetId: fallback.budgetId,
      currencyCode: fallback.currencyCode,
      currencyCodePresent: fallback.currencyCodePresent,
      rawCurrencyCode: fallback.rawCurrencyCode ?? null,
      localPerAnchor: fallback.localPerAnchor,
      amountLocal: fallback.amountLocal,
      balancePath: fallback.balancePath,
    };
    const fallbackAttempt = await applyMoneyMove(db, {
      key: fallbackKey,
      kind: "political-media-no-outlet-fallback",
      turn: plan.plannedTurn,
      quoteIdentity: fallbackIdentity,
      record: { politicalMediaOrderIdentity: fallbackIdentity },
      legs: [
        {
          kind: "debit",
          amount: fallback.amountAnchor,
          valuation: { currencyCode: "AHD", localPerAnchor: 1 },
          collection: MONEY_MOVE_COLLECTION,
          filter: { _id: key, kind: POLITICAL_MEDIA_ORDER_KIND, status: "applied" },
          path: "politicalMediaOrder.escrowBalanceAnchor",
          note: `spend funded local fallback for political advertising order ${orderId}`,
        },
        {
          kind: "credit",
          amount: fallback.amountLocal,
          valuation: {
            currencyCode: fallback.currencyCode,
            localPerAnchor: fallback.localPerAnchor,
          },
          collection: "federalBudget",
          filter: { _id: fallback.budgetId, countryId: fallback.countryId, $and: rawCurrencyGuard },
          path: fallback.balancePath,
          note: `credit local no-outlet broadcaster fund for political advertising order ${orderId}`,
        },
      ],
    });
    const fallbackReceipt = await finishOrResumeMove(db, fallbackKey, fallbackAttempt);
    results.push(fallbackReceipt);
    if (fallbackReceipt.status !== "applied" && fallbackReceipt.status !== "replayed")
      return results;
  }
  const payer = saved.identity.payer;
  if (plan.unfilledAnchor > 0) {
    const refundLocal = plan.unfilledAnchor * payer.localPerAnchor;
    const refundKey = `political-media-refund:${orderId}`;
    const refundAttempt = await applyMoneyMove(db, {
      key: refundKey,
      kind: "political-media-refund",
      turn,
      quoteIdentity: {
        orderId,
        targetStateId: saved.identity.targetStateId,
        refundAnchor: plan.unfilledAnchor,
        refundLocal,
        payerCurrencyCode: payer.currencyCode,
        payerLocalPerAnchor: payer.localPerAnchor,
      },
      record: {
        politicalMediaOrderIdentity: {
          orderId,
          targetStateId: saved.identity.targetStateId,
          refundAnchor: plan.unfilledAnchor,
          refundLocal,
          payerCurrencyCode: payer.currencyCode,
          payerLocalPerAnchor: payer.localPerAnchor,
        },
      },
      legs: [
        {
          kind: "debit",
          amount: plan.unfilledAnchor,
          valuation: { currencyCode: "AHD", localPerAnchor: 1 },
          collection: MONEY_MOVE_COLLECTION,
          filter: { _id: key, kind: POLITICAL_MEDIA_ORDER_KIND, status: "applied" },
          path: "politicalMediaOrder.escrowBalanceAnchor",
          note: `release unfilled escrow for political advertising order ${orderId}`,
        },
        {
          kind: "credit",
          amount: refundLocal,
          valuation: { currencyCode: payer.currencyCode, localPerAnchor: payer.localPerAnchor },
          collection: payer.collection,
          filter: { _id: persistedId(payer.documentId, payer.documentIdIsObjectId) },
          path: payer.path,
          note: `refund unfilled political advertising order ${orderId}`,
        },
      ],
    });
    const refund = await finishOrResumeMove(db, refundKey, refundAttempt);
    results.push(refund);
    if (refund.status !== "applied" && refund.status !== "replayed") return results;
  }
  await orders.updateOne(
    { _id: key, kind: POLITICAL_MEDIA_ORDER_KIND, status: "applied" },
    { $set: { "politicalMediaOrder.status": "settled" } }
  );
  return results;
}

/** Run the pre-change settlement and effects until it stops changing. */
async function settleTheOldWay(db: Db, passes: number): Promise<void> {
  for (let pass = 0; pass < passes; pass++) {
    const orders = await loadPoliticalMediaOrdersForClearing(db, TURN);
    for (const order of orders) await settlePerAllocationReference(db, order, TURN);
    await applyPoliticalMediaOrderEffects(
      db,
      orders.map((order) => order.orderId)
    );
  }
}

/** The batch under test, over the orders the clearing pass loaded. */
async function settleTogether(db: Db): Promise<void> {
  const orders = await loadPoliticalMediaOrdersForClearing(db, TURN);
  await settleLoadedPoliticalMediaOrders(db, orders, TURN);
  await applyPoliticalMediaOrderEffects(
    db,
    orders.map((order) => order.orderId)
  );
}

/** Journal housekeeping and timestamps differ by construction, never by money. */
const MOVE_FIELDS = new Set([
  "settledKeys",
  "moneyMoveRevision",
  "pendingMoneyMoveReceipt",
  "updatedAt",
]);

function plain(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value * 1e9) / 1e9;
  if (value instanceof Date) return "<date>";
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !MOVE_FIELDS.has(key))
        .map(([key, item]) => [key, plain(item)])
    );
  }
  return value;
}

/** Every document except the journal, plus each order's own escrow and status. */
function settledState(memory: InMemoryDb): unknown {
  const collections = Object.fromEntries(
    [...memory.collections.entries()]
      // The journal itself and the counters that describe its dispositions are
      // the one thing this change is meant to reshape.
      .filter(([name]) => name !== MONEY_MOVE_COLLECTION && name !== "bankingTelemetry")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, collection]) => [
        name,
        [...collection.docs]
          .sort((left, right) => String(left._id).localeCompare(String(right._id)))
          .map((doc) => plain(doc)),
      ])
  );
  const escrow = memory
    .collection(MONEY_MOVE_COLLECTION)
    .docs.filter((row) => row.kind === POLITICAL_MEDIA_ORDER_KIND)
    .map((row) => {
      const order = row.politicalMediaOrder as
        { status?: string; escrowBalanceAnchor?: number; effectApplied?: boolean } | undefined;
      return {
        orderId: row._id,
        status: order?.status,
        escrow: plain(order?.escrowBalanceAnchor ?? 0),
        effectApplied: order?.effectApplied ?? false,
      };
    })
    .sort((left, right) => String(left.orderId).localeCompare(String(right.orderId)));
  return { collections, escrow };
}

function balance(memory: InMemoryDb, collection: string, id: string, path: string): number {
  const doc = memory.collection(collection).docs.find((row) => row._id === id)!;
  return path.split(".").reduce<unknown>((value, key) => (value as never)?.[key], doc) as number;
}

describe("political media settlement, one move per buyer", () => {
  it("leaves the same money, receipts and effects as one move per allocation", async () => {
    // The per-seller path needs a second pass to finish a refused payout, so it
    // is run to convergence; the batch has to land the same documents once.
    const reference = buildWorld();
    await fundAndPlan(reference as unknown as Db, reference);
    await settleTheOldWay(reference as unknown as Db, 2);

    const together = buildWorld();
    await fundAndPlan(together as unknown as Db, together);
    await settleTogether(together as unknown as Db);

    // The one deliberate difference, asserted rather than hidden: where a
    // credit cannot be delivered, the per-seller path debits that seller's
    // escrow and then fails to credit it, so the anchor is gone from both sides.
    // The batch stops before the credit, so the anchor stays in the escrow it
    // came from. Both leave the order settling and both stop paying there.
    const escrowOf = (state: unknown, orderId: string) =>
      (state as { escrow: { orderId: string; escrow: number }[] }).escrow.find((row) =>
        row.orderId.endsWith(orderId)
      )?.escrow;
    expect(escrowOf(settledState(together), "order-delta")).toBe(20);
    expect(escrowOf(settledState(reference), "order-delta")).toBe(10);

    const withoutRefusedOrder = (state: unknown) => {
      const copy = settledState(state) as { escrow: { orderId: string }[] };
      return {
        ...copy,
        escrow: copy.escrow.filter((row) => !row.orderId.endsWith("order-delta")),
      };
    };
    expect(withoutRefusedOrder(together)).toEqual(withoutRefusedOrder(reference));
  });

  it("stops an order at the allocation it cannot deliver, as the per-seller path does", async () => {
    const memory = buildWorld();
    await fundAndPlan(memory as unknown as Db, memory);
    await settleTogether(memory as unknown as Db);

    // Currencies convert at the frozen seller rate on the way out.
    expect(balance(memory, "corporations", "corp-usd", "liquidCapital")).toBe(
      100 + 40 * 2 + 10 * 2 + 30 * 2 + 4 * 2
    );
    expect(balance(memory, "corporations", "corp-eur", "liquidCapital")).toBe(
      100 + 50 * 1.5 + 30 * 1.5
    );
    expect(balance(memory, "corporations", "corp-gbp", "liquidCapital")).toBe(
      100 + 40 * 0.8 + 3 * 0.8
    );
    expect(balance(memory, "corporations", "corp-jpy", "liquidCapital")).toBe(100 + 3 * 100);
    // Both short orders refund the unfilled escrow at the payer's frozen rate.
    expect(balance(memory, "characters", "payer-usd", "cash")).toBe(
      1000 - 120 - 180 - 60 - 100 + 40 + 50
    );
    expect(balance(memory, "characters", "payer-gbp", "cash")).toBe(1000 - 32 - 24);
    expect(balance(memory, "federalBudget", "budget-us", "treasuryBalance")).toBe(500 + 50);
    // order-delta paid its first allocation, kept the undeliverable one in
    // escrow and never reached the allocation after it or its own settlement.
    const delta = memory
      .collection(MONEY_MOVE_COLLECTION)
      .docs.find((row) => row._id === politicalMediaOrderKey("order-delta"))!;
    expect(delta.politicalMediaOrder).toMatchObject({
      status: "settling",
      escrowBalanceAnchor: 20,
    });
    expect(delta.politicalMediaOrder).not.toHaveProperty("effectApplied");
    // Both receipts of the payee that was paid twice are on its one credit.
    const receipts = memory.collection("corporations").docs.find((row) => row._id === "corp-eur")!
      .politicalMediaReceipts as Record<string, Record<string, unknown>>;
    expect(Object.keys(receipts["order-civic"])).toEqual(["alloc-civic-1", "alloc-civic-2"]);
  });

  it("pays out exactly the funded anchor and keeps the undeliverable part in escrow", async () => {
    const memory = buildWorld();
    await fundAndPlan(memory as unknown as Db, memory);
    await settleTogether(memory as unknown as Db);

    // Every paid leg in anchor terms: seller credits, refunds and the no-outlet
    // fallback all come out of one escrow per order.
    let paidAnchor = 0;
    for (const row of memory.collection(MONEY_MOVE_COLLECTION).docs) {
      if (!String(row.kind).startsWith("political-media-settlement")) continue;
      for (const leg of (row.legs ?? []) as {
        kind: string;
        amount: number;
        applied?: boolean;
        collection?: string;
        valuation?: { localPerAnchor: number };
      }[]) {
        if (leg.kind !== "credit" || !leg.applied) continue;
        // Money returning to the escrow is not a payout.
        if (leg.collection === MONEY_MOVE_COLLECTION) continue;
        paidAnchor += leg.amount / (leg.valuation?.localPerAnchor ?? 1);
      }
    }
    const escrow = memory
      .collection(MONEY_MOVE_COLLECTION)
      .docs.filter((row) => row.kind === POLITICAL_MEDIA_ORDER_KIND)
      .reduce(
        (sum, row) =>
          sum +
          ((row.politicalMediaOrder as { escrowBalanceAnchor?: number }).escrowBalanceAnchor ?? 0),
        0
      );
    // Funded 300 anchor. 280 reaches a payer or a seller, order-delta keeps the
    // 10 of its undeliverable allocation plus the 10 it never reached.
    expect(Math.round(paidAnchor)).toBe(280);
    expect(escrow).toBe(20);
    expect(paidAnchor + escrow).toBe(300);
  });

  it("resumes from a crash after each journal write and converges on the same state", async () => {
    const clean = buildWorld();
    await fundAndPlan(clean as unknown as Db, clean);
    await settleTogether(clean as unknown as Db);
    const expected = settledState(clean);

    // Count the writes the settlement makes, then crash after each one in turn.
    const counter = buildWorld();
    await fundAndPlan(counter as unknown as Db, counter);
    const probe = withInjectedCrash(counter, { onCall: Number.MAX_SAFE_INTEGER });
    await settleTogether(probe.db);
    expect(probe.log.length).toBeGreaterThan(20);

    // Both sides of every write: a crash can land the write or lose it.
    for (const afterWrite of [false, true]) {
      for (let onCall = 1; onCall <= probe.log.length; onCall++) {
        const memory = buildWorld();
        await fundAndPlan(memory as unknown as Db, memory);
        const faulty = withInjectedCrash(memory, { onCall, afterWrite });
        await expect(settleTogether(faulty.db)).rejects.toBeInstanceOf(InjectedCrash);
        // A later pass finds the same open orders and finishes them.
        await settleTogether(memory as unknown as Db);
        expect(
          settledState(memory),
          `crash ${afterWrite ? "after" : "before"} write ${onCall}`
        ).toEqual(expected);
      }
    }
  });

  it("spends fewer round trips than one move per allocation", async () => {
    const reference = buildWorld();
    await fundAndPlan(reference as unknown as Db, reference);
    const oldCounter = countRoundTrips(reference);
    await settleTheOldWay(reference as unknown as Db, 1);

    const together = buildWorld();
    await fundAndPlan(together as unknown as Db, together);
    const newCounter = countRoundTrips(together);
    await settleTogether(together as unknown as Db);

    // One move per order replaces one per seller, each of which cost two legs at
    // five round trips plus a claim, a completion and a status write.
    expect(newCounter.total()).toBeLessThan(oldCounter.total() * 0.7);
  });
});
