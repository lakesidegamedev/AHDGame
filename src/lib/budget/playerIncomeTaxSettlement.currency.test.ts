import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { settlePlayerIncomeTaxAssessments } from "./playerIncomeTaxSettlement";
import { planTaxFunding } from "./rules/playerTaxFunding";

const now = new Date("2026-10-24T00:00:00Z");

function fixture(overrides: Array<Record<string, unknown>>, rates = { USD: 1, GBP: 0.5 }) {
  const memory = createInMemoryDb();
  const characterId = new ObjectId();
  memory.seed("characters", [
    {
      _id: characterId,
      name: "Test Taxpayer",
      currencyBalances: { personal: { USD: 100, GBP: 1000 } },
    },
  ]);
  memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      currencyCode: "USD",
      treasuryBalance: 0,
      treasuryCashLocal: 0,
    },
  ]);
  memory.seed("stateBudgets", [{ _id: "US_CA", countryId: "US", balance: 0 }]);
  memory.seed(
    "exchangeRates",
    Object.entries(rates).map(([currencyCode, rate]) => ({ _id: currencyCode, currencyCode, rate }))
  );
  memory.seed(
    "playerIncomeTaxAssessments",
    overrides.map((row, index) => ({
      _id: "a" + (index + 1),
      characterId,
      ownerCollection: "characters",
      turn: 1,
      worldId: "w1",
      name: "Test Taxpayer",
      tier: "low",
      currency: "USD",
      sourcePath: "currencyBalances.personal.USD",
      sourceFx: 1,
      walletFx: 1,
      countryId: "US",
      nationalBudgetId: "federal",
      nationalCurrency: "USD",
      nationalFx: 1,
      stateId: "US_CA",
      regionalCurrency: "USD",
      regionalFx: 1,
      gross: 1000,
      federal: 150,
      regional: 50,
      net: 800,
      status: "unpaid",
      createdAt: now,
      ...row,
    }))
  );
  return { db: memory as unknown as Db, characterId };
}

describe("planTaxFunding", () => {
  it("uses the largest anchor balance first, dividing by local units per anchor", () => {
    const plan = planTaxFunding({
      owed: 10,
      sourceFx: 1,
      currency: "USD",
      primaryAvailable: 0,
      available: { JPY: 100, GBP: 20 },
      rates: { JPY: 100, GBP: 0.5 },
    });
    expect(plan.converted).toEqual([{ currency: "GBP", amount: 5, anchorAmount: 10 }]);
  });
  it("keeps a fully funded assessed wallet on today's single debit", () => {
    expect(
      planTaxFunding({
        owed: 200,
        sourceFx: 1,
        currency: "USD",
        primaryAvailable: 500,
        available: { USD: 500, GBP: 100 },
        rates: { USD: 1, GBP: 0.5 },
      })
    ).toEqual({ primary: 200, converted: [], rounding: null, funded: true });
  });
  it("buys the shortfall at the assessed quote direction", () => {
    const plan = planTaxFunding({
      owed: 200,
      sourceFx: 1,
      currency: "USD",
      primaryAvailable: 100,
      available: { USD: 100, GBP: 1000 },
      rates: { USD: 1, GBP: 0.5 },
    });
    expect(plan.converted).toEqual([{ currency: "GBP", amount: 50, anchorAmount: 100 }]);
    expect(plan.rounding).toBeNull();
  });
  it("rounds a converted debit up to whole minor units and retires the excess", () => {
    const plan = planTaxFunding({
      owed: 200,
      sourceFx: 1,
      currency: "USD",
      primaryAvailable: 100,
      available: { GBP: 1000 },
      rates: { USD: 1, GBP: 0.33333 },
    });
    expect(plan.converted[0].amount).toBe(33.34);
    expect(plan.rounding?.currency).toBe("GBP");
  });
  it("takes nothing when the shortfall cannot be closed", () => {
    expect(
      planTaxFunding({
        owed: 200,
        sourceFx: 1,
        currency: "USD",
        primaryAvailable: 100,
        available: { GBP: 10 },
        rates: { USD: 1, GBP: 0.33333 },
      })
    ).toEqual({ primary: 0, converted: [], rounding: null, funded: false });
  });
});

