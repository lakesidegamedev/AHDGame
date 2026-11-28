import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareOrder } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { cancelShareOrderAndRefund } from "./cancelShareOrder";
import { cancelShareListingAndRefund } from "./cancelShareListing";
import type { ShareListing } from "@/lib/db/types";
import { emitTx, emitTxBulk } from "@/lib/financialTxLog/emit";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTx: vi.fn().mockResolvedValue("applied"),
  emitTxBulk: vi.fn().mockResolvedValue(undefined),
  loadTxThresholds: vi.fn().mockResolvedValue({}),
}));
beforeEach(() => {
  vi.mocked(emitTx).mockReset().mockResolvedValue("applied");
  vi.mocked(emitTxBulk).mockReset().mockResolvedValue(undefined);
});
function fixture() {
  const f = createTransactionalMemoryDb();
  const issuer = new ObjectId(),
    owner = new ObjectId();
  const order = {
    _id: new ObjectId(),
    corporationId: issuer,
    placerCorporationId: owner,
    type: "buy",
    status: "open",
    sharesRemaining: 100,
    escrowAmount: 100,
    pricePerShare: 1,
  } as ShareOrder;
  f.memory.seed("corporations", [
    { _id: issuer, countryId: "US", liquidCurrencyCode: "USD", liquidCapital: 0 },
    {
      _id: owner,
      name: "Synthetic",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 400,
    },
  ]);
  f.memory.seed("shareOrders", [{ ...order }]);
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10 }]);
  f.memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  return { ...f, order, owner };
}
describe("atomic escrow cancellation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("aborts an already-credited refund when the receipt fails, then retries once", async () => {
    const f = fixture();
    vi.mocked(emitTx).mockRejectedValueOnce(new Error("interrupted refund receipt"));
    await expect(cancelShareOrderAndRefund(f.db, f.order)).rejects.toThrow(
      "interrupted refund receipt"
    );
    expect((await f.memory.collection("shareOrders").findOne({ _id: f.order._id }))?.status).toBe(
      "open"
    );
    expect(
      (await f.memory.collection("corporations").findOne({ _id: f.owner }))?.liquidCapital
    ).toBe(400);
    await Promise.all([
      cancelShareOrderAndRefund(f.db, f.order),
      cancelShareOrderAndRefund(f.db, f.order),
    ]);
    expect(
      (await f.memory.collection("corporations").findOne({ _id: f.owner }))?.liquidCapital
    ).toBe(500);
    expect((await f.memory.collection("shareOrders").findOne({ _id: f.order._id }))?.status).toBe(
      "cancelled"
    );
  });
});

it("restores every listing refund prefix and the listing before retrying its reserved shares", async () => {
  const f = fixture();
  const issuer = f.order.corporationId,
    seller = new ObjectId(),
    other = new ObjectId();
  f.memory.seed("characters", [{ _id: seller, countryId: "US", cashOnHand: 0 }]);
  await f.memory.collection("corporations").updateOne(
    { _id: issuer },
    {
      $set: {
        totalShares: 1000,
        publicFloat: 0,
        shareholders: [{ characterId: other, shares: 990 }],
      },
    }
  );
  const listing = {
    _id: new ObjectId(),
    corporationId: issuer,
    sellerCharacterId: seller,
    sharesListed: 10,
    sharesRemaining: 10,
    marketPriceAtCreation: 1,
    status: "open",
    createdAt: new Date(),
    expiresAt: new Date(),
  } as ShareListing;
  f.memory.seed("shareListings", [{ ...listing }]);
  f.memory.seed(
    "shareOffers",
    [0, 1].map(() => ({
      _id: new ObjectId(),
      listingId: listing._id,
      corporationId: issuer,
      buyerCorporationId: f.owner,
      buyerCharacterId: seller,
      shares: 5,
      pricePerShare: 20,
      escrowAmount: 100,
      status: "pending",
      createdAt: new Date(),
    }))
  );
  vi.mocked(emitTxBulk).mockRejectedValueOnce(new Error("interrupted receipt batch"));
  await expect(cancelShareListingAndRefund(f.db, listing, new Date(), false)).rejects.toThrow(
    "interrupted receipt batch"
  );
  expect(f.memory.collection("shareOffers").docs.map((offer) => offer.status)).toEqual([
    "pending",
    "pending",
  ]);
  expect(f.memory.collection("shareListings").docs[0].status).toBe("open");
  expect((await f.memory.collection("corporations").findOne({ _id: f.owner }))?.liquidCapital).toBe(
    400
  );
  await Promise.all([
    cancelShareListingAndRefund(f.db, listing, new Date(), false),
    cancelShareListingAndRefund(f.db, listing, new Date(), false),
  ]);
  expect((await f.memory.collection("corporations").findOne({ _id: f.owner }))?.liquidCapital).toBe(
    600
  );
  const corp = await f.memory.collection("corporations").findOne({ _id: issuer });
  expect(
    (corp?.shareholders as { characterId: ObjectId; shares: number }[]).find((holder) =>
      holder.characterId.equals(seller)
    )?.shares
  ).toBe(10);
});

