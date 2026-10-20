import { describe, expect, it } from "vitest";
import type { ProductionPlan } from "./production";
import { producerTrades } from "./rules";
import { runProducerShadowDetailed } from "./shadowRules";
import {
  checkCohort,
  checkConservation,
  closeShadowTurn,
  plantEconomyShare,
  resolveShadowContinuity,
  shadowBook,
  SHADOW_STATE_SCHEMA_VERSION,
  type ShadowCarryState,
} from "./shadowCarryRules";

const carried = (changes: Partial<ShadowCarryState> = {}): ShadowCarryState => ({
  runId: "w:r10",
  worldEpoch: "w",
  turn: 10,
  predecessorTurn: 9,
  schemaVersion: SHADOW_STATE_SCHEMA_VERSION,
  codeSha: null,
  accounts: {},
  plants: {},
  payables: [],
  references: {},
  valueAddedByCountry: {},
  ...changes,
});

describe("shadow continuity", () => {
  it("continues from the previous turn in the same run", () => {
    const c = resolveShadowContinuity(carried(), { worldEpoch: "w", turn: 11 });
    expect(c).toMatchObject({ mode: "continue", runId: "w:r10" });
  });

  it("starts a labelled new run on a gap, a new world or an old schema", () => {
    expect(resolveShadowContinuity(null, { worldEpoch: "w", turn: 11 })).toMatchObject({
      mode: "new",
      runId: "w:r11",
      reason: "no predecessor",
    });
    expect(resolveShadowContinuity(carried(), { worldEpoch: "w", turn: 12 })).toMatchObject({
      mode: "new",
    });
    expect(resolveShadowContinuity(carried(), { worldEpoch: "v", turn: 11 })).toMatchObject({
      mode: "new",
      reason: "world changed",
    });
    expect(
      resolveShadowContinuity(carried({ schemaVersion: 0 }), { worldEpoch: "w", turn: 11 })
    ).toMatchObject({ mode: "new" });
  });

  it("a retry of the same turn reads the same predecessor", () => {
    const p = carried();
    const a = resolveShadowContinuity(p, { worldEpoch: "w", turn: 11 });
    const b = resolveShadowContinuity(p, { worldEpoch: "w", turn: 11 });
    expect(a).toEqual(b);
  });
});

describe("plant economy share", () => {
  it("is value added over GDP, clamped to [0, 1]", () => {
    expect(plantEconomyShare(2, 100)).toBeCloseTo(0.02);
    expect(plantEconomyShare(200, 100)).toBe(1);
    expect(plantEconomyShare(-5, 100)).toBe(0);
    expect(plantEconomyShare(5, 0)).toBe(0);
  });
});

describe("country-wide freight", () => {
  it("moves freight from a state book to its country book and leaves others alone", () => {
    expect(shadowBook("state:ca", "freight", "us")).toBe("country:us");
    expect(shadowBook("state:ca", "healthcare_services", "us")).toBe("state:ca");
    expect(shadowBook("world", "freight", "us")).toBe("world");
  });
});

describe("cohort check", () => {
  it("passes when closing equals opening plus income minus settled spend", () => {
    const c = checkCohort("h", {
      opening: 100,
      wagesPaid: 20,
      distributionsPaid: 5,
      operatingIncome: 3,
      settledSpend: 90,
      closing: 38,
    });
    expect(c.pass).toBe(true);
    expect(c.savingsDrawdown).toBe(62);
  });

  it("fails on a residual above 0.1% and flags zero activity", () => {
    expect(
      checkCohort("h", {
        opening: 100,
        wagesPaid: 0,
        distributionsPaid: 0,
        operatingIncome: 0,
        settledSpend: 0,
        closing: 101,
      })
    ).toMatchObject({ pass: false, zeroActivity: true });
  });
});

// One plant selling financial services to one household wallet and one public buyer.
const plan: ProductionPlan = {
  id: "p",
  accountId: "corp",
  capacityUnits: 100,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 20,
  otherOperatingCost: 10,
  labourRecipientAccountId: "hh",
  operatingRecipientAccountId: "payee",
  inputs: [],
  outputs: [
    {
      commodity: "financial_services",
      unitsPerOutput: 1,
      book: "world",
      policy: { kind: "manual", unitPrice: 3 },
      referenceUnitPrice: 3,
      storable: false,
    },
  ],
  inputStock: [],
  outputStock: [],
};