describe("settlePlayerIncomeTaxAssessments funding", () => {
  it("collects only the outstanding remainder of a partially paid assessment", async () => {
    const { db } = fixture([{ collectedFederal: 75, collectedRegional: 25 }]);
    await settlePlayerIncomeTaxAssessments(db, 2, now, "w1", true, true, 60, true);
    const a = await db.collection("playerIncomeTaxAssessments").findOne({ _id: "a1" });
    expect(a).toMatchObject({ status: "paid", collectedFederal: 150, collectedRegional: 50 });
    const character = await db.collection("characters").findOne({});
    expect(character?.currencyBalances.personal).toMatchObject({ USD: 0, GBP: 1000 });
    expect((await db.collection("federalBudget").findOne({}))?.treasuryBalance).toBe(75);
  });
  it("converts against the current wallet quote and balances the ledger after rates move", async () => {
    const { db } = fixture([{ sourceFx: 2, walletFx: 4 }]);
    await settlePlayerIncomeTaxAssessments(db, 2, now, "w1", true, true, 60, true);
    const character = await db.collection("characters").findOne({});
    expect(character?.currencyBalances.personal).toMatchObject({ USD: 0, GBP: 962.5 });
    const entries = await db.collection("ledgerEntries").find({}).toArray();
    for (const entry of entries)
      expect(
        Math.abs(
          entry.legs.reduce((n: number, leg: { anchorAmount: number }) => n + leg.anchorAmount, 0)
        )
      ).toBeLessThan(1e-6);
  });
  it("collects a short assessed wallet from another wallet and credits the same tax", async () => {
    const { db } = fixture([{}]);
    await settlePlayerIncomeTaxAssessments(db, 2, now, "w1", true, true, 60, true);
    expect((await db.collection("playerIncomeTaxAssessments").findOne({ _id: "a1" }))?.status).toBe(
      "paid"
    );
    const character = await db.collection("characters").findOne({});
    expect(character?.currencyBalances.personal.USD).toBe(0);
    expect(character?.currencyBalances.personal.GBP).toBe(950);
    expect((await db.collection("federalBudget").findOne({}))?.treasuryBalance).toBe(150);
    expect((await db.collection("stateBudgets").findOne({}))?.balance).toBe(50);
    const receipts = await db
      .collection("financialTxLog")
      .find({ type: "player_income_tax" })
      .toArray();
    expect(receipts.map((row) => row.amount)).toEqual([-200]);
    const entries = await db.collection("ledgerEntries").find({}).toArray();
    for (const entry of entries) {
      const residual = (entry.legs as Array<{ anchorAmount: number }>).reduce(
        (sum, leg) => sum + leg.anchorAmount,
        0
      );
      expect(Math.abs(residual)).toBeLessThan(0.01);
    }
    const accounts = entries.flatMap((entry) =>
      (entry.legs as Array<{ account: string }>).map((leg) => leg.account)
    );
    expect(accounts.some((account) => account.endsWith(":GBP"))).toBe(true);
  });
  it("records rounding excess as a named sink", async () => {
    const { db } = fixture([{}], { USD: 1, GBP: 0.33333 });
    await settlePlayerIncomeTaxAssessments(db, 2, now, "w1", true, true, 60, true);
    expect((await db.collection("characters").findOne({}))?.currencyBalances.personal.GBP).toBe(
      966.66
    );
    const entries = await db.collection("ledgerEntries").find({}).toArray();
    const accounts = entries.flatMap((entry) =>
      (entry.legs as Array<{ account: string }>).map((leg) => leg.account)
    );
    expect(accounts.some((account) => account === "sink:income_tax_rounding:GBP")).toBe(true);
  });
  it("preserves partial collection when other wallets cannot close the liability", async () => {
    const { db } = fixture([{}]);
    await db
      .collection("characters")
      .updateOne({}, { $set: { "currencyBalances.personal.GBP": 0 } });
    await settlePlayerIncomeTaxAssessments(db, 2, now, "w1", true, false, 60, true);
    expect((await db.collection("playerIncomeTaxAssessments").findOne({ _id: "a1" }))?.status).toBe(
      "unpaid"
    );
    expect((await db.collection("characters").findOne({}))?.currencyBalances.personal.USD).toBe(0);
    const assessment = await db.collection("playerIncomeTaxAssessments").findOne({ _id: "a1" });
    expect(assessment?.collectedFederal).toBe(75);
    expect(assessment?.collectedRegional).toBe(25);
    expect((await db.collection("federalBudget").findOne({}))?.treasuryBalance).toBe(75);
  });
  it("does not spend one payer's converted balance twice", async () => {
    const { db } = fixture([{}, { turn: 2, _id: "b2" }]);
    await db
      .collection("characters")
      .updateOne({}, { $set: { "currencyBalances.personal.GBP": 60 } });
    await settlePlayerIncomeTaxAssessments(db, 2, now, "w1", true, false, 60, true);
    expect((await db.collection("playerIncomeTaxAssessments").findOne({ _id: "a1" }))?.status).toBe(
      "paid"
    );
    expect((await db.collection("playerIncomeTaxAssessments").findOne({ _id: "b2" }))?.status).toBe(
      "unpaid"
    );
    expect((await db.collection("characters").findOne({}))?.currencyBalances.personal.GBP).toBe(10);
  });
});
