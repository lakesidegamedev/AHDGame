import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { processPlayerIncomeTax } from "./playerIncomeTax";
import { TAXABLE_PLAYER_INCOME_TYPES } from "./rules/incomeTaxTiers";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const now = new Date("2026-11-08T00:00:00Z");
const state = { forexEnabled: true, resetWorldId: "test-world", stockHoldingTaxStartTurn: 0 };
const YEARS = 3;
const TURNS = 48 * YEARS;

/** A taxpayer whose personal wallets are empty: all income sits in savings or was diverted. */
function world() {
  const memory = createInMemoryDb();
  const id = new ObjectId();
  memory.seed("characters", [
    {
      _id: id,
      name: "Empty Wallet",
      countryId: "US",
      homeState: "US_CA",
      incomeTier: "low",
      initialIncomeTier: "low",
      incomeTaxStartTurn: 1,
      cashOnHand: 0,
      currencyBalances: { personal: { USD: 0, EUR: 0 }, savings: { EUR: 50_000 } },
    },
  ]);
  memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      currencyCode: "USD",
      taxRates: { incomeTax: 20, incomeTaxLow: 10, incomeTaxMiddle: 20, incomeTaxHigh: 30 },
      treasuryBalance: 100,
      treasuryCashLocal: 100,
    },
  ]);
  memory.seed("stateBudgets", [
    { _id: "US_CA", countryId: "US", taxRates: { incomeTax: 5 }, balance: 10 },
  ]);
  memory.seed("macroMetrics", [{ _id: "US_CA", economic: { medianIncome: { value: 1000 } } }]);
  memory.seed("exchangeRates", [
    { _id: "USD", currencyCode: "USD", rate: 1 },
    { _id: "EUR", currencyCode: "EUR", rate: 0.9 },
  ]);
  return { memory, db: memory as unknown as Db, id };
}

function income(id: ObjectId, type: string, turn: number, atSource: boolean) {
  return {
    _id: new ObjectId(),
    subjectId: id,
    subjectType: "character",
    type,
    turn,
    amount: 120,
    anchorAmount: 133,
    currencyCode: "EUR",
    ...(atSource ? { meta: { incomeTaxAtSource: true } } : {}),
  };
}

describe("player income tax on income that was never received", () => {
  it("assesses nothing, across years, for every income type that was taxed before it was credited", async () => {
    const { memory, db, id } = world();
    for (let turn = 1; turn <= TURNS; turn++) {
      await db
        .collection("financialTxLog")
        .insertMany(
          TAXABLE_PLAYER_INCOME_TYPES.map((type) => income(id, type, turn, true)) as never[]
        );
      expect(await processPlayerIncomeTax(db, turn, now, state, true)).toEqual({
        assessed: 0,
        pending: 0,
      });
    }
    const assessments = memory.collection("playerIncomeTaxAssessments").docs as Array<{
      status: string;
    }>;
    expect(assessments.filter((row) => row.status === "unpaid")).toHaveLength(0);
    expect(assessments.filter((row) => row.status !== "plan")).toHaveLength(0);
    const character = memory.collection("characters").docs[0] as {
      currencyBalances: { personal: Record<string, number>; savings: Record<string, number> };
    };
    expect(character.currencyBalances.savings.EUR).toBe(50_000);
    expect(character.currencyBalances.personal).toEqual({ USD: 0, EUR: 0 });
    expect(memory.collection("federalBudget").docs[0]!.treasuryBalance).toBe(100);
  });

  it("does assess an income row that no earlier step taxed, so the guard above is meaningful", async () => {
    const { memory, db, id } = world();
    await db.collection("financialTxLog").insertOne(income(id, "corp_dividend", 1, false) as never);
    const result = await processPlayerIncomeTax(db, 1, now, state, true);
    expect(result.assessed).toBeGreaterThan(0);
    const unpaid = memory
      .collection("playerIncomeTaxAssessments")
      .docs.filter((row) => (row as { status: string }).status === "unpaid");
    expect(unpaid.length).toBeGreaterThan(0);
  });
});
