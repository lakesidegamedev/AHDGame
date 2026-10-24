import { describe, expect, it } from "vitest";
import { getWealthBonus } from "@/lib/constants/characterWealth";
import { economyResetPlanDigest } from "./digest";
import { rehomeSovereignBond, trimCouponClaim, isSovereignBond } from "./rules/bonds";
import { countryCorporationSeeds } from "./rules/countryCorporations";
import { primaryLegTotals, witnessDeltas, witnessEntry } from "./rules/ledger";
import {
  centralBankAdjustments,
  centralBankHeldSavings,
  characterEndowment,
  characterMoneyUpdate,
  defenceReleases,
  lineOfCreditOutstanding,
  pensionConversions,
  publicBuyerSweeps,
} from "./rules/money";
import { buildEconomyResetPlan, type EconomyResetSource } from "./rules/plan";

describe("character endowment", () => {
  it("matches the character route: wealth bonus at the campaign base rate in the home currency", () => {
    const patch = characterEndowment(
      { id: "a", countryId: "UK", wealth: "high", referred: false },
      "1991-default",
      { GBP: 0.5 }
    );
    const bonus = getWealthBonus("high", "1991-default");
    expect(patch).toEqual({
      id: "a",
      countryId: "UK",
      currency: "GBP",
      personalLocal: Math.round(bonus * 0.5),
      cashOnHand: bonus,
    });
  });

  it("adds the referral bonus for referred players", () => {
    const plain = characterEndowment(
      { id: "a", countryId: "US", wealth: "low", referred: false },
      "1991-default",
      { USD: 1 }
    );
    const referred = characterEndowment(
      { id: "a", countryId: "US", wealth: "low", referred: true },
      "1991-default",
      { USD: 1 }
    );
    expect(referred.personalLocal).toBeGreaterThan(plain.personalLocal);
  });

  it("clears every private money field but keeps campaign funds", () => {
    const update = characterMoneyUpdate(
      { id: "a", countryId: "US", currency: "USD", personalLocal: 10, cashOnHand: 10 },
      42
    );
    expect(update.$set["currencyBalances.personal"]).toEqual({ USD: 10 });
    expect(update.$set["currencyBalances.savings"]).toEqual({});
    expect(update.$set.lineOfCredit).toEqual({ balances: {}, arrears: {} });
    expect(update.$set.incomeTaxStartTurn).toBe(42);
    expect(update.$set.incomeTaxBatchReceipt).toBeNull();
    expect(Object.keys(update.$set).some((key) => key.includes("campaign"))).toBe(false);
    expect(update.$unset).toHaveProperty("appliedMoneyFlowKeys");
  });
});

describe("central bank write-off", () => {
  it("counts only central-bank-held savings and outstanding credit", () => {
    expect(centralBankHeldSavings({ USD: 5, GBP: 7 }, { GBP: "bankcorp" })).toEqual({ USD: 5 });
    expect(lineOfCreditOutstanding({ balances: { USD: 3 }, arrears: { USD: 1, GBP: 0 } })).toEqual({
      USD: 4,
    });
  });

  it("raises reserves by extinguished deposits, lowers them by forgiven credit, floors at zero", () => {
    const { adjustments, blockers } = centralBankAdjustments({
      banks: [
        { bankId: "US", reserveBalance: 100 },
        { bankId: "UK", reserveBalance: 10 },
      ],
      bankIdByCurrency: { USD: "US", GBP: "UK" },
      centralBankSavings: { USD: 50 },
      locWrittenOff: { USD: 20, GBP: 30 },
    });
    expect(blockers).toEqual([]);
    expect(adjustments).toEqual([
      {
        bankId: "UK",
        currency: "GBP",
        centralBankSavingsDestroyed: 0,
        locWrittenOff: 30,
        reserveBalanceBefore: 10,
        reserveBalanceAfter: 0,
        unabsorbed: 20,
      },
      {
        bankId: "US",
        currency: "USD",
        centralBankSavingsDestroyed: 50,
        locWrittenOff: 20,
        reserveBalanceBefore: 100,
        reserveBalanceAfter: 130,
        unabsorbed: 0,
      },
    ]);
  });

  it("blocks when a currency has no central bank", () => {
    const { blockers } = centralBankAdjustments({
      banks: [],
      bankIdByCurrency: {},
      centralBankSavings: { USD: 1 },
      locWrittenOff: {},
    });
    expect(blockers).toEqual(["missing-central-bank:USD"]);
  });
});

