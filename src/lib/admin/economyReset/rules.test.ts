import { describe, expect, it } from "vitest";
import { getWealthBonus } from "@/lib/constants/characterWealth";
import { economyResetPlanDigest } from "./digest";
import {
  isSovereignBond,
  rehomeSovereignBond,
  trimCouponClaim,
  trimMaturityClaim,
  type MaturityClaimSource,
} from "./rules/bonds";
import { classifyPartialMoneyMove, type PartialMoneyMoveSource } from "./rules/moneyMoves";
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
    });
    expect(blockers).toEqual([]);
    expect(rehome).toMatchObject({ publicFloatBefore: 3, publicFloatAfter: 10, unitsMoved: 7 });
  });

  it("blocks in-flight trades and sales", () => {
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
    });
    expect(blockers.sort()).toEqual(["in-flight-bank-treasury-trade:b", "in-flight-bond-sale:b"]);
  });

  const quote = (overrides: Partial<MaturityClaimSource> = {}): MaturityClaimSource => ({
    currency: "PLZ",
    treasuryLocalPerAnchor: 10,
    amountLocal: 1000 + 20 * 10 + 50 + 300,
    escrowLocal: 0,
    legs: [
      { collection: "bondMarketPools", amount: 1000, currencyCode: "PLZ", localPerAnchor: 10 },
      { collection: "indexFunds", amount: 20, currencyCode: "USD", localPerAnchor: 1 },
      { collection: "corporations", amount: 50, currencyCode: "PLZ", localPerAnchor: 10 },
      { collection: "centralBanks", amount: 300, currencyCode: "PLZ", localPerAnchor: 10 },
    ],
    payoutInFlight: false,
    ...overrides,
  });

  it("cancels the private share of an unpaid maturity quote and keeps the treasury legs", () => {
    expect(trimMaturityClaim("m", quote())).toEqual({
      bondId: "m",
      currency: "PLZ",
      legsRemoved: 2,
      amountLocalBefore: 1550,
      amountLocalAfter: 1300,
      privateAmountLocal: 250,
      escrowLocal: 0,
      escrowSurplusLocal: 0,
    });
  });

  it("keeps funded escrow on the bond when the quote shrinks below it", () => {
    expect(trimMaturityClaim("m", quote({ escrowLocal: 1500 }))?.escrowSurplusLocal).toBe(200);
  });

  it("leaves a maturity quote alone while its payout journal runs, and never moves its units", () => {
    expect(trimMaturityClaim("m", quote({ payoutInFlight: true }))).toBeNull();
    const { rehome, blockers } = rehomeSovereignBond({
      id: "m",
      countryId: "PL",
      currency: "PLZ",
      totalIssued: 10,
      publicFloat: 0,
      holders: [{ units: 4 }],
      maturityClaim: quote(),
    });
    expect(blockers).toEqual([]);
    expect(rehome).toMatchObject({ publicFloatAfter: 0, unitsMoved: 0, holdersRemoved: 1 });
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
    reseedCounts: { commodityPrices: 27, exchangeRates: 23 },
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
    partialMoneyMoves: [],
    wipedCollections: ["corporations", "indexFunds"],
    bankLoanCount: 1,
    openingBalances: { "corporation:c:USD": 12.3456789, "character:a:USD": 1 },
    ...overrides,
  };
}

