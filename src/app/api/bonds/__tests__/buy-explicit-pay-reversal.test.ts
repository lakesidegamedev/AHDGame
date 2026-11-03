/**
 * Regression: an explicit-pay bond buy (pay in one currency for a bond priced in
 * another) converts before it debits. A refused order must never convert, and
 * an order that fails after converting must hand the conversion back.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { Db } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/currency/featureFlag", () => ({
  isForexEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/currency/autoConvert", () => ({
  autoConvertForPurchase: vi.fn().mockResolvedValue({ needed: false, success: true }),
  convertForExplicitPay: vi.fn(),
  reverseExplicitPayConversion: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTx: vi.fn().mockResolvedValue(undefined),
  emitTxBulk: vi.fn().mockResolvedValue(undefined),
  loadTxThresholds: vi.fn().mockResolvedValue({}),
}));

// Load the route graph at collection time. A cold import inside the first test
// can outlast its budget and leave that request running into the next test.
import { POST } from "../[bondId]/buy/route";

function makeCursor(docs: unknown[]) {
  return {
    toArray: vi.fn().mockResolvedValue(docs),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    project: vi.fn().mockReturnThis(),
  };
}

describe("bond buy: explicit-pay conversion is validated first and reversed on failure", () => {
  let db: MockDb;
  const userId = new ObjectId().toString();
  const charId = new ObjectId();
  const bondId = new ObjectId();
  const issuerCorpId = new ObjectId();

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    for (const name of [
      "bonds",
      "corporations",
      "characters",
      "users",
      "gameState",
      "exchangeRates",
      "imperialCharacters",
    ]) {
      db.collection(name);
    }
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);

    const { requireBasicAuth } = await import("@/lib/api/requireAuth");
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,

      user: { userId, username: "tester", isAdmin: false } as any,
    });

    db.collectionMocks["users"]!.findOne.mockResolvedValue({
      _id: new ObjectId(userId),
      activeCharacterId: charId,
      activeCharacterType: "regular",
    });
    db.collectionMocks["bonds"]!.findOne.mockResolvedValue({
      _id: bondId,
      currencyCode: "USD",
      countryId: "US",
      corporationId: issuerCorpId,
      issuerType: "sovereign",
      faceValue: 1000,
      marketPrice: 1.0,
      publicFloat: 10_000,
      holders: [],
      matured: false,
      defaulted: false,
    });
    db.collectionMocks["corporations"]!.findOne.mockResolvedValue({
      _id: issuerCorpId,
      ceoId: new ObjectId(), // not the buyer
    });
    db.collectionMocks["characters"]!.findOne.mockResolvedValue({
      _id: charId,
      userId: new ObjectId(userId),
      name: "Test Buyer",
      countryId: "US",
      currencyBalances: { personal: { USD: 1_000_000 }, savings: {}, campaign: 0 },
    });
    db.collectionMocks["gameState"]!.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 100,
      forexEnabled: true,
    });
    db.collectionMocks["exchangeRates"]!.findOne.mockResolvedValue({
      currencyCode: "USD",
      rate: 1.0,
    });
    db.collectionMocks["exchangeRates"]!.find.mockReturnValue(
      makeCursor([{ currencyCode: "USD", rate: 1.0 }])
    );
  });

  const conversion = {
    characterId: charId,
    collectionName: "characters" as const,
    payCurrency: "GBP" as const,
    requiredCurrency: "USD" as const,
    paid: 700_000,
    received: 1_010_000,
    spread: 7_000,
    turn: 100,
  };

  function buy(units: number) {
    const url = `http://test.local/api/bonds/${bondId.toString()}/buy`;
    return POST(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({ units, payCurrency: "GBP" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ bondId: bondId.toString() }) }
    );
  }

  it("reverses the conversion when the final debit fails", async () => {
    const autoConvert = await import("@/lib/currency/autoConvert");
    vi.mocked(autoConvert.convertForExplicitPay).mockResolvedValue({
      needed: true,
      success: true,
      shortfall: 0,
      convertedAmount: conversion.paid,
      spreadCharged: conversion.spread,
      conversion,
    });
    db.collectionMocks["characters"]!.findOneAndUpdate.mockResolvedValue(null);

    const res = await buy(1000);

    expect(res.status).toBe(400);
    expect(vi.mocked(autoConvert.reverseExplicitPayConversion)).toHaveBeenCalledWith(
      expect.anything(),
      conversion
    );
  });

  it("does not convert at all when the holder cap refuses the order", async () => {
    const autoConvert = await import("@/lib/currency/autoConvert");
    db.collectionMocks["bonds"]!.findOne.mockResolvedValue({
      _id: bondId,
      currencyCode: "USD",
      countryId: "US",
      corporationId: issuerCorpId,
      issuerType: "sovereign",
      faceValue: 1000,
      marketPrice: 1.0,
      publicFloat: 10_000,
      totalIssued: 2_000_000,
      holders: [],
      matured: false,
      defaulted: false,
    });

    const res = await buy(1000);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/position limit/i);
    expect(vi.mocked(autoConvert.convertForExplicitPay)).not.toHaveBeenCalled();
  });
});