describe("treasury side", () => {
  it("sweeps public buyer cash back to its treasury, converting currencies", () => {
    const { sweeps, blockers } = publicBuyerSweeps({
      wallets: [
        { walletId: "w2", countryId: "UK", currency: "USD", cash: 100 },
        { walletId: "w1", countryId: "US", currency: "USD", cash: 40 },
        { walletId: "w0", countryId: "US", currency: "USD", cash: 0 },
      ],
      budgets: [
        { budgetId: "federal", countryId: "US", currencyCode: "USD" },
        { budgetId: "UK", countryId: "UK", currencyCode: "GBP" },
      ],
      anchorRates: { USD: 1, GBP: 0.5 },
    });
    expect(blockers).toEqual([]);
    expect(sweeps.map((s) => [s.walletId, s.budgetId, s.treasuryCredit])).toEqual([
      ["w1", "federal", 40],
      ["w2", "UK", 50],
    ]);
  });

  it("releases open defence encumbrance, never more than is encumbered", () => {
    expect(
      defenceReleases({
        contracts: [
          { countryId: "US", encumberedAmount: 70 },
          { countryId: "US", encumberedAmount: 50 },
          { countryId: "UK", encumberedAmount: 5 },
        ],
        encumberedByCountry: { US: 100, UK: 10 },
      })
    ).toEqual([
      { countryId: "UK", encumberedBefore: 10, release: 5 },
      { countryId: "US", encumberedBefore: 100, release: 100 },
    ]);
  });

  it("pays a pension's marked fund value in as cash", () => {
    expect(
      pensionConversions([
        { id: "b", assetsAnchor: 5, investedValueAnchor: 0 },
        { id: "a", assetsAnchor: 1, investedValueAnchor: 9 },
      ])
    ).toEqual([{ id: "a", assetsAnchorBefore: 1, investedValueAnchor: 9 }]);
  });
});

describe("sovereign bonds", () => {
  it("moves every private holder's units to the public float", () => {
    const { rehome, blockers } = rehomeSovereignBond({
      id: "b",
      countryId: "US",
      currency: "USD",
      totalIssued: 1000,
      publicFloat: 3,
      holders: [{ units: 2 }, { units: 5 }],
      privateMaturityLegs: 0,
    });
    expect(blockers).toEqual([]);
    expect(rehome).toMatchObject({ publicFloatBefore: 3, publicFloatAfter: 10, unitsMoved: 7 });
  });

  it("blocks in-flight trades, sales and private maturity payouts", () => {
    const { blockers } = rehomeSovereignBond({
      id: "b",
      countryId: "US",
      currency: "USD",
      totalIssued: 1,
      publicFloat: 0,
      holders: [
        { units: 1, bankTreasuryTradeId: "t" },
        { units: 1, saleIntentId: "s" },
      ],
      privateMaturityLegs: 1,
    });
    expect(blockers.sort()).toEqual([
      "in-flight-bank-treasury-trade:b",
      "in-flight-bond-sale:b",
      "open-private-maturity-claim:b",
    ]);
  });

  it("cancels the private share of an open coupon so the treasury keeps it", () => {
    expect(
      trimCouponClaim({
        id: "c",
        currency: "USD",
        amountLocal: 10,
        holders: [
          { kind: "publicFloat", amountLocal: 4 },
          { kind: "character", amountLocal: 6 },
        ],
      })
    ).toEqual({
      id: "c",
      action: "trim",
      amountLocalBefore: 10,
      amountLocalAfter: 4,
      currency: "USD",
    });
    expect(
      trimCouponClaim({
        id: "d",
        currency: "USD",
        amountLocal: 6,
        holders: [{ kind: "fund", amountLocal: 6 }],
      })?.action
    ).toBe("delete");
    expect(
      trimCouponClaim({
        id: "e",
        currency: "USD",
        amountLocal: 6,
        holders: [{ kind: "publicFloat", amountLocal: 6 }],
      })
    ).toBeNull();
  });

  it("treats a bond without an issuer type as corporate", () => {
    expect(isSovereignBond({ issuerType: "sovereign" })).toBe(true);
    expect(isSovereignBond({})).toBe(false);
  });
});

describe("ledger witnesses", () => {
  it("witnesses only the change the reseed did not already witness", () => {
    const deltas = witnessDeltas({
      opening: { "character:a:USD": 100, "corporation:c:USD": 50, "party:p:USD": 9 },
      closing: { "character:a:USD": 10, "corporation:n:USD": 30, "party:p:USD": 9 },
      alreadyWitnessed: primaryLegTotals([
        { legs: [{ account: "corporation:n:USD", anchorAmount: 30, role: "primary" }] },
        { legs: [{ account: "character:a:USD", anchorAmount: 1, role: "contra" }] },
      ]),
      anchorRates: { USD: 2 },
    });
    expect(deltas).toEqual([
      { account: "character:a:USD", currency: "USD", anchor: -90, native: -180 },
      { account: "corporation:c:USD", currency: "USD", anchor: -50, native: -100 },
    ]);
    const entry = witnessEntry(deltas[0], 8, new Date(0));
    expect(entry.legs.map((leg) => leg.account)).toEqual([
      "character:a:USD",
      "sink:economy_reset:USD",
    ]);
    expect(entry.legs.reduce((sum, leg) => sum + leg.anchorAmount, 0)).toBe(0);
  });
});

