/** FX settlement on an owned standalone Mongo, including races and interrupted publication. */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  REAL_MONGO_ENABLED,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { ExchangeRate } from "@/lib/db/types/exchangeRate";
import { planDefenceFunding } from "./rules/defence";
import {
  reserveDefenceSettlement,
  publishDefenceSettlement,
  type FxSettlement,
} from "./settlement";

describe.skipIf(!REAL_MONGO_ENABLED)("standalone FX settlement", () => {
  let owned: IsolatedMongod;
  const receipt: FxSettlement = {
    turn: 50,
    countryId: "UK",
    rate: 0.49,
    macroTarget: 0.5,
    policy: null,
    previousPolicy: null,
  };
  const deltas = { "spreadFeeReserveBalances.USD": -100, "spreadFeeReserveBalances.GBP": 50 };
  const banks = () => owned.db.collection<CentralBank>("centralBanks");
  const quotes = () => owned.db.collection<ExchangeRate>("exchangeRates");
  beforeAll(async () => {
    owned = await startIsolatedMongod("ahd-fx-settlement-");
  }, 60000);
  afterAll(async () => {
    await stopIsolatedMongod(owned);
  }, 20000);
  beforeEach(async () => {
    await banks().deleteMany({});
    await quotes().deleteMany({});
    await banks().insertOne({
      _id: "UK",
      countryId: "UK",
      chairCharacterId: null,
      spreadFeeReserveBalances: { USD: 1000, GBP: 0 },
    } as CentralBank);
    await quotes().insertOne({
      _id: "UK",
      countryId: "UK",
      currencyCode: "GBP",
      baseRate: 0.5,
      rate: 0.5,
      macroTarget: 0.5,
      buyVolume24: 0,
      sellVolume24: 0,
      rateHistory: [],
      updatedAt: new Date(0),
      interventionPolicy: null,
    } as ExchangeRate);
  });
  it("allows one concurrent debit and refuses another after receipt completion", async () => {
    const bank = (await banks().findOne({ _id: "UK" }))!;
    const results = await Promise.allSettled([
      reserveDefenceSettlement(owned.db, bank, receipt, deltas, undefined),
      reserveDefenceSettlement(owned.db, bank, receipt, deltas, undefined),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await publishDefenceSettlement(
      owned.db,
      bank,
      (await quotes().findOne({ _id: "UK" }))!,
      receipt,
      new Date(10)
    );
    await expect(
      reserveDefenceSettlement(owned.db, bank, receipt, deltas, undefined)
    ).rejects.toThrow("reserve balance");
    await expect(
      reserveDefenceSettlement(owned.db, bank, { ...receipt, turn: 49 }, deltas, undefined)
    ).rejects.toThrow("reserve balance");
    const final = (await banks().findOne({ _id: "UK" }))!;
    expect(final.spreadFeeReserveBalances).toEqual({ USD: 900, GBP: 50 });
    expect(final.fxInterventionSettlement).toBeUndefined();
    expect(final.lastFxInterventionTurn).toBe(50);
  });
  it("retains a paid receipt after a publication conflict and safely resumes it", async () => {
    const bank = (await banks().findOne({ _id: "UK" }))!;
    const old = (await quotes().findOne({ _id: "UK" }))!;
    await reserveDefenceSettlement(owned.db, bank, receipt, deltas, undefined);
    await quotes().updateOne({ _id: "UK" }, { $set: { updatedAt: new Date(1) } });
    await expect(
      publishDefenceSettlement(owned.db, bank, old, receipt, new Date(2))
    ).rejects.toThrow("publication changed");
    expect((await banks().findOne({ _id: "UK" }))!.fxInterventionSettlement?.turn).toBe(50);
    await publishDefenceSettlement(
      owned.db,
      bank,
      (await quotes().findOne({ _id: "UK" }))!,
      receipt,
      new Date(3)
    );
    expect((await banks().findOne({ _id: "UK" }))!.spreadFeeReserveBalances?.USD).toBe(900);
    expect((await quotes().findOne({ _id: "UK" }))!.rateHistory).toEqual([
      { turn: 50, rate: 0.49 },
    ]);
  });
  it("fails an insufficient-balance guard without creating a paid receipt", async () => {
    const bank = (await banks().findOne({ _id: "UK" }))!;
    await expect(
      reserveDefenceSettlement(
        owned.db,
        bank,
        receipt,
        { "spreadFeeReserveBalances.USD": -1001 },
        undefined
      )
    ).rejects.toThrow("reserve balance");
    const final = (await banks().findOne({ _id: "UK" }))!;
    expect(final.spreadFeeReserveBalances?.USD).toBe(1000);
    expect(final.fxInterventionSettlement).toBeUndefined();
  });
  it("settles a tiny fully drawn pool without a false insufficient-balance rejection", async () => {
    await banks().updateOne({ _id: "UK" }, { $set: { "spreadFeeReserveBalances.USD": 0.01 } });
    const bank = (await banks().findOne({ _id: "UK" }))!;
    const funding = planDefenceFunding(
      {
        homeCurrency: "GBP",
        rates: { USD: 0.29, GBP: 0.5 },
        balances: { USD: 0.01 },
        forexRevenue: 0,
        reserveBalance: 0,
      },
      "buy",
      1,
      0.5
    );
    await reserveDefenceSettlement(
      owned.db,
      bank,
      receipt,
      Object.fromEntries(
        Object.entries(funding.spreadFeeReserveDeltas).map(([currency, delta]) => [
          `spreadFeeReserveBalances.${currency}`,
          delta,
        ])
      ),
      undefined
    );
    expect((await banks().findOne({ _id: "UK" }))!.spreadFeeReserveBalances?.USD).toBe(0);
  });
});
