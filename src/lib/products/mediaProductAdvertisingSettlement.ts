/**
 * Title advertising moves the buyer's frozen native cash to the quoted outlets.
 * `settleProductAdvertisingObligations` debits each funded order into the
 * clearing pool, publishes its receipt, then pays every owed seller in one
 * netted clearing transition (see productAdvertisingClearing.ts).
 *
 * The order's per-seller table (one allocation per advertising seller) is
 * written once per pass to its own keyed document, never into the settle loop's
 * journal record: that record is read back for every projection it applies, and
 * the table is far larger than those projections.
 */
import { ObjectId, type Db } from "mongodb";
import type { Corporation, MediaProductAdvertisingObligationV1 } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { ProductAdvertisingDenominationWitness } from "@/lib/products/rules/productAdvertising";
import type { BankingTransition, TransitionLeg } from "@/lib/banking/rules/boundary";
import { oid } from "@/lib/banking/rules/boundary";
import { MONEY_MOVE_COLLECTION } from "@/lib/banking/moneyMove";
import { resumeSettlement, settleTransition } from "@/lib/banking/settlementJournal";
import { KeyedQueue, interleaveByKey, runInLanes } from "@/lib/turn/settlementLanes";
import {
  quoteFundedProductAdvertising,
  type ProductAdvertisingObligation,
  type ProductAdvertisingSellerQuote,
} from "@/lib/products/rules/productAdvertising";
import {
  ADVERTISING_FAMILY,
  CLEARING_POOL_BALANCE_PATH,
  PRODUCT_ADVERTISING_CLEARING_COLLECTION,
  PRODUCT_ADVERTISING_PAYABLES_COLLECTION,
  clearProductAdvertisingPayables,
  clearingPoolId,
  denominationConditions,
  dropProductAdvertisingAllocations,
  ensureClearingPool,
  recordProductAdvertisingAllocations,
  type ProductAdvertisingFamily,
  type ProductAdvertisingPayable,
  type ProductAdvertisingPayableAllocation,
} from "@/lib/products/productAdvertisingClearing";

export type { ProductAdvertisingFamily } from "@/lib/products/productAdvertisingClearing";

/**
 * Concurrent buyers per settlement pass. Each order is a chain of about twenty
 * dependent journal round trips, so buyers whose orders share no document
 * settle side by side, as operating cash does.
 */
const PRODUCT_ADVERTISING_LANES = 8;

export type MediaAdvertisingSellerQuote = ProductAdvertisingSellerQuote;

export function createMediaProductAdvertisingObligation(input: {
  buyerCorporationId: string;
  projectId: string;
  turn: number;
  amountAnchor: number;
  buyerCurrencyCode: CurrencyCode;
  buyerLocalPerAnchor: number;
  buyerDenomination: ProductAdvertisingDenominationWitness;
  sellers: readonly MediaAdvertisingSellerQuote[];
}): MediaProductAdvertisingObligationV1 | null {
  if (!Number.isSafeInteger(input.turn) || !input.projectId || !input.buyerCorporationId) {
    return null;
  }
  const quote = quoteFundedProductAdvertising({
    amountAnchor: input.amountAnchor,
    buyer: {
      corporationId: input.buyerCorporationId,
      currencyCode: input.buyerCurrencyCode,
      localPerAnchor: input.buyerLocalPerAnchor,
      ...input.buyerDenomination,
    },
    sellers: input.sellers,
  });
  if (!quote) return null;
  return {
    projectId: input.projectId,
    turn: input.turn,
    ...quote,
  };
}

export function productAdvertisingSettlementKey(
  corporationId: string,
  obligation: Pick<ProductAdvertisingObligation, "projectId" | "turn">,
  family: ProductAdvertisingFamily = "media"
): string {
  const definition = ADVERTISING_FAMILY[family];
  return `${definition.journalPrefix}:${obligation.turn}:${corporationId}:${obligation.projectId}`;
}

/** Refuse a frozen order whose seller split does not add back up to the buyer debit. */
function assertBalancedOrder(key: string, obligation: ProductAdvertisingObligation): void {
  const buyerAnchor = obligation.buyerAmountLocal / obligation.buyerLocalPerAnchor;
  const sellerAnchor = obligation.sellerAllocations.reduce(
    (sum, seller) => sum + seller.amountLocal / seller.localPerAnchor,
    0
  );
  if (
    !Number.isFinite(buyerAnchor) ||
    buyerAnchor <= 0 ||
    obligation.sellerAllocations.length === 0
  ) {
    throw new Error(`Invalid frozen media advertising obligation ${key}`);
  }
  if (Math.abs(buyerAnchor - sellerAnchor) > 1e-6) {
    throw new Error(`Frozen media advertising allocations do not balance for ${key}`);
  }
}