describe("country-owned corporation seeding", () => {
  it("follows the budget seeders' preset gates", () => {
    const seeds1991 = countryCorporationSeeds({
      preset: "1991-default",
      nationalBudgetCountries: ["US", "RU", "PL"],
      easternBlocEra: false,
    });
    expect(seeds1991.map((s) => s.countryId)).toEqual([
      "BR",
      "CN",
      "DE",
      "IE",
      "JP",
      "NG",
      "RU",
      "UK",
      "US",
    ]);
    const seeds2019 = countryCorporationSeeds({
      preset: "2019-default",
      nationalBudgetCountries: ["RU"],
      easternBlocEra: false,
    });
    expect(seeds2019.find((s) => s.countryId === "RU")?.mode).toBe("modernRuIssuer");
    const seeds1953 = countryCorporationSeeds({
      preset: "1953-default",
      nationalBudgetCountries: ["FR", "DD", "PL"],
      easternBlocEra: true,
    });
    expect(seeds1953.filter((s) => s.commandAware).map((s) => s.countryId)).toEqual([
      "CN",
      "DD",
      "PL",
    ]);
    expect(seeds1953.some((s) => s.countryId === "FR")).toBe(true);
    expect(seeds1953.some((s) => s.countryId === "RU")).toBe(false);
  });
});

function source(overrides: Partial<EconomyResetSource> = {}): EconomyResetSource {
  return {
    worldEpochId: "epoch",
    currentTurn: 7,
    preset: "1991-default",
    approvalReference: "ref",
    config: { commandEconomyEnabled: false, ledgerShadow: true, treasuryCashLedgerEnabled: false },
    wipeCounts: { corporations: 3, bankLoans: 1 },
    partialWipeCounts: { bonds: 1 },
    campaignRates: { USD: 1 },
    anchorRates: { USD: 1 },
    characters: [
      { id: "b", countryId: "US", wealth: "low", referred: false, pendingLocSettlement: false },
      {
        id: "a",
        countryId: "US",
        wealth: "high",
        referred: false,
        savings: { USD: 30 },
        lineOfCredit: { balances: { USD: 5 } },
        pendingLocSettlement: false,
      },
    ],
    imperialCharacterIds: [],
    npps: [],
    sovereignBonds: [],
    corporateBonds: [{ id: "cb", currency: "USD", totalIssued: 1000 }],
    couponClaims: [],
    legacyCouponClaims: [],
    centralBanks: [{ bankId: "US", reserveBalance: 0, pendingLocReserveCredit: false }],
    bankIdByCurrency: { USD: "US" },
    publicBuyerWallets: [],
    budgets: [
      {
        budgetId: "federal",
        countryId: "US",
        currencyCode: "USD",
        storedCurrencyCode: "USD",
        defenseEncumbered: 0,
      },
    ],
    openDefenceContracts: [],
    pensionSchemes: [],
    incomeTax: { open: 2, collected: 0 },
    openMoneyFlowReceipts: 0,
    partialBankMoneyMoves: 0,
    bankLoanCount: 1,
    openingBalances: { "corporation:c:USD": 12.3456789, "character:a:USD": 1 },
    ...overrides,
  };
}

describe("plan builder", () => {
  it("is deterministic regardless of input order", () => {
    const a = buildEconomyResetPlan(source());
    const reordered = source();
    reordered.characters.reverse();
    const b = buildEconomyResetPlan(reordered);
    expect(economyResetPlanDigest(a)).toBe(economyResetPlanDigest(b));
    expect(a.characters.map((c) => c.id)).toEqual(["a", "b"]);
    expect(a.ledgerTurn).toBe(8);
    expect(a.openingBalances["corporation:c:USD"]).toBe(12.345679);
    expect(a.money.destroyedByKind.corporation.USD.anchor).toBeCloseTo(12.345679, 6);
    expect(a.centralBanks[0]).toMatchObject({ centralBankSavingsDestroyed: 30, locWrittenOff: 5 });
    expect(a.blockers).toEqual([]);
  });

  it("reports in-flight money and an unconverted euro treasury as blockers", () => {
    const plan = buildEconomyResetPlan(
      source({
        preset: "2027-default",
        openMoneyFlowReceipts: 1,
        incomeTax: { open: 0, collected: 3 },
        budgets: [
          {
            budgetId: "DE",
            countryId: "DE",
            currencyCode: "DEM",
            storedCurrencyCode: "DEM",
            defenseEncumbered: 0,
          },
        ],
      })
    );
    expect(plan.blockers).toEqual([
      "collected-income-tax-in-flight:3",
      "euro-topology-mismatch:DE:DEM",
      "open-money-flow-receipts:1",
    ]);
  });
});
