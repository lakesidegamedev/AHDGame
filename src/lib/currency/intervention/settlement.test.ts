import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { ExchangeRate } from "@/lib/db/types/exchangeRate";
import {
  publishDefenceSettlement,
  reserveDefenceSettlement,
  type FxSettlement,
} from "./settlement";
let mock: MockDb;
const bank = () => ({ _id: "US", chairCharacterId: null }) as unknown as CentralBank;
const fx = () =>
  ({
    _id: "US",
    rate: 1,
    macroTarget: 1,
    updatedAt: new Date(0),
    rateHistory: [],
    interventionPolicy: null,
  }) as unknown as ExchangeRate;
const receipt: FxSettlement = {
  turn: 50,
  countryId: "US",
  rate: 0.99,
  macroTarget: 1,
  policy: null,
  previousPolicy: null,
};
beforeEach(() => {
  mock = createMockDb();
  mock.collection("centralBanks");
  mock.collection("exchangeRates");
});
describe("recoverable FX reserve settlement", () => {
  it("records the paid publication in the same guarded write as the reserve debit", async () => {
    await reserveDefenceSettlement(
      mock as unknown as Db,
      bank(),
      receipt,
      { "spreadFeeReserveBalances.GBP": -100, "spreadFeeReserveBalances.USD": 120 },
      undefined
    );
    expect(mock.collectionMocks.centralBanks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        "spreadFeeReserveBalances.GBP": { $gte: 100 },
        fxInterventionSettlement: { $exists: false },
        lastFxInterventionTurn: { $not: { $gte: 50 } },
      }),
      expect.objectContaining({ $set: { fxInterventionSettlement: receipt } })
    );
  });
  it("rejects a raced debit before any rate publication", async () => {
    mock.collectionMocks.centralBanks.updateOne.mockResolvedValue({ matchedCount: 0 });
    await expect(
      reserveDefenceSettlement(
        mock as unknown as Db,
        bank(),
        receipt,
        { reserveBalance: -100 },
        undefined
      )
    ).rejects.toThrow("reserve balance");
    expect(mock.collectionMocks.exchangeRates.updateOne).not.toHaveBeenCalled();
  });
  it("retains the paid receipt when publication is interrupted", async () => {
    mock.collectionMocks.exchangeRates.updateOne.mockRejectedValue(new Error("interrupted"));
    await expect(
      publishDefenceSettlement(mock as unknown as Db, bank(), fx(), receipt, new Date())
    ).rejects.toThrow("interrupted");
    expect(mock.collectionMocks.centralBanks.updateOne).not.toHaveBeenCalled();
  });
  it("recovers an already-published rate without charging or publishing twice", async () => {
    const row = { ...fx(), rateHistory: [{ turn: 50, rate: 0.99 }] };
    await publishDefenceSettlement(mock as unknown as Db, bank(), row, receipt, new Date());
    expect(mock.collectionMocks.exchangeRates.updateOne).not.toHaveBeenCalled();
    expect(mock.collectionMocks.centralBanks.updateOne.mock.calls[0][1]).toMatchObject({
      $unset: { fxInterventionSettlement: "" },
      $set: { lastFxInterventionTurn: 50 },
    });
  });
  it("preserves a chair's newer policy during paid recovery", async () => {
    const row = {
      ...fx(),
      interventionPolicy: { floor: 0.9, ceiling: 1.1 } as ExchangeRate["interventionPolicy"],
    };
    await publishDefenceSettlement(mock as unknown as Db, bank(), row, receipt, new Date());
    expect(mock.collectionMocks.exchangeRates.updateOne.mock.calls[0][1].$set).not.toHaveProperty(
      "interventionPolicy"
    );
  });
});
