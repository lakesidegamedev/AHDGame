import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import {
  computeControlledEquityHaircutInternal,
  controlledEquityCollateralNote,
} from "./controlledEquity";

vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentYear: 2000, currentTurn: 100 }),
}));

vi.mock("@/lib/currency/gdpAnchorRate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/gdpAnchorRate")>()),
  loadWorldEraUnitScale: vi.fn().mockResolvedValue(1),
}));

const TURN = 100;
const RATES = { USD: 1 };

/** 10,000 shares quoted at 100 with 200,000 cash: book is 20 per share. */
function setup(input: {
  ceo: boolean;
  shares: number;
  recentDraw?: boolean;
  boughtShares?: number;
}) {
  const charId = new ObjectId();
  const corp = {
    _id: new ObjectId(),
    countryId: "US",
    liquidCurrencyCode: "USD",
    liquidCapital: 200_000,
    sharePrice: 100,
    totalShares: 10_000,
    earningsHistory: [0, 0, 0],
    ceoId: input.ceo ? charId : new ObjectId(),
    shareholders: [{ characterId: charId, shares: input.shares }],
  };
  const db = createMockDb();
  db.collection("corporations").find().toArray.mockResolvedValue([corp]);
  db.collection("exchangeRates")
    .find()
    .toArray.mockResolvedValue([{ currencyCode: "USD", rate: 1 }]);
  db.collection("locLedger").findOne.mockResolvedValue(input.recentDraw ? { _id: 1 } : null);
  db.collection("shareTradeHistory")
    .find()
    .toArray.mockResolvedValue(
      input.boughtShares ? [{ corporationId: corp._id, shares: input.boughtShares }] : []
    );
  return { db: db as unknown as Db, charId, mock: db };
}

describe("computeControlledEquityHaircutInternal", () => {
  it("counts CEO-held shares at the lower of book and half the quote", async () => {
    const { db, charId } = setup({ ceo: true, shares: 1_000 });
    const result = await computeControlledEquityHaircutInternal(db, { _id: charId }, RATES, TURN);
    // Quoted 100,000; counted at 20 a share = 20,000.
    expect(result.haircutInternal).toBe(80_000);
    expect(result.controlledCompanies).toBe(1);
    expect(controlledEquityCollateralNote(result)).toContain("no more than half their price");
  });

  it("treats a holder above 20% as controlling", async () => {
    const { db, charId } = setup({ ceo: false, shares: 2_500 });
    const result = await computeControlledEquityHaircutInternal(db, { _id: charId }, RATES, TURN);
    expect(result.haircutInternal).toBe(250_000 - 50_000);
  });

  it("leaves non-controlling holdings unchanged", async () => {
    const { db, charId, mock } = setup({ ceo: false, shares: 1_000 });
    const result = await computeControlledEquityHaircutInternal(db, { _id: charId }, RATES, TURN);
    expect(result).toEqual({
      haircutInternal: 0,
      controlledCompanies: 0,
      recentPurchasesExcluded: false,
    });
    expect(controlledEquityCollateralNote(result)).toBeUndefined();
    expect(mock.collectionMocks.locLedger.findOne).not.toHaveBeenCalled();
  });

  it("counts shares bought in the last 24 turns while borrowing at zero", async () => {
    const { db, charId, mock } = setup({
      ceo: true,
      shares: 1_000,
      recentDraw: true,
      boughtShares: 400,
    });
    const result = await computeControlledEquityHaircutInternal(db, { _id: charId }, RATES, TURN);
    // 600 older shares at 20 = 12,000 counted.
    expect(result.haircutInternal).toBe(100_000 - 12_000);
    expect(result.recentPurchasesExcluded).toBe(true);
    expect(controlledEquityCollateralNote(result)).toContain("last 24 turns");
    expect(mock.collectionMocks.locLedger.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ type: "draw", turn: { $gt: TURN - 24 } }),
      expect.anything()
    );
  });

  it("keeps recent purchases at the haircut when the borrower did not draw", async () => {
    const { db, charId, mock } = setup({ ceo: true, shares: 1_000, boughtShares: 400 });
    const result = await computeControlledEquityHaircutInternal(db, { _id: charId }, RATES, TURN);
    expect(result.haircutInternal).toBe(80_000);
    expect(mock.collectionMocks.shareTradeHistory.find).toHaveBeenCalledTimes(1);
  });
});