/** The guarded buyer debit, identical in the pooled and legacy transitions. */
function buyerDebitLeg(
  corporationId: ObjectId,
  obligation: ProductAdvertisingObligation
): TransitionLeg {
  return {
    kind: "debit",
    amount: obligation.buyerAmountLocal,
    valuation: {
      currencyCode: obligation.buyerCurrencyCode,
      localPerAnchor: obligation.buyerLocalPerAnchor,
    },
    collection: "corporations",
    filter: {
      _id: oid(corporationId.toHexString()),
      liquidCapital: { $gte: obligation.buyerAmountLocal },
      $expr: {
        $eq: [
          {
            $size: {
              $filter: {
                input: {
                  $objectToArray: {
                    $ifNull: ["$operatingCashArrearsByCurrency", {}],
                  },
                },
                as: "arrear",
                cond: { $gt: ["$$arrear.v", 0] },
              },
            },
          },
          0,
        ],
      },
      $and: denominationConditions(obligation.buyerDenomination),
    },
    path: "liquidCapital",
    note: "Pay the frozen title advertising order from funded cash",
  };
}

function receiptProjection(
  corporationId: ObjectId,
  obligation: ProductAdvertisingObligation,
  family: ProductAdvertisingFamily
): BankingTransition["projections"][number] {
  const definition = ADVERTISING_FAMILY[family];
  return {
    collection: "corporations",
    filter: {
      _id: oid(corporationId.toHexString()),
      [definition.receiptField]: { $exists: false },
    },
    update: {
      $set: {
        [definition.receiptField]: {
          projectId: obligation.projectId,
          turn: obligation.turn,
          amountAnchor: obligation.amountAnchor,
          sellerCorporationIds: obligation.sellerAllocations.map((seller) => seller.corporationId),
        },
      } as Record<string, unknown>,
      $pull: {
        [definition.obligationsField]: {
          projectId: obligation.projectId,
          turn: obligation.turn,
        },
      } as Record<string, unknown>,
    },
    note: "Publish funded title advertising and clear its frozen obligation",
  };
}

function orderEvent(
  corporationId: ObjectId,
  obligation: ProductAdvertisingObligation,
  family: ProductAdvertisingFamily
): BankingTransition["event"] {
  return {
    kind: "monetary.executed",
    command: ADVERTISING_FAMILY[family].command,
    subjectType: "corporation",
    subjectId: corporationId.toHexString(),
    amount: obligation.amountAnchor,
    meta: {
      projectId: obligation.projectId,
      advertisingAmountAnchor: obligation.amountAnchor,
    },
  };
}

/**
 * Stage 1 of a funded order: the buyer debit lands in the clearing pool, the
 * order's frozen per-seller payables are recorded as owed, and the receipt is
 * published. Sellers are paid by the per-turn clearing transition.
 *
 * The payable records only the totals. The frozen per-seller table is written
 * once, before this move claims its key, under the same order key (see
 * `recordProductAdvertisingAllocations`), so the journal record this transition
 * freezes stays small.
 */
export function productAdvertisingTransition(
  corporationId: ObjectId,
  obligation: ProductAdvertisingObligation,
  family: ProductAdvertisingFamily = "media"
): BankingTransition {
  const definition = ADVERTISING_FAMILY[family];
  const key = productAdvertisingSettlementKey(corporationId.toHexString(), obligation, family);
  assertBalancedOrder(key, obligation);
  if (obligation.sellerAllocations.some((seller) => !seller.denomination)) {
    throw new Error(`Frozen media advertising seller witness missing for ${key}`);
  }
  const poolId = clearingPoolId(family, obligation.buyerCurrencyCode);
  const payable: ProductAdvertisingPayable = {
    _id: key,
    clearingVersion: 1,
    family,
    turn: obligation.turn,
    buyerCorporationId: corporationId.toHexString(),
    projectId: obligation.projectId,
    poolId,
    poolCurrencyCode: obligation.buyerCurrencyCode,
    poolLocalPerAnchor: obligation.buyerLocalPerAnchor,
    poolAmountLocal: obligation.buyerAmountLocal,
  };
  return {
    key,
    kind: definition.kind,
    turn: obligation.turn,
    currency: obligation.buyerCurrencyCode,
    legs: [
      buyerDebitLeg(corporationId, obligation),
      {
        kind: "credit",
        amount: obligation.buyerAmountLocal,
        valuation: {
          currencyCode: obligation.buyerCurrencyCode,
          localPerAnchor: obligation.buyerLocalPerAnchor,
        },
        collection: PRODUCT_ADVERTISING_CLEARING_COLLECTION,
        filter: { _id: poolId },
        path: CLEARING_POOL_BALANCE_PATH,
        note: "Hold the title advertising order in the clearing pool",
      },
    ],
    projections: [
      {
        collection: PRODUCT_ADVERTISING_PAYABLES_COLLECTION,
        insert: payable as unknown as Record<string, unknown>,
        note: "Record the order's frozen seller payables as owed",
      },
      receiptProjection(corporationId, obligation, family),
    ],
    event: orderEvent(corporationId, obligation, family),
  };
}