it("refuses an expiry snapshot that omitted a newly committed offer even with an unchanged timestamp", async () => {
  const f = fixture(),
    seller = new ObjectId();
  const listing = {
    _id: new ObjectId(),
    corporationId: f.order.corporationId,
    sellerCharacterId: seller,
    sharesListed: 10,
    sharesRemaining: 0,
    marketPriceAtCreation: 1,
    status: "open",
    createdAt: new Date(),
    expiresAt: new Date(),
    updatedAt: new Date(0),
  } as ShareListing;
  f.memory.seed("shareListings", [{ ...listing, offerRevision: 1 }]);
  const result = await cancelShareListingAndRefund(f.db, listing, new Date(), false, undefined, {
    currentTurn: 10,
    offers: [],
    corporations: new Map(),
    characters: new Map(),
    fxByCurrency: new Map(),
    expired: true,
  });
  expect(result.ok).toBe(false);
  expect(f.memory.collection("shareListings").docs[0].status).toBe("open");
});

it("keeps an orphaned order's escrow open without losing its claim", async () => {
  const f = fixture();
  await f.memory.collection("corporations").deleteOne({ _id: f.owner });
  const result = await cancelShareOrderAndRefund(f.db, f.order);
  expect(result.ok).toBe(false);
  const held = await f.memory.collection("shareOrders").findOne({ _id: f.order._id });
  expect(held?.status).toBe("open");
  expect(held?.escrowAmount).toBe(100);
  expect(emitTx).not.toHaveBeenCalled();
});

it("rolls back a cleanup refund interrupted after credit, then closes it once", async () => {
  const { cancelPendingShareOfferAndRefund } = await import("./cleanupShareMarketActivity");
  const f = fixture();
  const offer = {
    _id: new ObjectId(),
    listingId: new ObjectId(),
    corporationId: f.order.corporationId,
    buyerCorporationId: f.owner,
    buyerCharacterId: new ObjectId(),
    shares: 10,
    pricePerShare: 10,
    escrowAmount: 100,
    status: "pending",
    createdAt: new Date(),
  } as const;
  f.memory.seed("shareOffers", [{ ...offer }]);
  vi.mocked(emitTx).mockRejectedValueOnce(new Error("cleanup receipt interruption"));
  await expect(cancelPendingShareOfferAndRefund(f.db, offer, new Date(), false)).rejects.toThrow(
    "cleanup receipt interruption"
  );
  expect(f.memory.collection("shareOffers").docs[0].status).toBe("pending");
  expect((await f.memory.collection("corporations").findOne({ _id: f.owner }))?.liquidCapital).toBe(
    400
  );
  await Promise.all(
    [0, 1].map(() => cancelPendingShareOfferAndRefund(f.db, offer, new Date(), false))
  );
  expect((await f.memory.collection("corporations").findOne({ _id: f.owner }))?.liquidCapital).toBe(
    500
  );
  expect(f.memory.collection("shareOffers").docs[0].status).toBe("cancelled");
});