describe("partial bank money moves", () => {
  const wiped = new Set(["corporations", "indexFunds"]);
  const leg = (overrides: Partial<PartialMoneyMoveSource["pendingLegs"][number]>) => ({
    collection: "characters",
    targetId: "x",
    path: "currencyBalances.campaign",
    amount: 10,
    currency: "USD",
    targetExists: true,
    ...overrides,
  });

  it("voids a refund whose campaign and character are gone", () => {
    const result = classifyPartialMoneyMove(
      {
        id: "political-media-refund:a",
        kind: "political-media-refund",
        turn: 148,
        pendingLegs: [
          leg({ collection: "campaigns", path: "funds", targetExists: false }),
          leg({ targetExists: false }),
        ],
      },
      wiped
    );
    expect(result.blocker).toBeNull();
    expect(result.voided?.pendingLegs.map((l) => l.reason)).toEqual(["missing", "missing"]);
  });

  it("voids legs owed to wiped collections and private wallets", () => {
    const result = classifyPartialMoneyMove(
      {
        id: "move",
        kind: "loan_service",
        turn: 1,
        pendingLegs: [
          leg({ collection: "corporations", path: "liquidCapital" }),
          leg({ path: "currencyBalances.personal.USD" }),
          leg({ collection: "npps", path: "nppInvestmentCashAnchor", targetExists: false }),
        ],
      },
      wiped
    );
    expect(result.blocker).toBeNull();
    expect(result.voided?.pendingLegs.length).toBe(3);
  });

  it("blocks a move still owed to a kept account, with the reason", () => {
    const result = classifyPartialMoneyMove(
      {
        id: "dues",
        kind: "organization_dues",
        turn: 1,
        pendingLegs: [
          leg({ collection: "corporations", path: "liquidCapital" }),
          leg({ collection: "organizationFunds", targetId: "org", path: "balanceLocal" }),
        ],
      },
      wiped
    );
    expect(result.voided).toBeNull();
    expect(result.blocker).toBe(
      "kept-account-money-move:dues: still owes kept accounts organizationFunds:org.balanceLocal; run one turn or reconcile this move, then re-run the census"
    );
    expect(
      classifyPartialMoneyMove({ id: "c", kind: "x", turn: 1, pendingLegs: [leg({})] }, wiped)
        .blocker
    ).toMatch(/^kept-account-money-move:c: .*characters:x\.currencyBalances\.campaign/);
  });

  it("blocks a sovereign maturity payout even when only private legs are pending", () => {
    const result = classifyPartialMoneyMove(
      {
        id: "sovereign-maturity:b:276:payout",
        kind: "sovereign_maturity_payout",
        turn: 276,
        pendingLegs: [
          leg({ collection: "npps", path: "nppInvestmentCashAnchor", targetExists: false }),
        ],
      },
      wiped
    );
    expect(result.blocker).toMatch(/^sovereign-payout-in-flight:sovereign-maturity:b:276:payout: /);
  });
});

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

  it("reports maturity cancellations and voided moves in the money census", () => {
    const plan = buildEconomyResetPlan(
      source({
        sovereignBonds: [
          {
            id: "m",
            countryId: "PL",
            currency: "PLZ",
            totalIssued: 10,
            publicFloat: 0,
            holders: [{ units: 4 }],
            maturityClaim: {
              currency: "PLZ",
              treasuryLocalPerAnchor: 10,
              amountLocal: 300,
              escrowLocal: 0,
              legs: [
                {
                  collection: "bondMarketPools",
                  amount: 100,
                  currencyCode: "PLZ",
                  localPerAnchor: 10,
                },
                { collection: "npps", amount: 20, currencyCode: "USD", localPerAnchor: 1 },
              ],
              payoutInFlight: false,
            },
          },
        ],
        partialMoneyMoves: [
          {
            id: "political-media-refund:a",
            kind: "political-media-refund",
            turn: 1,
            pendingLegs: [
              {
                collection: "campaigns",
                targetId: "c",
                path: "funds",
                amount: 7,
                currency: "USD",
                targetExists: false,
              },
            ],
          },
        ],
      })
    );
    expect(plan.blockers).toEqual([]);
    expect(plan.maturityClaims).toMatchObject([{ bondId: "m", amountLocalAfter: 100 }]);
    expect(plan.money.maturityClaimsCancelledByCurrency).toEqual({ PLZ: 200 });
    expect(plan.voidedMoneyMoves.map((m) => m.id)).toEqual(["political-media-refund:a"]);
    expect(plan.money.voidedInFlightByCurrency).toEqual({ USD: 7 });
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
