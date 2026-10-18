import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { MARKET_MAKER_SPREAD } from "@/lib/constants/currencies";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/newCharacterTransferBarrier", () => ({
  newCharacterTransferBarrierResponse: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/db/characterLookup", () => ({ getCharacterByUserId: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/currency/autoConvert", () => ({
  autoConvertForPurchase: vi.fn(),
}));
vi.mock("@/lib/currency/characterFunds", () => ({
  getHomeCurrency: vi.fn().mockReturnValue("USD"),
  loadCharacterFxRate: vi.fn(),
}));
vi.mock("@/lib/currency/corporationCapital", async () => {
  const actual = await vi.importActual<typeof import("@/lib/currency/corporationCapital")>(
    "@/lib/currency/corporationCapital"
  );
  return {
    ...actual,
    loadFxRatesRecord: vi.fn().mockResolvedValue({ USD: 0.75, GBP: 1 }),
  };
});
vi.mock("@/lib/financialTxLog/atomicCashGuard", () => ({
  atomicallyDebitCharacterCash: vi.fn(),
  refundCharacterCash: vi.fn(),
  atomicallyDebitCorpLiquidCapital: vi.fn(),
  refundCorpLiquidCapital: vi.fn(),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/turn/currentTurn", () => ({ getCurrentTurn: vi.fn().mockResolvedValue(12) }));

function duplicateKeyError(message: string, keyPattern: Record<string, number>) {
  return Object.assign(new Error(message), { code: 11000, keyPattern });
}

let db: MockDb;

beforeEach(async () => {
  db = createMockDb();
  vi.clearAllMocks();

  const { isForexEnabled } = await import("@/lib/currency/featureFlag");
  vi.mocked(isForexEnabled).mockResolvedValue(false);
  const { getHomeCurrency, loadCharacterFxRate } = await import("@/lib/currency/characterFunds");
  vi.mocked(getHomeCurrency).mockReturnValue("USD");
  vi.mocked(loadCharacterFxRate).mockReset();
  const { autoConvertForPurchase } = await import("@/lib/currency/autoConvert");
  vi.mocked(autoConvertForPurchase).mockReset();

  db.collection("shareListings");
  db.collection("shareOffers");
  db.collection("corporations");
  db.collection("characters");
  db.collection("notifications");

  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as never);
});

describe("POST /api/corporations/[id]/shares/listings/[listingId]/offers", () => {
  it("returns 404 when the listing does not belong to the corporation path", async () => {
    const userId = new ObjectId();
    const buyerId = new ObjectId();
    const listingId = new ObjectId();
    const listingCorpId = new ObjectId();
    const pathCorpId = new ObjectId();
    const sellerId = new ObjectId();

    const { requireBasicAuth } = await import("@/lib/api/requireAuth");
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: userId.toString() },
    } as never);

    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({
      _id: buyerId,
      userId,
      name: "Buyer Test",
      countryId: "US",
    } as never);

    db.collection("corporations");
    db.collectionMocks["corporations"]!.findOne.mockResolvedValueOnce({
      _id: pathCorpId,
      name: "Path Corp",
    }).mockResolvedValueOnce({
      _id: listingCorpId,
      name: "Listing Corp",
      liquidCurrencyCode: "USD",
    });

    db.collection("shareListings");
    db.collectionMocks["shareListings"]!.findOne.mockResolvedValue({
      _id: listingId,
      corporationId: listingCorpId,
      sellerCharacterId: sellerId,
      status: "open",
      expiresAt: new Date(Date.now() + 60_000),
      marketPriceAtCreation: 100,
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/corporations/corp/shares/listings/listing/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: 10,
          pricePerShare: 100,
          offerAsCorporation: false,
        }),
      }),
      { params: Promise.resolve({ id: pathCorpId.toString(), listingId: listingId.toString() }) }
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "Listing not found" });
    expect(db.collectionMocks["shareOffers"]!.insertOne).not.toHaveBeenCalled();
  });

  it("refunds escrow when a duplicate pending offer insert loses the race", async () => {
    const userId = new ObjectId();
    const buyerId = new ObjectId();
    const listingId = new ObjectId();
    const corporationId = new ObjectId();
    const sellerId = new ObjectId();

    const { requireBasicAuth } = await import("@/lib/api/requireAuth");
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: userId.toString() },
    } as never);

    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({
      _id: buyerId,
      userId,
      name: "Buyer Test",
      countryId: "US",
    } as never);

    const { atomicallyDebitCharacterCash, refundCharacterCash } =
      await import("@/lib/financialTxLog/atomicCashGuard");
    vi.mocked(atomicallyDebitCharacterCash).mockResolvedValue({
      ok: true,
      newBalance: 9000,
    } as never);

    db.collectionMocks["shareListings"]!.findOne.mockResolvedValue({
      _id: listingId,
      corporationId,
      sellerCharacterId: sellerId,
      status: "open",
      expiresAt: new Date(Date.now() + 60_000),
      marketPriceAtCreation: 100,
    });
    db.collectionMocks["corporations"]!.findOne.mockResolvedValueOnce({
      _id: corporationId,
      name: "Path Corp",
    }).mockResolvedValueOnce({
      _id: corporationId,
      name: "Target Corp",
      liquidCurrencyCode: "USD",
    });
    db.collectionMocks["shareOffers"]!.findOne.mockResolvedValue(null);
    db.collectionMocks["shareOffers"]!.insertOne.mockRejectedValue(
      duplicateKeyError(
        "E11000 duplicate key error collection: shareOffers index: unique_pending_share_offer_per_buyer_listing dup key",
        { listingId: 1, buyerCharacterId: 1 }
      )
    );

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/corporations/corp/shares/listings/listing/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: 10,
          pricePerShare: 100,
          offerAsCorporation: false,
        }),
      }),
      { params: Promise.resolve({ id: corporationId.toString(), listingId: listingId.toString() }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "You already have a pending offer on this listing",
    });
    expect(refundCharacterCash).toHaveBeenCalledWith(db, buyerId, "USD", 1000, false);
  });

  it("charges corporation escrow with FX spread when the buyer corp currency differs", async () => {
    const userId = new ObjectId();
    const buyerId = new ObjectId();
    const listingId = new ObjectId();
    const targetCorpId = new ObjectId();
    const buyerCorpId = new ObjectId();
    const sellerId = new ObjectId();

    const { requireBasicAuth } = await import("@/lib/api/requireAuth");
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: userId.toString() },
    } as never);

    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({
      _id: buyerId,
      userId,
      name: "Buyer Test",
      countryId: "GB",
    } as never);

    const { atomicallyDebitCorpLiquidCapital } =
      await import("@/lib/financialTxLog/atomicCashGuard");
    vi.mocked(atomicallyDebitCorpLiquidCapital).mockResolvedValue({
      ok: true,
      newBalance: 9_000,
    } as never);

    db.collectionMocks["shareListings"]!.findOne.mockResolvedValue({
      _id: listingId,
      corporationId: targetCorpId,
      sellerCharacterId: sellerId,
      status: "open",
      expiresAt: new Date(Date.now() + 60_000),
      marketPriceAtCreation: 100,
    });
    db.collectionMocks["corporations"]!.findOne.mockResolvedValueOnce({
      _id: targetCorpId,
      name: "Path Corp",
    })
      .mockResolvedValueOnce({
        _id: targetCorpId,
        name: "Target Corp",
        liquidCurrencyCode: "USD",
        countryId: "US",
      })
      .mockResolvedValueOnce({
        _id: buyerCorpId,
        name: "Buyer Corp",
        liquidCapital: 20_000,
        liquidCurrencyCode: "GBP",
        ceoId: buyerId,
      });
    db.collectionMocks["shareOffers"]!.findOne.mockResolvedValue(null);
    db.collectionMocks["shareOffers"]!.insertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId(),
    });
    db.collectionMocks["characters"]!.findOne.mockResolvedValue({
      _id: sellerId,
      userId: new ObjectId(),
    });
    db.collectionMocks["notifications"]!.insertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId(),
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/corporations/corp/shares/listings/listing/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: 10,
          pricePerShare: 100,
          offerAsCorporation: true,
        }),
      }),
      { params: Promise.resolve({ id: targetCorpId.toString(), listingId: listingId.toString() }) }
    );

    expect(res.status).toBe(200);
    expect(atomicallyDebitCorpLiquidCapital).toHaveBeenCalledWith(
      db,
      buyerCorpId,
      1000 / ((1 - MARKET_MAKER_SPREAD) * 0.75)
    );
  });

  it("auto-converts personal wallets before escrow debit when forex is on", async () => {
    const userId = new ObjectId();
    const buyerId = new ObjectId();
    const listingId = new ObjectId();
    const corporationId = new ObjectId();
    const sellerId = new ObjectId();

    const { requireBasicAuth } = await import("@/lib/api/requireAuth");
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: userId.toString() },
    } as never);

    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({
      _id: buyerId,
      userId,
      name: "Buyer Test",
      countryId: "JP",
      autoConvertEnabled: true,
    } as never);

    const { isForexEnabled } = await import("@/lib/currency/featureFlag");
    vi.mocked(isForexEnabled).mockResolvedValue(true);

    const { getHomeCurrency, loadCharacterFxRate } = await import("@/lib/currency/characterFunds");
    vi.mocked(getHomeCurrency).mockReturnValue("JPY");
    vi.mocked(loadCharacterFxRate).mockResolvedValue({ ok: true, rate: 150 } as never);

    const { autoConvertForPurchase } = await import("@/lib/currency/autoConvert");
    vi.mocked(autoConvertForPurchase).mockResolvedValue({
      needed: true,
      success: true,
      shortfall: 0,
      convertedAmount: 148_500,
      spreadCharged: 100,
    } as never);

    const { atomicallyDebitCharacterCash } = await import("@/lib/financialTxLog/atomicCashGuard");
    vi.mocked(atomicallyDebitCharacterCash).mockResolvedValue({
      ok: true,
      newBalance: 0,
    } as never);

    db.collectionMocks["shareListings"]!.findOne.mockResolvedValue({
      _id: listingId,
      corporationId,
      sellerCharacterId: sellerId,
      status: "open",
      expiresAt: new Date(Date.now() + 60_000),
      marketPriceAtCreation: 100,
    });
    db.collectionMocks["corporations"]!.findOne.mockResolvedValueOnce({
      _id: corporationId,
      name: "Path Corp",
    }).mockResolvedValueOnce({
      _id: corporationId,
      name: "Target Corp",
      liquidCurrencyCode: "USD",
    });
    db.collectionMocks["shareOffers"]!.findOne.mockResolvedValue(null);
    db.collectionMocks["shareOffers"]!.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
    db.collectionMocks["characters"]!.findOne.mockResolvedValue({ userId: sellerId });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/corporations/corp/shares/listings/listing/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: 10,
          pricePerShare: 100,
          offerAsCorporation: false,
        }),
      }),
      { params: Promise.resolve({ id: corporationId.toString(), listingId: listingId.toString() }) }
    );

    expect(res.status).toBe(200);
    expect(autoConvertForPurchase).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        character: expect.objectContaining({ _id: buyerId }),
        requiredCurrency: "JPY",
        requiredAmount: expect.any(Number),
        turn: 12,
        forexEnabled: true,
      })
    );
    const convertCall = vi.mocked(autoConvertForPurchase).mock.calls[0]!;
    const requiredAmount = (convertCall[1] as { requiredAmount: number }).requiredAmount;
    expect(atomicallyDebitCharacterCash).toHaveBeenCalledWith(
      db,
      buyerId,
      "JPY",
      requiredAmount,
      true
    );
    // autoConvert must run before debit
    const convertOrder = vi.mocked(autoConvertForPurchase).mock.invocationCallOrder[0]!;
    const debitOrder = vi.mocked(atomicallyDebitCharacterCash).mock.invocationCallOrder[0]!;
    expect(convertOrder).toBeLessThan(debitOrder);
  });

  it("returns auto-convert error without debiting when personal consolidation fails", async () => {
    const userId = new ObjectId();
    const buyerId = new ObjectId();
    const listingId = new ObjectId();
    const corporationId = new ObjectId();
    const sellerId = new ObjectId();

    const { requireBasicAuth } = await import("@/lib/api/requireAuth");
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: userId.toString() },
    } as never);

    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({
      _id: buyerId,
      userId,
      name: "Buyer Test",
      countryId: "JP",
      autoConvertEnabled: false,
    } as never);

    const { isForexEnabled } = await import("@/lib/currency/featureFlag");
    vi.mocked(isForexEnabled).mockResolvedValue(true);

    const { getHomeCurrency, loadCharacterFxRate } = await import("@/lib/currency/characterFunds");
    vi.mocked(getHomeCurrency).mockReturnValue("JPY");
    vi.mocked(loadCharacterFxRate).mockResolvedValue({ ok: true, rate: 150 } as never);

    const convertError =
      "Auto-convert is disabled. Visit the currency exchange to convert funds manually.";
    const { autoConvertForPurchase } = await import("@/lib/currency/autoConvert");
    vi.mocked(autoConvertForPurchase).mockResolvedValue({
      needed: true,
      success: false,
      shortfall: 198_000,
      convertedAmount: 0,
      spreadCharged: 0,
      error: convertError,
    } as never);

    const { atomicallyDebitCharacterCash } = await import("@/lib/financialTxLog/atomicCashGuard");
    vi.mocked(atomicallyDebitCharacterCash).mockResolvedValue({
      ok: true,
      newBalance: 0,
    } as never);

    db.collectionMocks["shareListings"]!.findOne.mockResolvedValue({
      _id: listingId,
      corporationId,
      sellerCharacterId: sellerId,
      status: "open",
      expiresAt: new Date(Date.now() + 60_000),
      marketPriceAtCreation: 100,
    });
    db.collectionMocks["corporations"]!.findOne.mockResolvedValueOnce({
      _id: corporationId,
      name: "Path Corp",
    }).mockResolvedValueOnce({
      _id: corporationId,
      name: "Target Corp",
      liquidCurrencyCode: "USD",
    });
    db.collectionMocks["shareOffers"]!.findOne.mockResolvedValue(null);

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/corporations/corp/shares/listings/listing/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: 10,
          pricePerShare: 100,
          offerAsCorporation: false,
        }),
      }),
      { params: Promise.resolve({ id: corporationId.toString(), listingId: listingId.toString() }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: convertError });
    expect(autoConvertForPurchase).toHaveBeenCalled();
    expect(atomicallyDebitCharacterCash).not.toHaveBeenCalled();
    expect(db.collectionMocks["shareOffers"]!.insertOne).not.toHaveBeenCalled();
  });

  it("skips auto-convert and debits home wallet when forex is off", async () => {
    const userId = new ObjectId();
    const buyerId = new ObjectId();
    const listingId = new ObjectId();
    const corporationId = new ObjectId();
    const sellerId = new ObjectId();

    const { requireBasicAuth } = await import("@/lib/api/requireAuth");
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: userId.toString() },
    } as never);

    const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
    vi.mocked(getCharacterByUserId).mockResolvedValue({
      _id: buyerId,
      userId,
      name: "Buyer Test",
      countryId: "US",
      autoConvertEnabled: true,
    } as never);

    // beforeEach already sets isForexEnabled false (world without forex flag).
    const { autoConvertForPurchase } = await import("@/lib/currency/autoConvert");
    const { atomicallyDebitCharacterCash } = await import("@/lib/financialTxLog/atomicCashGuard");
    vi.mocked(atomicallyDebitCharacterCash).mockResolvedValue({
      ok: true,
      newBalance: 9000,
    } as never);

    db.collectionMocks["shareListings"]!.findOne.mockResolvedValue({
      _id: listingId,
      corporationId,
      sellerCharacterId: sellerId,
      status: "open",
      expiresAt: new Date(Date.now() + 60_000),
      marketPriceAtCreation: 100,
    });
    db.collectionMocks["corporations"]!.findOne.mockResolvedValueOnce({
      _id: corporationId,
      name: "Path Corp",
    }).mockResolvedValueOnce({
      _id: corporationId,
      name: "Target Corp",
      liquidCurrencyCode: "USD",
    });
    db.collectionMocks["shareOffers"]!.findOne.mockResolvedValue(null);
    db.collectionMocks["shareOffers"]!.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
    db.collectionMocks["characters"]!.findOne.mockResolvedValue({ userId: sellerId });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/corporations/corp/shares/listings/listing/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: 10,
          pricePerShare: 100,
          offerAsCorporation: false,
        }),
      }),
      { params: Promise.resolve({ id: corporationId.toString(), listingId: listingId.toString() }) }
    );

    expect(res.status).toBe(200);
    expect(autoConvertForPurchase).not.toHaveBeenCalled();
    expect(atomicallyDebitCharacterCash).toHaveBeenCalledWith(db, buyerId, "USD", 1000, false);
  });
});
