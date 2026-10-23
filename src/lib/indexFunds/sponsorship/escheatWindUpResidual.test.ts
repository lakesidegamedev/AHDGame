import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/currency/corporationCapital", () => ({
  loadFxRatesRecord: vi.fn().mockResolvedValue({ USD: 1, GBP: 2 }),
  anchorToCorpCapital: (amountAnchor: number, _currency: string, fxRate: number) =>
    amountAnchor * fxRate,
}));
vi.mock("@/lib/centralBank/helpers", () => ({ getBankId: () => "US" }));

import { emitTx } from "@/lib/financialTxLog/emit";
import { escheatWindUpResidual } from "./escheatWindUpResidual";
import type { IndexFund } from "@/lib/db/types/indexFund";

const NOW = new Date("2026-10-24T00:00:00Z");

function makeFund(overrides: Partial<IndexFund> = {}): IndexFund {
  return {
    _id: new ObjectId(),
    name: "ABC Media Funds",
    tickerSymbol: "AMF",
    anchorCurrencyCode: "USD",
    unitSupply: 2_565_704,
    ...overrides,
  } as unknown as IndexFund;
}

describe("escheatWindUpResidual", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("centralBanks").updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("credits the anchor currency's central bank reserve and records the money", async () => {
    const fund = makeFund();

    const local = await escheatWindUpResidual(db as unknown as Db, fund, 50_000, 393, NOW, false);

    expect(local).toBe(50_000);
    expect(db.collection("centralBanks").updateOne).toHaveBeenCalledWith(
      { _id: "US" },
      { $inc: { reserveBalance: 50_000 }, $set: { updatedAt: NOW } }
    );
    expect(db.collection("indexFundTransactions").insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: fund._id,
        kind: "wind_up_escheat",
        turn: 393,
        amountAnchor: 50_000,
      })
    );
    expect(vi.mocked(emitTx)).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        type: "index_fund_redeem",
        subjectType: "government",
        countryId: "US",
        amount: 50_000,
        currencyCode: "USD",
        meta: expect.objectContaining({ kind: "wind_up_escheat", centralBankId: "US" }),
      })
    );
  });

  it("resolves the bank from the anchor currency for a global fund with no country", async () => {
    const fund = makeFund({ anchorCurrencyCode: "GBP" });

    await escheatWindUpResidual(db as unknown as Db, fund, 100, 393, NOW, true);

    // GBP converts to the anchor country's local currency before crediting.
    expect(db.collection("centralBanks").updateOne).toHaveBeenCalledWith(
      { _id: "US" },
      { $inc: { reserveBalance: 200 }, $set: { updatedAt: NOW } }
    );
  });

  it("does nothing when there is no residual to move", async () => {
    const fund = makeFund();

    await expect(
      escheatWindUpResidual(db as unknown as Db, fund, 0, 393, NOW, false)
    ).resolves.toBe(0);

    expect(db.collection("centralBanks").updateOne).not.toHaveBeenCalled();
    expect(db.collection("indexFundTransactions").insertOne).not.toHaveBeenCalled();
  });

  it("leaves the fund transaction unwritten when the reserve account is missing", async () => {
    db.collection("centralBanks").updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(
      escheatWindUpResidual(db as unknown as Db, makeFund(), 500, 393, NOW, false)
    ).resolves.toBe(0);

    expect(db.collection("indexFundTransactions").insertOne).not.toHaveBeenCalled();
  });
});
