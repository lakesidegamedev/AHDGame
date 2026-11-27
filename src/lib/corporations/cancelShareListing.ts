import { withShareCancellationTransaction } from "./shareCancellationTransaction";
import { ObjectId, type Db, type AnyBulkWriteOperation } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { Character, Corporation, ShareListing, ShareOffer } from "@/lib/db/types";
import { creditShares, creditSharesToCorp } from "@/lib/corporations/shareholderOps";
import { buildPersonalBalanceInc, getHomeCurrency } from "@/lib/currency/characterFunds";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  getCorpFxRate,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
  fxRateForCorpFromMap,
} from "@/lib/currency/corporationCapital";
import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { shareListingsCollection } from "@/lib/db/repositories/shareListings";
import { shareOffersCollection } from "@/lib/db/repositories/shareOffers";

export interface CancelListingResult {
  ok: true;
  refundedOffers: number;
  sharesReturned: number;
  refundedOfferIds?: string[];
}

export interface CancelListingError {
  ok: false;
  /** Set when forex is enabled but a needed buyer-home-currency rate is missing. */
  rateUnavailable?: boolean;
  error: string;
}

export interface ListingCancellationReadContext {
  currentTurn: number;
  offers: ShareOffer[];
  corporations: Map<string, Corporation>;
  characters: Map<string, Pick<Character, "_id" | "countryId" | "name" | "userId">>;
  fxByCurrency: Map<CurrencyCode, number>;
  expired?: boolean;
}

type PreparedRefund = {
  offer: ShareOffer;
  subjectType: "character" | "corporation";
  subjectId: ShareOffer["buyerCharacterId"] | NonNullable<ShareOffer["buyerCorporationId"]>;
  subjectName: string;
  currencyCode: CurrencyCode;
  refundAmount: number;
  currencyGuard: Record<string, unknown>;
};

async function restoreListingOpen(db: Db, listingId: ShareListing["_id"], now: Date) {
  await shareListingsCollection(db).updateOne(
    { _id: listingId, status: "cancelled" },
    { $set: { status: "open", updatedAt: now } }
  );
}

/**
 * Cancel an open share listing: mark it cancelled, refund all pending offer
 * escrows to buyers, and return reserved shares to the seller.
 *
 * Escrows on each offer are denominated in the listing corporation's
 * `liquidCurrencyCode`. We claim the listing before preparing refunds so no
 * new offers can land mid-cancel, but we validate every FX prerequisite before
 * any offer status flips so a temporary rate outage never strands escrow.
 */
export async function cancelShareListingAndRefund(
  db: Db,
  listing: ShareListing,
  now: Date,
  forexEnabled: boolean,
  /** Pre-fetched listing corp doc. Omit to have the helper fetch its own copy. */
  listingCorpDocOverride?: Corporation | null,
  readContext?: ListingCancellationReadContext
): Promise<CancelListingResult | CancelListingError> {
  return withShareCancellationTransaction(db, (transactionDb) =>
    cancelListingInTransaction(
      transactionDb,
      listing,
      now,
      forexEnabled,
      listingCorpDocOverride,
      readContext
    )
  );
}

