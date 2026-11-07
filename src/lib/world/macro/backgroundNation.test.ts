/**
 * Background country national state through the real kernel tick (#5702):
 * politics start from the seeded parties, the fiscal baseline is fixed, the
 * national index fund is created, a US player buys units of it, and the next
 * tick marks the fund so its cash stays equal to what holders are owed.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { IndexFund } from "@/lib/db/types/indexFund";
import type { MacroCountryState } from "./types";
import { buildBackground2027MacroCountry } from "./background2027";
import { processMacroCountryTurn } from "./macroCountryTurn";
import { macroTickBucket, MACRO_TICK_INTERVAL } from "./schedule";
import { BACKGROUND_CONSTITUTIONS } from "./rules/backgroundConstitution";
import { creditFundPosition } from "@/lib/indexFunds/fundQueries";
import {
  quoteCashOnlyRedemption,
  quoteIndexFundSubscription,
} from "@/lib/indexFunds/unitAccounting";
import { INDEX_FUND_INITIAL_NAV } from "@/lib/indexFunds/unitAccounting";
import {
  loadBackgroundBudgetSources,
  backgroundBudgetDocuments,
} from "@/lib/budget/backgroundBudget";
import { calculateQuarterlyIssuanceAmount } from "@/lib/bonds/sovereign";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
const emitTxBulk = vi.fn(async () => undefined);
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: (...args: unknown[]) => emitTxBulk(...(args as [])),
  loadTxThresholds: vi.fn(async () => ({})),
}));

function fixture() {
  const db = createInMemoryDb();
  const country = buildBackground2027MacroCountry("FR");
  // Start before the first tick so the first tick fixes the baselines.
  country.lastMacroTickTurn = null;
  db.seed("macroCountries", [country as unknown as Record<string, unknown>]);
  db.seed("gameState", [{ _id: "current", currentYear: 2027, resetWorldId: "w-test" }]);
  db.seed("federalBudget", [
    {
      _id: "FR",
      countryId: "FR",
      currencyCode: "EUR",
      gdp: 3_200_000_000_000,
      economicFactors: { inflationRate: 2.2 },
    },
  ]);
  db.seed(
    "politicalParties",
    [
      ["Renaissance", "RE", 0.5, -0.5, 30],
      ["National Rally", "RN", 1.5, 3.5, 33],
      ["Socialist Party", "PS", -3, -2, 22],
      ["The Republicans", "LR", 2.5, 2, 15],
    ].map(([name, abbreviation, economicPosition, socialPosition, politicalStrength], i) => ({
      _id: new ObjectId(),
      sequentialId: i + 1,
      countryId: "FR",
      name,
      abbreviation,
      color: "#123456",
      economicPosition,
      socialPosition,
      politicalStrength,
    }))
  );
  const firstTick = macroTickBucket("FR") + 1;
  return { db, firstTick };
}

describe("background country national state on the kernel tick", () => {
  it("starts politics, budget and the national index, and a US player can buy the index", async () => {
    const { db, firstTick } = fixture();
    const d = db as unknown as Db;

    await processMacroCountryTurn(d, firstTick);
    const after = (await db
      .collection("macroCountries")
      .findOne({ _id: "FR" })) as unknown as MacroCountryState;
    const politics = after.nationalPolitics!;
    expect(politics.parties).toHaveLength(4);
    expect(politics.parties.reduce((s, p) => s + p.seats, 0)).toBe(
      BACKGROUND_CONSTITUTIONS.FR.seats
    );
    expect(politics.governmentPartyIds.length).toBeGreaterThan(0);
    expect(politics.head.name.length).toBeGreaterThan(3);
    expect(after.nationalFiscal?.baseline.gdpLocal).toBe(3_200_000_000_000);
    expect(after.nationalIndex?.level).toBe(1);

    // The national index is an ordinary active index fund in the country's currency.
    const fund = (await db
      .collection("indexFunds")
      .findOne({ "nationalIndex.entityId": "FR" })) as unknown as IndexFund;
    expect(fund).toMatchObject({
      slug: "fr_national",
      tickerSymbol: "FRNX",
      kind: "broad",
      scope: "country",
      countryId: "FR",
      anchorCurrencyCode: "EUR",
      status: "active",
      quotedNav: INDEX_FUND_INITIAL_NAV,
    });

    // A US player buys 10 units at NAV: the subscribe route's accounting.
    const buyer = new ObjectId();
    const quote = quoteIndexFundSubscription(fund.quotedNav, 10);
    await creditFundPosition(
      d,
      fund._id,
      "character",
      { characterId: buyer },
      quote.units,
      fund.quotedNav
    );
    await db
      .collection("indexFunds")
      .updateOne(
        { _id: fund._id },
        { $inc: { unitSupply: quote.units, cashAnchor: quote.costAnchor } }
      );

    // Output grows by the next tick: the fund is marked, cash follows NAV.
    await processMacroCountryTurn(d, firstTick + MACRO_TICK_INTERVAL);
    const marked = (await db
      .collection("indexFunds")
      .findOne({ _id: fund._id })) as unknown as IndexFund;
    expect(marked.quotedNav).toBeGreaterThan(INDEX_FUND_INITIAL_NAV);
    expect(marked.cashAnchor).toBeCloseTo(marked.quotedNav * marked.unitSupply, 6);
    const tx = await db.collection("indexFundTransactions").findOne({ fundId: fund._id });
    expect(tx).toMatchObject({ kind: "national_index_mark" });
    expect(emitTxBulk).toHaveBeenCalled();

    // The holder can redeem everything from cash at the new NAV.
    const position = await db.collection("indexFundPositions").findOne({ characterId: buyer });
    expect(position?.units).toBe(10);
    const redemption = quoteCashOnlyRedemption({
      quotedNav: marked.quotedNav,
      requestedUnits: 10,
      cashAnchor: marked.cashAnchor,
    });
    expect(redemption.queuedUnits).toBe(0);
    expect(redemption.paidAmountAnchor).toBeGreaterThan(quote.costAnchor);
  });

  it("derives the national budget from the macro economy, and its deficit issues bonds", async () => {
    const { db, firstTick } = fixture();
    const d = db as unknown as Db;
    await processMacroCountryTurn(d, firstTick);

    const sources = await loadBackgroundBudgetSources(d);
    const fr = sources.get("FR")!;
    expect(fr).toBeDefined();
    const derived = backgroundBudgetDocuments(fr, 90_000_000_000)!;
    expect(derived.gdp).toBeCloseTo(3_200_000_000_000, -3);
    expect(derived.revenue.total).toBeCloseTo(derived.gdp * 0.52, -3);
    // FR opens with a 3% primary deficit plus interest: the scheduled sovereign
    // issue (which US players buy through the ordinary bond market) is non-zero.
    const deficit = derived.spending.total - derived.revenue.total;
    expect(deficit / derived.gdp).toBeGreaterThan(0.03);
    expect(calculateQuarterlyIssuanceAmount(deficit)).toBeGreaterThan(0);
  });

  it("leaves every other macro country alone", async () => {
    const db = createInMemoryDb();
    const country = buildBackground2027MacroCountry("FR");
    country.dataQuality = { ...country.dataQuality, provenance: "estimated-background" };
    country.lastMacroTickTurn = null;
    db.seed("macroCountries", [country as unknown as Record<string, unknown>]);
    db.seed("gameState", [{ _id: "current", currentYear: 2027 }]);
    await processMacroCountryTurn(db as unknown as Db, macroTickBucket("FR") + 1);
    const after = (await db
      .collection("macroCountries")
      .findOne({ _id: "FR" })) as unknown as MacroCountryState;
    expect(after.nationalPolitics).toBeUndefined();
    expect(after.nationalIndex).toBeUndefined();
    expect(await db.collection("indexFunds").countDocuments({})).toBe(0);
  });
});