/**
 * The pre-clearing shape: one credit leg per seller in the order's own
 * transition. Orders journaled in this shape resume from their own record
 * through `resumeSettlement`; this builder is kept so tests and repair tools
 * can reproduce exactly what those records contain.
 */
export function legacyProductAdvertisingTransition(
  corporationId: ObjectId,
  obligation: ProductAdvertisingObligation,
  family: ProductAdvertisingFamily = "media"
): BankingTransition {
  const definition = ADVERTISING_FAMILY[family];
  const key = productAdvertisingSettlementKey(corporationId.toHexString(), obligation, family);
  assertBalancedOrder(key, obligation);
  const sellerLegs: TransitionLeg[] = obligation.sellerAllocations.map((seller, index) => ({
    kind: "credit" as const,
    amount: seller.amountLocal,
    valuation: {
      currencyCode: seller.currencyCode,
      localPerAnchor: seller.localPerAnchor,
    },
    collection: "corporations",
    filter: {
      _id: oid(seller.corporationId),
      $and: denominationConditions(seller.denomination),
    },
    path: "liquidCapital",
    note: `Fund title advertising allocation ${index + 1}`,
  }));
  return {
    key,
    kind: definition.kind,
    turn: obligation.turn,
    currency: obligation.buyerCurrencyCode,
    // The journal may retry only these frozen seller credits after a raw
    // denomination guard temporarily refuses them. The buyer debit remains
    // terminal and is never replayed.
    retryCreditLegOnGuardFailure: true,
    legs: [buyerDebitLeg(corporationId, obligation), ...sellerLegs],
    projections: [receiptProjection(corporationId, obligation, family)],
    event: orderEvent(corporationId, obligation, family),
  };
}

/** Resume immutable title orders only after operating cash and arrears settle. */
export function mediaProductAdvertisingTransition(
  corporationId: ObjectId,
  obligation: MediaProductAdvertisingObligationV1
): BankingTransition {
  return productAdvertisingTransition(corporationId, obligation, "media");
}

