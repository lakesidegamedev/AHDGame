import { nonAtomicMoneyFlowReceiptsCollection } from "@/lib/db/repositories/nonAtomicMoneyFlowReceipts";
import { acquisitionSettlementsCollection } from "@/lib/db/repositories/acquisitionSettlements";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";
import { boundSession, withSessionDb } from "@/lib/db/sessionDb";
import type { Db, AnyBulkWriteOperation } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import * as Sentry from "@sentry/nextjs";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";
import { cancelShareOrderAndRefund } from "@/lib/corporations/cancelShareOrder";
import { cancelShareListingAndRefund } from "@/lib/corporations/cancelShareListing";
import {
  hasProtectedConstructionPropertyIn,
  reserveSectorsForTransition,
  releaseConstructionPropertyTransition,
} from "@/lib/corporations/securedConstructionProperty";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { shareOrdersCollection } from "@/lib/db/repositories/shareOrders";
import { shareListingsCollection } from "@/lib/db/repositories/shareListings";

class TreasuryQuoteChanged extends Error {}

export type ConvertCorpCurrencyResult = ConvertCorpCurrencySuccess | ConvertCorpCurrencyError;

export interface ConvertCorpCurrencySuccess {
  ok: true;
  converted: boolean;
  fromCurrency?: CurrencyCode;
  toCurrency: CurrencyCode;
  /** LOCAL_new = LOCAL_old × scale (via ₳: toRate / fromRate). 1.0 when fromCurrency is unset (pre-forex ₳). */
  scale: number;
  /** Number of corporateSectors whose revenue + currentGrowthCost were rescaled. */
  sectorsConverted: number;
  /** Open shareOrders cancelled + refunded before conversion. */
  ordersCancelled: number;
  /** Open shareListings cancelled + pending-offer escrows refunded before conversion. */
  listingsCancelled: number;
}

export interface ConvertCorpCurrencyError {
  ok: false;
  /** Set when the failure is recoverable by the caller with a 503-retry semantic. */
  rateUnavailable?: boolean;
  debtCurrencyRetained?: boolean;
  retainedCurrency?: CurrencyCode;
  error: string;
}

class CurrencyMoveRejected extends Error {
  constructor(readonly result: ConvertCorpCurrencyError) {
    super(result.error);
  }
}

const TREASURY_CURRENCY_FIELDS = [
  "liquidCurrencyCode",
  "liquidCapital",
  "sharePrice",
  "marketingBudget",
  "logisticsBudget",
  "ceoSalary",
  "rdBudget",
  "shareEscrowBalance",
  "escrowFundingPerTurn",
  "productVentureDebitsV1",
] as const;
const treasurySourceFields = (corp: Corporation) =>
  Object.fromEntries(
    TREASURY_CURRENCY_FIELDS.map((field) => [
      field,
      Object.hasOwn(corp, field) ? corp[field] : { $exists: false },
    ])
  );

/**
 * Convert every corp-economic money field from the corp's current
 * `liquidCurrencyCode` to `toCurrencyCode` at the supplied FX rates, and
 * update `liquidCurrencyCode` to match. Used by HQ-relocation paths when a
 * cross-country move changes the corp's home currency.
 *
 * What converts (every field denominated in the corp's `liquidCurrencyCode`
 * per docs/design/corporations.md §Currency handling):
 *   - `corporations`: `liquidCapital`, `sharePrice`, `marketingBudget`,
 *     `logisticsBudget`, `ceoSalary`
 *   - `corporateSectors` owned by this corp: `revenue`, `currentGrowthCost`
 *
 * What does NOT convert:
 *   - **Bonds issued by this corp.** Per design, denomination fixed at
 *     issuance. Coupons + maturity payouts continue in the old currency; the
 *     corp's liquidCapital (now in the new currency) is debited via the
 *     standard `bondTurn.ts` ₳-normalization path, so old-currency bonds on
 *     a new-currency corp settle correctly without any extra work here.
 *   - **Historical rows** (`corporationHistory`, `marketCapHistory`,
 *     `corporationPortfolioHistory`). Each row is stamped with its own
 *     `currencyCode` at write time so mixed-currency rows across the
 *     conversion moment chart correctly.
 *   - **Character wallets.** Multi-currency by design.
 *
 * Open `shareOrders` and `shareListings` (with pending offers) are cancelled
 * + refunded BEFORE the currency field is updated — escrow amounts are in
 * the pre-conversion currency and the existing refund helpers read the
 * corp's current `liquidCurrencyCode` to interpret them, so the order
 * matters: cancel → refund → convert.
 *
 * Pre-forex corps (no `liquidCurrencyCode`) are treated as ₳-denominated
 * (fromRate = 1.0) and stamped with the new currency; this backfills the
 * missing field at the same time.
 */
