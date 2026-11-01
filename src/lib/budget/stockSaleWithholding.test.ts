import type { Character, StateBudget } from "@/lib/db/types";
import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import {
  loadStockWithholdingContexts,
  withholdStockReceipt,
  netStockProceeds,
} from "./stockSaleWithholding";
import { processPlayerIncomeTax } from "./playerIncomeTax";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

it("withholds new-character sales due next turn but leaves earlier exempt credits untouched", async () => {
  const memory = createInMemoryDb();
  const db = memory as unknown as Db;
  const id = new ObjectId();
  memory.seed("gameState", [{ _id: "current", forexEnabled: true, stockHoldingTaxStartTurn: 0 }]);
  memory.seed("characters", [
    { _id: id, countryId: "US", homeState: "US_CA", incomeTier: "low", incomeTaxStartTurn: 2 },
  ]);
  memory.seed("federalBudget", [
    { _id: "federal", countryId: "US", currencyCode: "USD", taxRates: { incomeTax: 20 } },
  ]);
  memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  const context = (
    await loadStockWithholdingContexts(db, [{ id, collection: "characters" }], 1)
  ).get("characters:" + id.toHexString());
  const receipt = { version: 1 as const, assessmentTurn: 2, incomeAmount: 0, capitalAmount: 100 };
  expect(withholdStockReceipt(receipt, context).withholding?.walletAmount).toBe(20);
  expect(
    withholdStockReceipt({ ...receipt, assessmentTurn: 1 }, context).withholding
  ).toBeUndefined();
});

describe.each(["characters", "imperialCharacters"] as const)(
  "%s sale withholding across countries",
  (collection) => {
    it.each([
      ["US", "USD", 1],
      ["UK", "GBP", 0.75],
      ["JP", "JPY", 118.6],
    ] as const)(
      "uses %s laws, currency and treasury without charging cash again",
      async (countryId, currency, fx) => {
        const memory = createInMemoryDb();
        const db = memory as unknown as Db;
        const id = new ObjectId();
        const stateId = countryId + "_test";
        const state = { forexEnabled: true, stockHoldingTaxStartTurn: 0, resetWorldId: "test" };
        memory.seed("gameState", [{ _id: "current", ...state }]);
        memory.seed(collection, [
          {
            _id: id,
            name: "Test taxpayer",
            countryId,
            homeState: stateId,
            incomeTaxStartTurn: 0,
            incomeTier: "high",
            currencyBalances: { personal: { [currency]: 0 } },
          },
        ]);
        memory.seed("federalBudget", [
          {
            _id: getNationalBudgetId(countryId),
            countryId,
            currencyCode: currency,
            taxRates: { incomeTax: 30, capitalGainsTaxHigh: 20 },
            treasuryBalance: 0,
            treasuryCashLocal: 0,
          },
        ]);
        memory.seed("stateBudgets", [
          {
            _id: stateId,
            countryId,
            taxRates: { incomeTax: 5, capitalGainsTaxHigh: 5 },
            balance: 0,
          },
        ]);
        memory.seed("exchangeRates", [{ _id: currency, currencyCode: currency, rate: fx }]);
        memory.seed("macroMetrics", [
          { _id: stateId, economic: { medianIncome: { value: 1000 } } },
        ]);
        const contexts = await loadStockWithholdingContexts(db, [{ id, collection }], 1);
        const receipt = withholdStockReceipt(
          {
            id: "sale",
            version: 1,
            saleTurn: 1,
            assessmentTurn: 2,
            amount: 10000,
            anchorAmount: 10000 / fx,
            currencyCode: currency,
            incomeAmount: 0,
            capitalAmount: 1000,
          },
          contexts.get(collection + ":" + id.toHexString())
        );
        expect(netStockProceeds(10000, receipt)).toBe(9750);
        await db
          .collection<Character>(collection)
          .updateOne({ _id: id }, { $push: { pendingStockTaxReceipts: receipt } });
        await processPlayerIncomeTax(db, 2, new Date("2026-10-27"), state, true, true);
        await processPlayerIncomeTax(db, 3, new Date("2026-10-27"), state, true, true);
        expect(
          (await db.collection<Character>(collection).findOne({ _id: id }))!.currencyBalances!
            .personal[currency]
        ).toBe(0);
        expect((await db.collection("federalBudget").findOne({ countryId }))!.treasuryBalance).toBe(
          200
        );
        expect(
          (await db.collection<StateBudget>("stateBudgets").findOne({ _id: stateId }))!.balance
        ).toBe(50);
        expect(
          await db
            .collection("playerIncomeTaxAssessments")
            .countDocuments({ status: "paid", withheldAtSource: true })
        ).toBe(1);
      }
    );
  }
);

it("serializes context reads on a transaction session while retaining parallel standalone reads", async () => {
  const memory = createInMemoryDb();
  const id = new ObjectId();
  memory.seed("gameState", [{ _id: "current", forexEnabled: true, stockHoldingTaxStartTurn: 0 }]);
  memory.seed("characters", [
    { _id: id, countryId: "US", homeState: "CA", incomeTier: "middle", incomeTaxStartTurn: 0 },
  ]);
  memory.seed("federalBudget", [
    { _id: "federal", countryId: "US", currencyCode: "USD", taxRates: { incomeTax: 20 } },
  ]);
  memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  let active = 0,
    peak = 0;
  for (const name of [
    "characters",
    "imperialCharacters",
    "federalBudget",
    "stateBudgets",
    "exchangeRates",
  ]) {
    const collection = memory.collection(name);
    const find = collection.find.bind(collection);
    vi.spyOn(collection, "find").mockImplementation((...args) => {
      const cursor = find(...args);
      const read = cursor.toArray.bind(cursor);
      cursor.toArray = async () => {
        active += 1;
        peak = Math.max(active, peak);
        try {
          await Promise.resolve();
          return await read();
        } finally {
          active -= 1;
        }
      };
      return cursor;
    });
  }
  const targets = [{ id, collection: "characters" as const }];
  expect(
    (
      await loadStockWithholdingContexts(memory as unknown as Db, targets, 2, {
        income: true,
        session: {} as never,
      })
    ).size
  ).toBe(1);
  expect(peak).toBe(1);
  peak = 0;
  expect(
    (await loadStockWithholdingContexts(memory as unknown as Db, targets, 2, { income: true })).size
  ).toBe(1);
  expect(peak).toBe(5);
});
