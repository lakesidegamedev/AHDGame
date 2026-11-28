vi.mock("@/lib/corporations/shareCancellationTransaction", () => ({
  withShareCancellationTransaction: (db: unknown, work: (db: unknown) => Promise<unknown>) =>
    work(db),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { cancelShareListingAndRefund } from "./cancelShareListing";

vi.mock("@/lib/corporations/shareholderOps", () => ({
  creditShares: vi.fn().mockResolvedValue(true),
  creditSharesToCorp: vi.fn().mockResolvedValue(true),
  debitShares: vi.fn(),
  debitSharesFromCorp: vi.fn(),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: vi.fn().mockResolvedValue(undefined),
  loadTxThresholds: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/turn/currentTurn", () => ({
  getCurrentTurn: vi.fn().mockResolvedValue(23),
}));

let db: MockDb;

beforeEach(() => {
  db = createMockDb();
  vi.clearAllMocks();
  for (const name of ["shareOffers", "characters", "corporations"]) {
    db.collection(name);
    db.collectionMocks[name].bulkWrite.mockImplementation(async (ops: unknown[]) => ({
      matchedCount: ops.length,
      modifiedCount: ops.length,
    }));
  }
});

describe("cancelShareListingAndRefund", () => {
  it("does not debit a holder when returning reserved shares fails", async () => {
    const id = new ObjectId(),
      corporationId = new ObjectId(),
      sellerId = new ObjectId();
    const listing = {
      _id: id,
      corporationId,
      sellerCharacterId: sellerId,
      sharesListed: 5,
      sharesRemaining: 5,
      marketPriceAtCreation: 10,
      status: "open" as const,
      createdAt: new Date(),
      expiresAt: new Date(),
      holdingTerms: { longTermShares: 5, longTermCostBasisAnchor: 20, shortTermLots: [] },
    };
    const { creditShares, debitShares } = await import("./shareholderOps");
    vi.mocked(creditShares).mockResolvedValueOnce(false);
    await expect(
      cancelShareListingAndRefund(db as never, listing, new Date(), false, {
        _id: corporationId,
        countryId: "US",
        liquidCurrencyCode: "USD",
      } as never)
    ).rejects.toThrow("restore seller shares");
    expect(debitShares).not.toHaveBeenCalled();
    expect(db.collectionMocks.shareListings.updateOne).toHaveBeenCalledTimes(1);
  });
  it("restores the listing when buyer FX data is unavailable", async () => {
    const listingId = new ObjectId();
    const listingCorpId = new ObjectId();
    const sellerId = new ObjectId();
    const buyerId = new ObjectId();

    const listing = {
      _id: listingId,
      corporationId: listingCorpId,
      sellerCharacterId: sellerId,
      sharesListed: 50,
      sharesRemaining: 50,
      marketPriceAtCreation: 1000,
      status: "open" as const,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };

    db.collection("shareListings");
    db.collectionMocks["shareListings"].updateOne
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1 });

    db.collection("shareOffers");
    db.collectionMocks["shareOffers"].find.mockReturnValue({
      toArray: async () => [
        {
          _id: new ObjectId(),
          listingId,
          corporationId: listingCorpId,
          buyerCharacterId: buyerId,
          shares: 50,
          pricePerShare: 1000,
          escrowAmount: 50_000,
          status: "pending",
          createdAt: new Date(),
        },
      ],
    });

    db.collection("characters");
    db.collectionMocks["characters"].find.mockReturnValueOnce({
      toArray: async () => [{ _id: buyerId, countryId: "UK", name: "Buyer" }],
    });

    db.collection("exchangeRates");
    db.collectionMocks["exchangeRates"].findOne.mockImplementation(
      (filter: { currencyCode?: string }) => {
        if (filter?.currencyCode === "JPY") {
          return Promise.resolve({ currencyCode: "JPY", rate: 100 });
        }
        return Promise.resolve(null);
      }
    );
    db.collectionMocks["exchangeRates"].find.mockReturnValueOnce({
      toArray: async () => [{ currencyCode: "JPY", rate: 100 }],
    });

    const result = await cancelShareListingAndRefund(
      db as never,
      listing as never,
      new Date(),
      true,
      { _id: listingCorpId, countryId: "JP", liquidCurrencyCode: "JPY" } as never
    );

    expect(result).toEqual({
      ok: false,
      rateUnavailable: true,
      error: "Exchange rate unavailable, try again shortly",
    });
    expect(db.collectionMocks["shareListings"].updateOne).toHaveBeenCalledTimes(2);
    expect(db.collectionMocks["shareOffers"].updateOne).not.toHaveBeenCalled();
  });

  it("refunds pending offers and emits ledger rows", async () => {
    const listingId = new ObjectId();
    const listingCorpId = new ObjectId();
    const sellerId = new ObjectId();
    const buyerId = new ObjectId();

    const listing = {
      _id: listingId,
      corporationId: listingCorpId,
      sellerCharacterId: sellerId,
      sharesListed: 50,
      sharesRemaining: 50,
      marketPriceAtCreation: 1000,
      status: "open" as const,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };

    db.collection("shareListings");
    db.collectionMocks["shareListings"].updateOne.mockResolvedValue({ matchedCount: 1 });

    const offerId = new ObjectId();
    db.collection("shareOffers");
    db.collectionMocks["shareOffers"].find.mockReturnValue({
      toArray: async () => [
        {
          _id: offerId,
          listingId,
          corporationId: listingCorpId,
          buyerCharacterId: buyerId,
          shares: 50,
          pricePerShare: 1000,
          escrowAmount: 50_000,
          status: "pending",
          createdAt: new Date(),
        },
      ],
    });
    db.collectionMocks["shareOffers"].updateOne.mockResolvedValue({ matchedCount: 1 });

    db.collection("characters");
    db.collectionMocks["characters"].find.mockReturnValueOnce({
      toArray: async () => [{ _id: buyerId, countryId: "US", name: "Buyer" }],
    });
    db.collectionMocks["characters"].updateOne.mockResolvedValue({ modifiedCount: 1 });

    db.collection("corporations");
    db.collectionMocks["corporations"].findOne.mockResolvedValue(null);

    db.collection("exchangeRates");
    db.collectionMocks["exchangeRates"].findOne.mockImplementation(
      (filter: { currencyCode?: string }) => {
        if (filter?.currencyCode === "JPY") {
          return Promise.resolve({ currencyCode: "JPY", rate: 100 });
        }
        return Promise.resolve(null);
      }
    );

    const { emitTxBulk } = await import("@/lib/financialTxLog/emit");

    const result = await cancelShareListingAndRefund(
      db as never,
      listing as never,
      new Date(),
      false,
      { _id: listingCorpId, countryId: "JP", liquidCurrencyCode: "JPY" } as never
    );

    expect(result).toEqual({ ok: true, refundedOffers: 1, sharesReturned: 50 });
    expect(db.collectionMocks["characters"].bulkWrite).toHaveBeenCalled();
    expect(emitTxBulk).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          type: "share_listing_refund",
          subjectType: "character",
          subjectId: buyerId,
        }),
      ]),
      expect.anything()
    );
  });

  it("propagates a late refund error for the transaction to abort", async () => {
    const listingId = new ObjectId();
    const listingCorpId = new ObjectId();
    const sellerId = new ObjectId();
    const buyerId = new ObjectId();
    const offerId = new ObjectId();

    const listing = {
      _id: listingId,
      corporationId: listingCorpId,
      sellerCharacterId: sellerId,
      sharesListed: 50,
      sharesRemaining: 50,
      marketPriceAtCreation: 1000,
      status: "open" as const,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };

    db.collection("shareListings");
    db.collectionMocks["shareListings"].updateOne
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1 });

    db.collection("shareOffers");
    db.collectionMocks["shareOffers"].find.mockReturnValue({
      toArray: async () => [
        {
          _id: offerId,
          listingId,
          corporationId: listingCorpId,
          buyerCharacterId: buyerId,
          shares: 50,
          pricePerShare: 1000,
          escrowAmount: 50_000,
          status: "pending",
          createdAt: new Date(),
        },
      ],
    });
    db.collectionMocks["shareOffers"].updateOne
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1 });

    db.collection("characters");
    db.collectionMocks["characters"].find.mockReturnValueOnce({
      toArray: async () => [{ _id: buyerId, countryId: "US", name: "Buyer" }],
    });
    db.collectionMocks["characters"].updateOne
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

    db.collection("corporations");
    db.collectionMocks["corporations"].findOne.mockResolvedValue(null);

    db.collection("exchangeRates");
    db.collectionMocks["exchangeRates"].findOne.mockResolvedValue(null);

    const { emitTxBulk } = await import("@/lib/financialTxLog/emit");
    vi.mocked(emitTxBulk).mockRejectedValueOnce(new Error("ledger failed"));

    await expect(
      cancelShareListingAndRefund(db as never, listing as never, new Date(), false, {
        _id: listingCorpId,
        countryId: "US",
        liquidCurrencyCode: "USD",
      } as never)
    ).rejects.toThrow("ledger failed");

    expect(db.collectionMocks["characters"].bulkWrite).toHaveBeenCalledTimes(1);
    expect(db.collectionMocks["shareOffers"].bulkWrite).toHaveBeenCalledTimes(1);
    expect(db.collectionMocks["shareListings"].updateOne).toHaveBeenCalledTimes(1);
  });
});
