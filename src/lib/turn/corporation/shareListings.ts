import type { Db, AnyBulkWriteOperation } from "mongodb";
import type { Notification, ShareListing, ShareOffer } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { withSessionDb } from "@/lib/db/sessionDb";
import { cancelShareListingAndRefund } from "@/lib/corporations/cancelShareListing";
import {
  matureHoldingTerms,
  SHORT_TERM_HOLDING_TURNS,
} from "@/lib/corporations/rules/holdingTerms";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { notificationsCollection } from "@/lib/db/repositories/notifications";
import { shareListingsCollection } from "@/lib/db/repositories/shareListings";
import { shareOffersCollection } from "@/lib/db/repositories/shareOffers";

/**
 * Expire share listings whose expiresAt has passed:
 * 1. Return reserved shares to sellers.
 * 2. Refund all pending offer escrows to buyers.
 * 3. Send notifications to buyers with pending offers.
 */
export async function expireShareListings(db: Db, now: Date, currentTurn: number): Promise<void> {
  // Turn-first expiry (freezes on pause) with a wall-clock fallback for legacy
  // listings created before `expiresAtTurn` existed.
  const expiryFilter = {
    status: "open" as const,
    activeShareFillKey: { $exists: false },
    $or: [
      { expiresAtTurn: { $lte: currentTurn } },
      { expiresAtTurn: { $exists: false }, expiresAt: { $lte: now } },
    ],
  };
  const candidates = await shareListingsCollection(db)
    .find({
      status: "open",
      activeShareFillKey: { $exists: false },
      $or: [
        ...expiryFilter.$or,
        {
          "holdingTerms.shortTermLots.acquiredTurn": {
            $lte: currentTurn - SHORT_TERM_HOLDING_TURNS,
          },
        },
      ],
    })
    .toArray();
  const expiredListings = candidates.filter((listing) =>
    listing.expiresAtTurn !== undefined
      ? listing.expiresAtTurn <= currentTurn
      : listing.expiresAt <= now
  );
  const maturationOps: AnyBulkWriteOperation<ShareListing>[] = candidates
    .filter((listing) => !expiredListings.includes(listing) && listing.holdingTerms)
    .map((listing) => ({
      updateOne: {
        filter: {
          _id: listing._id,
          status: "open",
          activeShareFillKey: { $exists: false },
          sharesRemaining: listing.sharesRemaining,
          holdingTerms: listing.holdingTerms,
        },
        update: { $set: { holdingTerms: matureHoldingTerms(listing.holdingTerms!, currentTurn) } },
      },
    }));
  if (maturationOps.length) await shareListingsCollection(db).bulkWrite(maturationOps);

  if (expiredListings.length === 0) return;

  const offers = await shareOffersCollection(db)
    .find({
      listingId: { $in: expiredListings.map((listing) => listing._id) },
      status: "pending",
    })
    .toArray();
  const corporationIds = [
    ...new Map([
      ...expiredListings.map(
        (listing) => [String(listing.corporationId), listing.corporationId] as const
      ),
      ...offers.flatMap((offer) =>
        offer.buyerCorporationId
          ? [[String(offer.buyerCorporationId), offer.buyerCorporationId] as const]
          : []
      ),
    ]).values(),
  ];
  const buyerIds = [
    ...new Map(
      offers.map((offer) => [String(offer.buyerCharacterId), offer.buyerCharacterId])
    ).values(),
  ];
  const [corporations, characters, fxByCurrency, forexEnabled] = await Promise.all([
    corporationsCollection(db)
      .find(
        { _id: { $in: corporationIds } },
        {
          projection: { _id: 1, name: 1, liquidCurrencyCode: 1, countryId: 1 },
        }
      )
      .toArray(),
    buyerIds.length
      ? charactersCollection(db)
          .find(
            { _id: { $in: buyerIds } },
            {
              projection: { _id: 1, countryId: 1, name: 1, userId: 1 },
            }
          )
          .toArray()
      : Promise.resolve([]),
    offers.length ? loadFxRatesByCurrency(db) : Promise.resolve(new Map<CurrencyCode, number>()),
    isForexEnabled(),
  ]);
  const corporationById = new Map(corporations.map((corp) => [String(corp._id), corp]));
  const characterById = new Map(characters.map((character) => [String(character._id), character]));
  const offersByListing = new Map<string, ShareOffer[]>();
  for (const offer of offers) {
    const key = String(offer.listingId);
    const list = offersByListing.get(key) ?? [];
    list.push(offer);
    offersByListing.set(key, list);
  }
  for (const listing of expiredListings) {
    try {
      await withSessionDb(db, async (transactionDb) => {
        const pendingOffers = offersByListing.get(String(listing._id)) ?? [];
        const issuer = corporationById.get(String(listing.corporationId));
        if (!issuer && (pendingOffers.length || listing.sharesRemaining > 0))
          throw new Error("Listing issuer is missing; escrow and reserved shares remain held");
        const result = await cancelShareListingAndRefund(
          transactionDb,
          listing,
          now,
          forexEnabled,
          issuer,
          {
            currentTurn,
            offers: pendingOffers,
            corporations: corporationById,
            characters: characterById,
            fxByCurrency,
            expired: true,
          }
        );
        if (!result.ok) throw new Error(result.error);
        const refunded = new Set(result.refundedOfferIds ?? []);
        const notified = new Set<string>();
        const notifications: Omit<Notification, "_id">[] = [];
        for (const offer of pendingOffers) {
          if (!refunded.has(String(offer._id))) continue;
          const buyer = characterById.get(String(offer.buyerCharacterId));
          if (!buyer?.userId || notified.has(String(buyer.userId))) continue;
          notified.add(String(buyer.userId));
          notifications.push({
            userId: buyer.userId,
            type: "share_offer_expired",
            title: "Share listing expired",
            message:
              "A private share listing you made an offer on has expired. Your escrow has been refunded.",
            read: false,
            metadata: { listingId: String(listing._id) },
            createdAt: now,
          });
        }
        if (notifications.length)
          await notificationsCollection<Omit<Notification, "_id">>(transactionDb).insertMany(
            notifications
          );
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Listing is not open") continue;
      console.error(`[shareListings] deferred listing ${listing._id}; escrow remains held:`, error);
    }
  }
}