export async function settleProductAdvertisingObligations(
  db: Db,
  corporationIds: readonly ObjectId[],
  currentTurn: number,
  family: ProductAdvertisingFamily = "media",
  options: {
    /** Tests stop after stage 1 to model a turn that died before clearing. */
    skipClearing?: boolean;
  } = {}
): Promise<ObjectId[]> {
  const touched = new Map<string, ObjectId>();
  const touchCorporation = (id: string) => {
    if (!ObjectId.isValid(id)) return;
    const corporationId = new ObjectId(id);
    touched.set(corporationId.toHexString(), corporationId);
  };
  const definition = ADVERTISING_FAMILY[family];
  const obligationsField = definition.obligationsField;
  const receiptField = definition.receiptField;
  const rows =
    corporationIds.length === 0
      ? []
      : await db
          .collection<Corporation>("corporations")
          .find(
            {
              _id: { $in: [...corporationIds] },
              $or: [
                { [`${obligationsField}.0`]: { $exists: true } },
                { [receiptField]: { $exists: true } },
              ],
            },
            {
              projection: {
                _id: 1,
                [obligationsField]: 1,
                [receiptField]: 1,
              },
            }
          )
          .toArray();
  const journal = db.collection<{ _id: string }>(MONEY_MOVE_COLLECTION);
  const pools = new Set<string>();

  const parsed = rows.map((row) => {
    const fields = row as unknown as Record<string, unknown>;
    const receipt = fields[receiptField] as
      { turn?: number; sellerCorporationIds?: string[] } | undefined;
    const obligations = Array.isArray(fields[obligationsField])
      ? (fields[obligationsField] as ProductAdvertisingObligation[])
      : [];
    const due = receipt ? [] : obligations.filter((obligation) => obligation.turn <= currentTurn);
    const keys = due.map((obligation) =>
      productAdvertisingSettlementKey(row._id.toHexString(), obligation, family)
    );
    return { row, receipt, due, keys };
  });

  // One read for every order's prior journal record instead of one per order.
  // A key this call has already handed to the journal is read live again, so a
  // repeated legacy order sees exactly what the per-order read used to see.
  const candidateKeys = parsed.flatMap((entry) => entry.keys);
  const priorKeys = new Set(
    candidateKeys.length === 0
      ? []
      : (
          await journal.find({ _id: { $in: candidateKeys } }, { projection: { _id: 1 } }).toArray()
        ).map((record) => record._id)
  );
  const attemptedKeys = new Set<string>();
  const hasPrior = async (key: string) =>
    attemptedKeys.has(key)
      ? (await journal.findOne({ _id: key }, { projection: { _id: 1 } })) !== null
      : priorKeys.has(key);

  /** The frozen per-seller table of one order, keyed by its stage-1 move. */
  const allocationTable = (
    corporationId: ObjectId,
    obligation: ProductAdvertisingObligation
  ): { payableId: string; sellerAllocations: ProductAdvertisingPayableAllocation[] } => ({
    payableId: productAdvertisingSettlementKey(corporationId.toHexString(), obligation, family),
    sellerAllocations: obligation.sellerAllocations.map((seller) => ({
      corporationId: seller.corporationId,
      amountLocal: seller.amountLocal,
      currencyCode: seller.currencyCode,
      localPerAnchor: seller.localPerAnchor,
      denomination: seller.denomination!,
    })),
  });

  /** Drop an order the funded path will not settle, and the table quoted for it. */
  const discardOrder = async (
    corporationId: ObjectId,
    obligation: ProductAdvertisingObligation
  ): Promise<void> => {
    await Promise.all([
      db.collection<Corporation>("corporations").updateOne(
        { _id: corporationId },
        {
          $pull: {
            [obligationsField]: {
              projectId: obligation.projectId,
              turn: obligation.turn,
            },
          } as Record<string, unknown>,
        }
      ),
      dropProductAdvertisingAllocations(db, [
        productAdvertisingSettlementKey(corporationId.toHexString(), obligation, family),
      ]),
    ]);
  };

  /**
   * The order each row will settle this pass, if any.
   *
   * A row whose first due order already owns a journal record resumes it
   * instead, and its table was written when that record was created, so such a
   * row pre-writes nothing. This mirrors the settle loop's own selection rule,
   * one order per row, and nothing it skips can be reached before the order it
   * names.
   */
  const preselected = new Map<string, string>();
  const preselectedTables: {
    payableId: string;
    sellerAllocations: ProductAdvertisingPayableAllocation[];
  }[] = [];
  for (const entry of parsed) {
    if (entry.receipt) continue;
    let chosen = -1;
    let resumes = false;
    for (let i = 0; i < entry.due.length; i += 1) {
      // A prior record resumes, and whether its row then reaches a new order
      // depends on that resume's outcome. Those rows write their own table.
      if (priorKeys.has(entry.keys[i])) {
        resumes = true;
        break;
      }
      const obligation = entry.due[i];
      if (
        obligation.buyerDenomination &&
        obligation.sellerAllocations.every((seller) => seller.denomination)
      ) {
        chosen = i;
        break;
      }
    }
    if (resumes || chosen < 0) continue;
    preselected.set(entry.row._id.toHexString(), entry.keys[chosen]);
    preselectedTables.push(allocationTable(entry.row._id, entry.due[chosen]));
  }
  // One write for the whole pass: every order's seller table lands before any
  // move claims its key, so a payable that exists always has one.
  await recordProductAdvertisingAllocations(db, family, currentTurn, preselectedTables);

  // Each row settles only its own buyer's orders, in order, and returns the
  // corporations it touched; they are merged in row order afterwards so the
  // result is the same list the sequential loop produced.
  const settleRow = async ({ row, receipt, due }: (typeof parsed)[number]) => {
    const rowTouched: string[] = [];
    if (receipt) {
      rowTouched.push(row._id.toHexString());
      for (const sellerId of receipt.sellerCorporationIds ?? []) rowTouched.push(sellerId);
    }
    // A receipt is a one-slot handoff to product progression. Do not settle a
    // second order until the consumer acknowledges and removes that receipt.
    if (receipt) return rowTouched;
    const preselectedKey = preselected.get(row._id.toHexString());
    for (const obligation of due) {
      const key = productAdvertisingSettlementKey(row._id.toHexString(), obligation, family);
      const prior = await hasPrior(key);
      if (
        !prior &&
        (!obligation.buyerDenomination ||
          obligation.sellerAllocations.some((seller) => !seller.denomination))
      ) {
        await discardOrder(row._id, obligation);
        continue;
      }
      if (!prior) {
        const poolId = clearingPoolId(family, obligation.buyerCurrencyCode);
        if (!pools.has(poolId)) {
          await ensureClearingPool(db, family, obligation.buyerCurrencyCode);
          pools.add(poolId);
        }
        // The pass pre-wrote the row's preselected order. Anything reached
        // after a resumed order (a refusal it pulled) writes its own table.
        if (key !== preselectedKey)
          await recordProductAdvertisingAllocations(db, family, currentTurn, [
            allocationTable(row._id, obligation),
          ]);
      }
      // An existing key resumes from its own journal record, whatever its
      // shape: pre-clearing records still pay their sellers directly.
      attemptedKeys.add(key);
      const result = prior
        ? await resumeSettlement(db, key)
        : await settleTransition(db, productAdvertisingTransition(row._id, obligation, family));
      const moved =
        result.appliedLegs.length > 0 ||
        result.status === "applied" ||
        (result.status === "replayed" && !result.error);
      if (moved) {
        rowTouched.push(row._id.toHexString());
        if (prior) {
          for (const seller of obligation.sellerAllocations) rowTouched.push(seller.corporationId);
        }
      }
      if (result.status === "applied" || (result.status === "replayed" && !result.error)) {
        // A corporation can have legacy duplicate obligations. Publish at
        // most one receipt per handoff, leaving later orders and journals intact.
        break;
      } else if (result.status === "rejected" && result.appliedLegs.length === 0) {
        await discardOrder(row._id, obligation);
      } else {
        // Partial cash movement or a durable order in progress blocks later
        // obligations so their receipts cannot overtake this original order.
        break;
      }
    }
    return rowTouched;
  };

  // Orders of different buyers share no document except their currency's
  // clearing pool, whose credit legs need one writer at a time. Rows therefore
  // run in bounded lanes, serialized per buyer, per clearing pool and, for a
  // resumed order that may still pay sellers directly, per seller.
  const lock = new KeyedQueue();
  const touchedByRow: string[][] = parsed.map(() => []);
  const work = parsed.map((entry, index) => ({ entry, index }));
  const poolKey = (entry: (typeof parsed)[number]) =>
    entry.due[0] ? clearingPoolId(family, entry.due[0].buyerCurrencyCode) : "";
  await runInLanes(
    interleaveByKey(work, ({ entry }) => poolKey(entry)),
    PRODUCT_ADVERTISING_LANES,
    async ({ entry, index }) => {
      const keys = [`corporations:${entry.row._id.toHexString()}`];
      entry.due.forEach((obligation, i) => {
        keys.push(`pool:${clearingPoolId(family, obligation.buyerCurrencyCode)}`);
        if (!priorKeys.has(entry.keys[i])) return;
        for (const seller of obligation.sellerAllocations)
          keys.push(`corporations:${seller.corporationId}`);
      });
      touchedByRow[index] = await lock.run(keys, () => settleRow(entry));
    }
  );
  for (const rowTouched of touchedByRow) for (const id of rowTouched) touchCorporation(id);
  // Stage 2 runs even when no order settled this call: payables a crash or a
  // deferred seller left owed are paid by the next clearing.
  if (!options.skipClearing) {
    for (const sellerId of await clearProductAdvertisingPayables(db, family, currentTurn)) {
      touchCorporation(sellerId.toHexString());
    }
  }
  return [...touched.values()];
}

/** Preserve the media-specific call shape for existing turn and test callers. */
export async function settleMediaProductAdvertisingObligations(
  db: Db,
  corporationIds: readonly ObjectId[],
  currentTurn: number
): Promise<ObjectId[]> {
  return settleProductAdvertisingObligations(db, corporationIds, currentTurn, "media");
}
