import { ObjectId, type Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareListing } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { expireShareListings } from "./shareListings";
import { cancelShareListingAndRefund } from "@/lib/corporations/cancelShareListing";
import { creditShares } from "@/lib/corporations/shareholderOps";
import { resetCorpFxRateCacheForTests } from "@/lib/currency/corporationCapital";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/corporations/shareholderOps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/corporations/shareholderOps")>();
  return { ...actual, creditShares: vi.fn(actual.creditShares) };
});
const NOW = new Date("2026-08-24T00:00:00Z");
function fixture(count = 1) {
  const f = createTransactionalMemoryDb();
  const issuer = new ObjectId(),
    buyer = new ObjectId(),
    owner = new ObjectId();
  const listings = Array.from(
    { length: count },
    () =>
      ({
        _id: new ObjectId(),
        corporationId: issuer,
        sellerCharacterId: new ObjectId(),
        sharesListed: 10,
        sharesRemaining: 10,
        marketPriceAtCreation: 1,
        status: "open",
        createdAt: NOW,
        expiresAt: NOW,
        expiresAtTurn: 20,
      }) as ShareListing
  );
  f.memory.seed("corporations", [
    {
      _id: issuer,
      countryId: "US",
      liquidCurrencyCode: "USD",
      totalShares: 1000,
      publicFloat: 0,
      liquidCapital: 0,
      shareholders: [{ characterId: owner, shares: 1000 - count * 10 }],
    },
  ]);
  f.memory.seed("characters", [
    { _id: buyer, countryId: "US", name: "Synthetic buyer", userId: new ObjectId(), cashOnHand: 0 },
    ...listings.map((listing) => ({
      _id: listing.sellerCharacterId,
      countryId: "US",
      name: "Synthetic seller",
      cashOnHand: 0,
    })),
  ]);
  f.memory.seed(
    "shareListings",
    listings.map((listing) => ({ ...listing }))
  );
  f.memory.seed(
    "shareOffers",
    listings.map((listing) => ({
      _id: new ObjectId(),
      listingId: listing._id,
      corporationId: issuer,
      buyerCharacterId: buyer,
      shares: 10,
      pricePerShare: 10,
      escrowAmount: 100,
      status: "pending",
      createdAt: NOW,
    }))
  );
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 20, worldEpochId: "test", isProcessing: true },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  return { ...f, issuer, buyer, listings };
}
const cash = async (db: Db, buyer: ObjectId) =>
  (await db.collection("characters").findOne({ _id: buyer }))?.cashOnHand;
describe("atomic listing expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCorpFxRateCacheForTests();
  });
  it("does not refund a listing already closed by another lifecycle path", async () => {
    const f = fixture();
    await f.memory
      .collection("shareListings")
      .updateOne({ _id: f.listings[0]._id }, { $set: { status: "cancelled" } });
    await expireShareListings(f.db, NOW, 20);
    expect(await cash(f.db, f.buyer)).toBe(0);
    expect(f.memory.collection("shareOffers").docs[0].status).toBe("pending");
  });
  it("refunds and returns shares once when cancellation overlaps expiry", async () => {
    const f = fixture();
    await Promise.all([
      expireShareListings(f.db, NOW, 20),
      cancelShareListingAndRefund(f.db, f.listings[0], NOW, false),
    ]);
    expect(await cash(f.db, f.buyer)).toBe(100);
    const issuer = await f.memory.collection("corporations").findOne({ _id: f.issuer });
    expect(
      (issuer?.shareholders as { shares: number }[]).reduce((sum, holder) => sum + holder.shares, 0)
    ).toBe(1000);
    await expireShareListings(f.db, NOW, 20);
    expect(await cash(f.db, f.buyer)).toBe(100);
  });
  it("retains a failed listing's escrow while unrelated expiry finishes, then retries the failed listing", async () => {
    const f = fixture(2);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(creditShares).mockResolvedValueOnce(false);
    await expireShareListings(f.db, NOW, 20);
    expect(f.memory.collection("shareListings").docs.map((listing) => listing.status)).toEqual([
      "open",
      "cancelled",
    ]);
    expect(f.memory.collection("shareOffers").docs.map((offer) => offer.status)).toEqual([
      "pending",
      "expired",
    ]);
    expect(await cash(f.db, f.buyer)).toBe(100);
    await expireShareListings(f.db, NOW, 20);
    expect(await cash(f.db, f.buyer)).toBe(200);
    expect(f.memory.collection("shareOffers").docs.map((offer) => offer.status)).toEqual([
      "expired",
      "expired",
    ]);
    expect(f.memory.collection("notifications").docs).toHaveLength(2);
  });
  it("defers an unavailable corporate currency instead of paying at parity", async () => {
    const f = fixture(2),
      canadian = new ObjectId();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await f.memory
      .collection("corporations")
      .insertOne({ _id: canadian, countryId: "CA", liquidCurrencyCode: "CAD", liquidCapital: 0 });
    await f.memory
      .collection("shareOffers")
      .updateOne({ listingId: f.listings[0]._id }, { $set: { buyerCorporationId: canadian } });
    await expireShareListings(f.db, NOW, 20);
    expect(f.memory.collection("shareListings").docs.map((listing) => listing.status)).toEqual([
      "open",
      "cancelled",
    ]);
    expect(
      (await f.memory.collection("corporations").findOne({ _id: canadian }))?.liquidCapital
    ).toBe(0);
    expect(await cash(f.db, f.buyer)).toBe(100);
    await f.memory
      .collection("exchangeRates")
      .insertOne({ _id: "CAD", currencyCode: "CAD", rate: 2 });
    resetCorpFxRateCacheForTests();
    await expireShareListings(f.db, NOW, 20);
    expect(
      (await f.memory.collection("corporations").findOne({ _id: canadian }))?.liquidCapital
    ).toBe(200);
  });
});