export async function convertCorpCurrency(
  db: Db,
  corp: Corporation,
  toCurrencyCode: CurrencyCode,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>,
  now: Date,
  forexEnabled: boolean,
  sectorSnapshot?: CorporateSector[]
): Promise<ConvertCorpCurrencyResult> {
  try {
    return await withSessionDb(db, async (transactionDb) => {
      const result = await convertInTransaction(
        transactionDb,
        corp,
        toCurrencyCode,
        fxByCurrency,
        now,
        forexEnabled,
        sectorSnapshot
      );
      if (!result.ok) throw new CurrencyMoveRejected(result);
      return result;
    });
  } catch (error) {
    if (boundSession(db)) throw error;
    if (error instanceof CurrencyMoveRejected) return error.result;
    if (error instanceof TreasuryQuoteChanged) return { ok: false, error: error.message };
    if (
      error instanceof Error &&
      "result" in error &&
      error.result &&
      typeof error.result === "object" &&
      "ok" in error.result &&
      error.result.ok === false
    )
      return {
        ok: false,
        error: error.message,
        rateUnavailable: /exchange rate/i.test(error.message),
      };
    throw error;
  }
}

async function convertInTransaction(
  db: Db,
  corp: Corporation,
  toCurrencyCode: CurrencyCode,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>,
  now: Date,
  forexEnabled: boolean,
  sectorSnapshot?: CorporateSector[]
): Promise<ConvertCorpCurrencyResult> {
  if (
    corp.primaryUnderwritingIncomingFunding ||
    corp.bankUnderwritingFunding ||
    corp.headquartersRelocationBondFunding
  ) {
    return {
      ok: false,
      error: "Primary underwriting proceeds are settling; retry the currency move after settlement",
    };
  }
  const fromCurrency = resolveCorpLiquidCurrencyCode(corp);
  // No-op: same currency already; nothing to change.
  if (fromCurrency === toCurrencyCode) {
    return {
      ok: true,
      converted: false,
      fromCurrency,
      toCurrency: toCurrencyCode,
      scale: 1,
      sectorsConverted: 0,
      ordersCancelled: 0,
      listingsCancelled: 0,
    };
  }

  const idHex = corp._id.toHexString();
  const [shareSettlement, acquisition] = await Promise.all([
    nonAtomicMoneyFlowReceiptsCollection(db).findOne(
      {
        status: { $nin: ["completed", "compensated"] },
        $or: ["fillerDebit", "fillerCredit", "sellerProceeds", "buyerRefund"].map((field) => ({
          [`shareFillMoneyPlan.${field}.collection`]: "corporations",
          [`shareFillMoneyPlan.${field}.idHex`]: idHex,
        })),
      },
      { projection: { _id: 1 } }
    ),
    acquisitionSettlementsCollection(db).findOne(
      {
        status: "in_progress",
        legs: { $elemMatch: { collection: "corporations", "filter._id": corp._id } },
      },
      { projection: { _id: 1 } }
    ),
  ]);
  if (shareSettlement || acquisition)
    return {
      ok: false,
      error:
        "A frozen share or acquisition payment must finish before changing this corporation's currency.",
    };

  // Both source and target FX rates must be present before we mutate anything.
  // Reading with passthrough (rate=1 fallback) is safe for cross-corp aggregation,
  // but for WRITES a missing target rate would persist order-of-magnitude wrong
  // balances — refuse rather than corrupt.
  const fromRate = fromCurrency ? fxByCurrency.get(fromCurrency) : 1;
  const toRate = fxByCurrency.get(toCurrencyCode);
  if (
    fromRate === undefined ||
    toRate === undefined ||
    !Number.isFinite(fromRate) ||
    !Number.isFinite(toRate) ||
    fromRate <= 0 ||
    toRate <= 0
  ) {
    return {
      ok: false,
      rateUnavailable: true,
      error: `Exchange rate unavailable for ${fromCurrency ?? "source"}→${toCurrencyCode} conversion, try again shortly`,
    };
  }
  // LOCAL_new = (LOCAL_old / fromRate) * toRate = LOCAL_old * (toRate / fromRate)
  const scale = toRate / fromRate;

  // The corporation's sectors are already loaded for the currency write below.
  // Read them before cancelling any share-market escrow so a secured plant can
  // refuse the denomination change without first mutating unrelated accounts.
  const sectors =
    sectorSnapshot ??
    (await corporateSectorsCollection(db).find({ corporationId: corp._id }).toArray());
  if (hasProtectedConstructionPropertyIn(sectors)) {
    return {
      ok: false,
      error:
        "A site of this corporation carries a construction loan repaid from its cash in its current currency. Sell the site or wait until the loan is repaid before changing currency.",
    };
  }
  const loan = await bankLoansCollection(db).findOne(
    {
      borrowerType: "corporation",
      borrowerId: corp._id,
      status: { $in: ["pending", "current", "arrears", "defaulted"] },
      outstanding: { $gt: 0 },
    },
    { projection: { _id: 1 } }
  );
  if (loan)
    return {
      ok: false,
      debtCurrencyRetained: true,
      retainedCurrency: fromCurrency,
      error: "Repay outstanding bank loans before changing the corporation's treasury currency.",
    };
  const fence = await corporationsCollection(db).updateOne(
    {
      _id: corp._id,
      ...treasurySourceFields(corp),
      primaryUnderwritingIncomingFunding: { $exists: false },
      bankUnderwritingFunding: { $exists: false },
      headquartersRelocationBondFunding: { $exists: false },
    },
    { $set: { updatedAt: now } }
  );
  if (fence.matchedCount !== 1)
    throw new TreasuryQuoteChanged("Treasury changed; refresh before changing currency");
  const transitionKeys = await reserveSectorsForTransition(
    db,
    sectors,
    "currency_conversion",
    `currency:${corp._id.toHexString()}:${toCurrencyCode}`
  );
  if (!transitionKeys) {
    return {
      ok: false,
      error: "A sector changed or acquired secured construction during currency conversion",
    };
  }
  const releaseTransitions = () =>
    Promise.all(
      sectors.map((sector, index) =>
        releaseConstructionPropertyTransition(db, sector._id, transitionKeys[index])
      )
    );

  // 1. Cancel open share orders — existing cancel helper reads the corp's
  //    CURRENT liquidCurrencyCode to interpret escrow/pricePerShare, so this
  //    MUST run before the currency field is rewritten. Any failure here aborts
  //    the conversion: a stale-currency open order on a converted corp would
  //    leak player escrow across a currency boundary at next fill / cancel.
  const openOrders = await shareOrdersCollection(db)
    .find({ corporationId: corp._id, status: "open" })
    .toArray();
  let ordersCancelled = 0;
  for (const order of openOrders) {
    const res = await cancelShareOrderAndRefund(db, order);
    if (!res.ok) {
      await releaseTransitions();
      return {
        ok: false,
        // cancelShareOrderAndRefund's 503-eligible failure mode is missing
        // character FX rate — caller can surface that to retry.
        rateUnavailable: /exchange rate/i.test(res.error),
        error: `Failed to cancel open share order ${order._id.toString()} before currency conversion: ${res.error}`,
      };
    }
    ordersCancelled++;
  }

  // 2. Cancel open share listings (and refund pending-offer escrows) — same
  //    ordering rationale as orders. Also abort-on-failure.
  const openListings = await shareListingsCollection(db)
    .find({ corporationId: corp._id, status: "open" })
    .toArray();
  let listingsCancelled = 0;
  for (const listing of openListings) {
    // Pass the corp we already have as `listingCorpDocOverride` — all listings
    // being cancelled here belong to `corp`, so we skip N redundant findOnes.
    const res = await cancelShareListingAndRefund(db, listing, now, forexEnabled, corp);
    if (!res.ok) {
      await releaseTransitions();
      return {
        ok: false,
        rateUnavailable: res.rateUnavailable === true,
        error: `Failed to cancel open share listing ${listing._id.toString()} before currency conversion: ${res.error}`,
      };
    }
    listingsCancelled++;
  }

  if (ordersCancelled || listingsCancelled) {
    const refreshed = await corporationsCollection(db).findOne(
      { _id: corp._id },
      {
        projection: Object.fromEntries(TREASURY_CURRENCY_FIELDS.map((field) => [field, 1])),
      }
    );
    if (!refreshed)
      throw new TreasuryQuoteChanged("Corporation disappeared during currency conversion");
    corp = { ...corp, ...refreshed };
  }

  const round2 = (v: number) => Math.round(v * 100) / 100;
  const round4 = (v: number) => Math.round(v * 10000) / 10000;
  const corpSet: Record<string, unknown> = {
    liquidCurrencyCode: toCurrencyCode,
    liquidCapital: round2((corp.liquidCapital ?? 0) * scale),
    // sharePrice uses 4-decimal precision elsewhere (see DEFAULT_SHARE_PRICE + MIN_SHARE_PRICE).
    sharePrice: round4((corp.sharePrice ?? 0) * scale),
    marketingBudget: round2((corp.marketingBudget ?? 0) * scale),
    logisticsBudget: round2((corp.logisticsBudget ?? 0) * scale),
    updatedAt: now,
  };
  if (corp.ceoSalary !== undefined) {
    corpSet.ceoSalary = round2(corp.ceoSalary * scale);
  }

  for (const field of ["rdBudget", "shareEscrowBalance", "escrowFundingPerTurn"] as const) {
    if (corp[field] !== undefined) corpSet[field] = round2(corp[field]! * scale);
  }
  if (corp.productVentureDebitsV1) {
    corpSet.productVentureDebitsV1 = Object.fromEntries(
      Object.entries(corp.productVentureDebitsV1).map(([id, receipt]) => [
        id,
        {
          ...receipt,
          ...(receipt.localAmount !== undefined
            ? { localAmount: round2(receipt.localAmount * scale) }
            : {}),
        },
      ])
    );
  }
  const sourceCashFields = treasurySourceFields(corp);

  // Fields an FX flip may and may not touch.
  // `revenue` and `currentGrowthCost` are LOCAL-currency fields, so a change of
  // the owner's currency re-denominates them. The capacity fields are not:
  //   - `capitalStock` is a count of output units/day: currency-free.
  //   - `buildQueue[].costPaidAnchor` and `constructionInProgressAnchor` are
  //     already currency-independent (see SectorBuildOrder / CorporateSector).
  //     Rescaling either would silently restate cash already spent and inflate
  //     every later CIP figure and 0.75 cancellation refund by the cross rate.
  //     They must stay absent from this write.
  //
  // PLANTS-GATED: above the plants tier the turn processor restates `revenue`
  // every turn from `capitalStock x mixPrice` in the sector's HOST currency,
  // so rescaling here would write a field the engine owns. It is rescaled only
  // below the plants tier. `currentGrowthCost` is rescaled in every mode.
  const plantsEnabled = marketAtLeast(await getMarketSystemModeForDb(db), "plants");
  const sectorOps: AnyBulkWriteOperation<CorporateSector>[] = sectors.map((s, index) => ({
    updateOne: {
      filter: {
        _id: s._id,
        "constructionPropertyTransition.key": transitionKeys[index],
        revenue: s.revenue ?? { $exists: false },
        currentGrowthCost: s.currentGrowthCost ?? { $exists: false },
      },
      update: {
        $set: {
          ...(plantsEnabled ? {} : { revenue: round2((s.revenue ?? 0) * scale) }),
          currentGrowthCost: round2((s.currentGrowthCost ?? 0) * scale),
          updatedAt: now,
        },
      },
    },
  }));
  const corpWrite = await corporationsCollection(db).updateOne(
    {
      _id: corp._id,
      ...sourceCashFields,
      primaryUnderwritingIncomingFunding: { $exists: false },
      bankUnderwritingFunding: { $exists: false },
      headquartersRelocationBondFunding: { $exists: false },
    },
    { $set: corpSet },
    undefined
  );
  if (corpWrite.matchedCount !== 1) {
    throw new TreasuryQuoteChanged("Treasury changed; retry the currency move with a fresh quote");
  }
  if (sectorOps.length > 0) {
    const bulkResult = await corporateSectorsCollection(db).bulkWrite(sectorOps);
    // A matchedCount shortfall means sectors exist in the DB that we fetched
    // but the bulkWrite didn't touch — the corp's liquidCurrencyCode would be
    // flipped while those sectors retain old-currency revenue values, inflating
    // sectorNPV and share price by the FX cross rate on the next turn.
    if (bulkResult.matchedCount !== sectorOps.length) {
      const msg =
        `convertCorpCurrency: sector count mismatch for corp ${corp._id.toString()} ` +
        `(${fromCurrency ?? "₳"}→${toCurrencyCode}, scale=${scale.toFixed(6)}): ` +
        `expected ${sectorOps.length} matched, got ${bulkResult.matchedCount}`;
      Sentry.captureException(new Error(msg));
      throw new Error(msg);
    }
  }
  await releaseTransitions();

  const sectorsConverted = sectors.length;

  return {
    ok: true,
    converted: true,
    fromCurrency,
    toCurrency: toCurrencyCode,
    scale,
    sectorsConverted,
    ordersCancelled,
    listingsCancelled,
  };
}