async function cancelListingInTransaction(
  db: Db,
  listing: ShareListing,
  now: Date,
  forexEnabled: boolean,
  listingCorpDocOverride?: Corporation | null,
  readContext?: ListingCancellationReadContext
): Promise<CancelListingResult | CancelListingError> {
  if (listing.status !== "open") return { ok: false, error: "Listing is not open" };

  const listingClaim = await shareListingsCollection(db).updateOne(
    {
      _id: listing._id,
      status: "open",
      ...(readContext ? { offerRevision: listing.offerRevision ?? { $exists: false } } : {}),
      activeShareFillKey: { $exists: false },
      sharesRemaining: listing.sharesRemaining,
      ...(listing.holdingTerms ? { holdingTerms: listing.holdingTerms } : {}),
    },
    { $set: { status: "cancelled", updatedAt: now } }
  );
  if (listingClaim.matchedCount === 0) {
    return { ok: false, error: "Listing is not open" };
  }

  const pendingOffers =
    readContext?.offers ??
    (await shareOffersCollection(db).find({ listingId: listing._id, status: "pending" }).toArray());

  const listingCorpDoc =
    listingCorpDocOverride ??
    (await corporationsCollection(db).findOne({ _id: listing.corporationId }));
  const listingCorpFxRate =
    pendingOffers.length === 0
      ? 1
      : readContext
        ? fxRateForCorpFromMap(listingCorpDoc, readContext.fxByCurrency)
        : await getCorpFxRate(db, listingCorpDoc ?? {});

  const buyerCorpIds = [
    ...new Set(
      pendingOffers.flatMap((offer) =>
        offer.buyerCorporationId ? [offer.buyerCorporationId.toString()] : []
      )
    ),
  ];
  const buyerCharIds = [
    ...new Set(
      pendingOffers
        .filter((offer) => !offer.buyerCorporationId)
        .map((offer) => offer.buyerCharacterId.toString())
    ),
  ];

  const [buyerCorpDocs, buyerCharDocs, fxByCurrency] = readContext
    ? ([[], [], readContext.fxByCurrency] as const)
    : await Promise.all([
        buyerCorpIds.length > 0
          ? corporationsCollection(db)
              .find({ _id: { $in: buyerCorpIds.map((id) => new ObjectId(id)) } })
              .toArray()
          : Promise.resolve([] as Corporation[]),
        buyerCharIds.length > 0
          ? charactersCollection(db)
              .find(
                { _id: { $in: buyerCharIds.map((id) => new ObjectId(id)) } },
                { projection: { _id: 1, countryId: 1, name: 1 } }
              )
              .toArray()
          : Promise.resolve([] as Pick<Character, "_id" | "countryId" | "name">[]),
        forexEnabled ? loadFxRatesByCurrency(db) : Promise.resolve(null),
      ]);

  const buyerCorpById =
    readContext?.corporations ?? new Map(buyerCorpDocs.map((corp) => [corp._id.toString(), corp]));
  const buyerCharById =
    readContext?.characters ?? new Map(buyerCharDocs.map((char) => [char._id.toString(), char]));
  const preparedRefunds: PreparedRefund[] = [];

  for (const offer of pendingOffers) {
    const refundAnchor = corpLiquidCapitalToAnchor(
      offer.escrowAmount,
      listingCorpDoc ?? {},
      listingCorpFxRate
    );

    if (offer.buyerCorporationId) {
      const buyerCorp = buyerCorpById.get(offer.buyerCorporationId.toString());
      if (!buyerCorp) {
        await restoreListingOpen(db, listing._id, now);
        return { ok: false, error: "Buyer corporation not found" };
      }
      const buyerFxRate = readContext
        ? fxRateForCorpFromMap(buyerCorp, readContext.fxByCurrency)
        : await getCorpFxRate(db, buyerCorp);
      preparedRefunds.push({
        offer,
        subjectType: "corporation",
        subjectId: offer.buyerCorporationId,
        subjectName: buyerCorp.name,
        currencyCode: resolveCorpLiquidCurrencyCode(buyerCorp) ?? "USD",
        refundAmount: anchorToCorpLiquidCapital(refundAnchor, buyerCorp, buyerFxRate),
        currencyGuard: {
          countryId: buyerCorp.countryId,
          liquidCurrencyCode: buyerCorp.liquidCurrencyCode ?? { $exists: false },
        },
      });
      continue;
    }

    const buyerChar = buyerCharById.get(offer.buyerCharacterId.toString());
    if (!buyerChar) {
      await restoreListingOpen(db, listing._id, now);
      return { ok: false, error: "Buyer character not found" };
    }
    const homeCurrency = getHomeCurrency(buyerChar);
    if (forexEnabled && (!fxByCurrency || !(Number(fxByCurrency.get(homeCurrency)) > 0))) {
      await restoreListingOpen(db, listing._id, now);
      return {
        ok: false,
        rateUnavailable: true,
        error: "Exchange rate unavailable, try again shortly",
      };
    }
    preparedRefunds.push({
      offer,
      subjectType: "character",
      subjectId: offer.buyerCharacterId,
      subjectName: buyerChar.name,
      currencyCode: homeCurrency,
      refundAmount: forexEnabled ? refundAnchor * fxByCurrency!.get(homeCurrency)! : refundAnchor,
      currencyGuard: { countryId: buyerChar.countryId },
    });
  }

  const currentTurn = readContext?.currentTurn ?? (await getCurrentTurn(db));
  let refundedOffers = 0;
  const refundedOfferIds: string[] = [];

  let sharesReturned = 0;
  try {
    const currentOffers = preparedRefunds.length
      ? await shareOffersCollection(db)
          .find(
            { _id: { $in: preparedRefunds.map((refund) => refund.offer._id) } },
            { projection: { status: 1, escrowAmount: 1 } }
          )
          .toArray()
      : [];
    const offerById = new Map(currentOffers.map((offer) => [String(offer._id), offer]));
    const eligibleRefunds = preparedRefunds.filter((refund) => {
      const current = offerById.get(String(refund.offer._id));
      if (current?.status !== "pending") return false;
      if (current.escrowAmount !== refund.offer.escrowAmount)
        throw new Error("Pending offer changed; escrow remains held for retry");
      return true;
    });
    if (eligibleRefunds.length) {
      const claimed = await shareOffersCollection(db).bulkWrite(
        eligibleRefunds.map((refund) => ({
          updateOne: {
            filter: {
              _id: refund.offer._id,
              status: "pending",
              escrowAmount: refund.offer.escrowAmount,
            },
            update: {
              $set: { status: readContext?.expired ? "expired" : "cancelled", updatedAt: now },
            },
          },
        }))
      );
      if (claimed.matchedCount !== eligibleRefunds.length)
        throw new Error("Pending offers changed during escrow refund");
    }
    const corporationRefunds: AnyBulkWriteOperation<Corporation>[] = [];
    const characterRefunds: AnyBulkWriteOperation<Character>[] = [];
    const refundReceipts: Parameters<typeof emitTxBulk>[1] = [];
    for (const refund of eligibleRefunds) {
      if (refund.subjectType === "corporation")
        corporationRefunds.push({
          updateOne: {
            filter: { _id: refund.subjectId, ...refund.currencyGuard },
            update: { $inc: { liquidCapital: refund.refundAmount }, $set: { updatedAt: now } },
          },
        });
      else
        characterRefunds.push({
          updateOne: {
            filter: { _id: refund.subjectId, ...refund.currencyGuard },
            update: {
              $inc: buildPersonalBalanceInc(refund.refundAmount, refund.currencyCode, forexEnabled),
              $set: { updatedAt: now },
            },
          },
        });
      refundedOffers++;
      refundedOfferIds.push(String(refund.offer._id));
      refundReceipts.push({
        type: "share_listing_refund",
        turn: currentTurn,
        createdAt: now,
        subjectType: refund.subjectType,
        subjectId: refund.subjectId,
        subjectName: refund.subjectName,
        amount: Math.round(refund.refundAmount * 100) / 100,
        currencyCode: refund.currencyCode,
        counterpartyType: "system",
        counterpartyName: "Private listing escrow",
        meta: {
          listingId: listing._id.toString(),
          offerId: refund.offer._id.toString(),
          corporationId: listing.corporationId.toString(),
          shares: refund.offer.shares,
          pricePerShare: refund.offer.pricePerShare,
          reason: readContext?.expired ? "listing_expired" : "listing_cancelled",
        },
      });
    }

    if (corporationRefunds.length) {
      const result = await corporationsCollection(db).bulkWrite(corporationRefunds);
      if (result.matchedCount !== corporationRefunds.length)
        throw new Error("Buyer corporation not found");
    }
    if (characterRefunds.length) {
      const result = await charactersCollection(db).bulkWrite(characterRefunds);
      if (result.matchedCount !== characterRefunds.length)
        throw new Error("Buyer character not found");
    }
    if (refundReceipts.length) await emitTxBulk(db, refundReceipts, await loadTxThresholds(db));

    if (listing.sharesRemaining > 0) {
      if (listing.sellerCorporationId) {
        const targetCorp = await corporationsCollection(db).findOne(
          {
            _id: listing.corporationId,
            "shareholders.corporationId": listing.sellerCorporationId,
          },
          { projection: { "shareholders.$": 1 } }
        );
        const existingAvg =
          targetCorp?.shareholders?.[0]?.avgCostPerShare ?? listing.marketPriceAtCreation;
        const restored = await creditSharesToCorp(
          db,
          listing.corporationId,
          listing.sellerCorporationId,
          listing.sharesRemaining,
          existingAvg,
          { $set: { updatedAt: now } }
        );
        if (!restored) {
          throw new Error("Failed to restore seller corporation shares");
        }
      } else {
        const targetCorp = await corporationsCollection(db).findOne(
          { _id: listing.corporationId, "shareholders.characterId": listing.sellerCharacterId },
          { projection: { "shareholders.$": 1 } }
        );
        const returnPrice =
          targetCorp?.shareholders?.[0]?.avgCostPerShare ?? listing.marketPriceAtCreation;
        const restored = await creditShares(
          db,
          listing.corporationId,
          listing.sellerCharacterId,
          listing.sharesRemaining,
          { $set: { updatedAt: now } },
          {
            pricePerShare: returnPrice,
            ...(listing.holdingTerms
              ? { holdingChange: { turn: currentTurn, restore: listing.holdingTerms } }
              : {}),
          }
        );
        if (!restored) {
          throw new Error("Failed to restore seller shares");
        }
      }
      sharesReturned = listing.sharesRemaining;
    }
  } catch (error) {
    throw error;
  }

  return {
    ok: true,
    refundedOffers,
    sharesReturned,
    ...(readContext?.expired ? { refundedOfferIds } : {}),
  };
}