describe("closed shadow turn", () => {
  it("balances households, public funding and total cash end to end", () => {
    const opening = [
      { id: "corp", cash: 100 },
      { id: "hh", cash: 60 },
      { id: "public:us", cash: 30 },
      { id: "payee", cash: 0 },
    ];
    const { result } = runProducerShadowDetailed({
      turn: 1,
      skipped: 0,
      accounts: opening,
      producers: [{ plan, sectorType: "financial", legacy: null }],
      households: [
        {
          accountId: "hh",
          spendFraction: 0.9,
          products: [
            { commodity: "financial_services", book: "world", maximumUnitPrice: 3, weight: 1 },
          ],
        },
      ],
      publicOrders: [
        {
          id: "public:us:fin",
          accountId: "public:us",
          commodity: "financial_services",
          book: "world",
          units: 10,
          maximumUnitPrice: 3,
          maximumSpend: 30,
        },
      ],
    });
    const profit = result.producers[0].profit;
    const close = closeShadowTurn({
      closingAccounts: result.accounts,
      roles: [
        { id: "corp", kind: "company", countryId: "us" },
        { id: "hh", kind: "household", countryId: "us" },
        { id: "public:us", kind: "public", countryId: "us" },
        { id: "payee", kind: "operatingPayee", countryId: "us" },
      ],
      profitByCompany: new Map([["corp", profit]]),
      ownerKindByCompany: new Map([["corp", "ai"]]),
      householdFor: () => "hh",
    });
    expect(profit).toBeGreaterThan(0);
    expect(close.distributed).toBeCloseTo(profit * 0.6);
    expect(close.operatingSwept).toBeCloseTo(10);
    expect(close.accounts).not.toHaveProperty("public:us");
    expect(close.accounts).not.toHaveProperty("payee");

    let spend = 0;
    let publicSpend = 0;
    for (const t of producerTrades(result.tradeReceipt))
      if (t.buyerAccountId === "hh") spend += t.units * t.unitPrice;
      else if (t.buyerAccountId === "public:us") publicSpend += t.units * t.unitPrice;
    // Households spend only what they hold after wages, never their own sales proceeds.
    expect(spend).toBeLessThanOrEqual(0.9 * (60 + 20) + 1e-9);
    const hh = checkCohort("hh", {
      opening: 60,
      wagesPaid: result.producers[0].labourPaid,
      distributionsPaid: close.distributed,
      operatingIncome: close.operatingSwept,
      settledSpend: spend,
      closing: close.accounts.hh,
    });
    expect(hh.pass).toBe(true);

    const conservation = checkConservation({
      openingTotal: 160,
      closingTotal: Object.values(close.accounts).reduce((s, v) => s + v, 0),
      sources: { publicFunding: 30 },
      sinks: { publicReturned: close.publicReturned, stateRemitted: close.stateRemitted },
    });
    expect(publicSpend + close.publicReturned).toBeCloseTo(30);
    expect(conservation.pass).toBe(true);
  });

  it("player companies keep profit and state companies remit out of the plant economy", () => {
    const base = {
      closingAccounts: [
        { id: "a", cash: 50 },
        { id: "b", cash: 50 },
        { id: "hh", cash: 0 },
      ],
      roles: [
        { id: "a", kind: "company" as const, countryId: "us" },
        { id: "b", kind: "company" as const, countryId: "us" },
        { id: "hh", kind: "household" as const, countryId: "us" },
      ],
      profitByCompany: new Map([
        ["a", 10],
        ["b", 10],
      ]),
      householdFor: () => "hh",
    };
    const close = closeShadowTurn({
      ...base,
      ownerKindByCompany: new Map([
        ["a", "player"],
        ["b", "state"],
      ]),
    });
    expect(close.accounts.a).toBe(50);
    expect(close.accounts.b).toBeCloseTo(44);
    expect(close.stateRemitted).toBeCloseTo(6);
    expect(close.accounts.hh).toBe(0);
  });
});
