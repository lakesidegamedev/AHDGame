import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { makeCorporation } from "@/lib/test-utils/factories";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { CAPITAL_DEPRECIATION_PER_TURN } from "@/lib/market/capital";
import { PRODUCER_ACCOUNTS } from "@/lib/market/producerMarket/liveFundingRules";
import {
  stateRunAdvanceReturn,
  stateRunAdvances,
} from "@/lib/market/producerMarket/stateRunAdvanceRules";
import { prepareProducerSector } from "./producerSectorPlan";
import {
  producerWalletId,
  runCorporationProducerMarket,
  type ProducerWalletScope,
} from "./producerMarketPhase";
import { advanceStateRuns, returnStateRunAdvances } from "./stateRunAdvance";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const RATE = 2;
const rates = new Map([["USD" as const, RATE]]);

function world(treasuryCashLocal?: number) {
  const memory = createInMemoryDb();
  const payables = { worldEpoch: "world", turn: 0, claims: [] };
  // A primary national corporation: no cash of its own, owned by its country.
  const state = makeCorporation({
    liquidCapital: 0,
    liquidCurrencyCode: "USD",
    countryId: "US",
    countryOwnerId: "US",
    isPrimaryNationalCorporation: true,
    producerPayables: payables,
  } as never);
  const priv = makeCorporation({
    liquidCapital: 0,
    liquidCurrencyCode: "USD",
    countryId: "US",
    ceoType: "npp",
    producerPayables: payables,
  });
  const scopes: ProducerWalletScope[] = [
    { kind: "households", countryId: "US", stateId: "US_CA", currency: "USD" },
    { kind: "operatingPayee", countryId: "US", stateId: "US_CA", currency: "USD" },
  ];
  const household = producerWalletId("world", scopes[0]);
  const operating = producerWalletId("world", scopes[1]);
  const sectorOf = (corpId: ObjectId) => ({
    _id: new ObjectId(),
    corporationId: corpId,
    sectorType: "financial" as const,
    capitalStock: (10 * TURNS_PER_DAY) / (1 - CAPITAL_DEPRECIATION_PER_TURN),
    capacityBookAnchor: 100,
    buildQueue: [],
    producerCapacity: { worldEpoch: "world", turn: 0 },
    producerInventory: { worldEpoch: "world", turn: 0, inputStock: [], outputStock: [] },
    producerQuotes: { financial_services: { kind: "manual" as const, unitPrice: 3 } },
  });
  const stateSector = sectorOf(state._id);
  const privSector = sectorOf(priv._id);
  memory.seed("gameState", [
    {
      _id: "current",
      worldEpochId: "world",
      isActive: true,
      processingKind: "turn",
      isProcessing: true,
      processingTargetTurn: 1,
    },
  ]);
  memory.seed("corporations", [{ ...state }, { ...priv }]);
  memory.seed("corporateSectors", [stateSector, privSector]);
  memory.seed(PRODUCER_ACCOUNTS, [
    { _id: household, worldEpoch: "world", ...scopes[0], cash: 200 },
  ]);
  memory.seed("federalBudget", [
    {
      _id: new ObjectId(),
      countryId: "US",
      currencyCode: "USD",
      treasuryBalance: 0,
      ...(treasuryCashLocal != null ? { treasuryCashLocal } : {}),
    },
  ]);
  const prepare = () =>
    [stateSector, privSector].map((sector) =>
      prepareProducerSector({
        worldEpoch: "world",
        turn: 1,
        sector,
        recipe: { supply: { financial_services: 1 }, demand: {}, eraUnitScale: 1 },
        markets: new Map([
          [
            "financial_services",
            { book: "world", referenceUnitPrice: 3, maximumInputUnitPrice: 4 },
          ],
        ]),
        outputMultiplier: 1,
        operatingRecipeRatio: 1,
        recessionCapacityFactor: 1,
        labourCost: 10,
        otherOperatingCost: 5,
        labourRecipientAccountId: household,
        operatingRecipientAccountId: operating,
      })
    );
  const settle = () =>
    runCorporationProducerMarket(memory as unknown as Db, {
      worldEpoch: "world",
      turn: 1,
      corporations: [state, priv],
      walletScopes: scopes,
      rates,
      prepare,
      demand: {
        households: [
          {
            accountId: household,
            spendFraction: 1,
            products: [
              { commodity: "financial_services", book: "world", maximumUnitPrice: 3, weight: 1 },
            ],
          },
        ],
      },
    });
  const ctx = {
    worldEpoch: "world",
    turn: 1,
    now: new Date(),
    rates,
    treasuryCurrency: () => "USD" as const,
    // Treasury shadow witnesses are off here; the mode under test is chosen per case.
    ledger:
      treasuryCashLocal != null
        ? {
            context: {
              turn: 1,
              preset: "test",
              ledgerShadowEnabled: false,
              treasuryCashLedgerEnabled: true,
              rates,
              treasuryCurrencies: new Map([["US", "USD" as const]]),
            },
          }
        : { context: null },
  };
  const budget = () => memory.collection("federalBudget").docs[0];
  // All money in anchor: companies, wallets and the signed treasury position.
  const total = () =>
    memory.collection("corporations").docs.reduce((s, c) => s + (c.liquidCapital as number), 0) /
      RATE +
    memory.collection(PRODUCER_ACCOUNTS).docs.reduce((s, w) => s + (w.cash as number), 0) / RATE +
    (budget().treasuryBalance as number) / RATE;
  return {
    memory,
    db: memory as unknown as Db,
    state,
    priv,
    stateSector,
    privSector,
    prepare,
    settle,
    ctx,
    budget,
    total,
  };
}

describe("stateRunAdvances", () => {
  const plan = (accountId: string, labourCost: number, otherOperatingCost: number) =>
    ({
      id: `p:${accountId}`,
      accountId,
      capacityUnits: 10,
      activeFraction: 1,
      outputMultiplier: 1,
      inputs: [{ commodity: "steel", unitsPerOutput: 1, book: "world", maximumUnitPrice: 2 }],
      outputs: [],
      labourCost,
      otherOperatingCost,
      labourRecipientAccountId: "h",
      operatingRecipientAccountId: "o",
      inputStock: [{ commodity: "steel", units: 4, value: 8, book: "world" }],
      outputStock: [],
    }) as never;

  it("advances old bills plus the full run less cash, for state companies only", () => {
    const out = stateRunAdvances({
      plans: [plan("soe", 10, 5), plan("private", 10, 5)],
      payables: [
        {
          id: "x",
          debtorAccountId: "soe",
          creditorAccountId: "h",
          producerId: "p:soe",
          kind: "labour",
          amount: 7,
        },
      ],
      cashByAccount: new Map([["soe", 3]]),
      stateAccountIds: new Set(["soe"]),
    });
    // 7 owed + 5 fixed + 10 wages + (10 - 4) steel at 2 = 34, less 3 cash.
    expect(out).toEqual([{ accountId: "soe", amount: 31 }]);
  });

  it("advances nothing to a company that already holds its run", () => {
    expect(
      stateRunAdvances({
        plans: [plan("soe", 10, 5)],
        payables: [],
        cashByAccount: new Map([["soe", 100]]),
        stateAccountIds: new Set(["soe"]),
      })
    ).toEqual([]);
  });

  it("returns the advance capped at closing cash", () => {
    expect(stateRunAdvanceReturn(30, 12)).toBe(12);
    expect(stateRunAdvanceReturn(30, 50)).toBe(30);
    expect(stateRunAdvanceReturn(30, 0)).toBe(0);
  });
});

describe("state operating advance on a funded turn", () => {
  it("a state company with no cash plans nothing without the advance, like a private one", async () => {
    const w = world();
    const settled = await w.settle();
    for (const p of settled.result.producers) expect(p.producedUnits).toBe(0);
  });

  it("lets a cashless state company produce on a soft budget and conserves money", async () => {
    const w = world();
    const before = w.total();
    const plans = w.prepare().map((p) => p.plan);
    const stateId = w.state._id.toHexString();
    const privId = w.priv._id.toHexString();
    const advances = await advanceStateRuns(w.db, w.ctx, {
      plans,
      stateCorpIds: new Set([stateId]),
    });
    // Only the state company is advanced; the private one still runs on its own cash.
    expect([...advances.keys()]).toEqual([stateId]);
    const advanced = advances.get(stateId)!;
    expect(advanced).toBeGreaterThan(0);
    // Soft budget: the treasury started at zero and goes into debt for the advance.
    expect(w.budget().treasuryBalance).toBe(-Math.round(advanced * RATE));
    expect(w.total()).toBeCloseTo(before);

    const settled = await w.settle();
    const produced = (corpId: string) =>
      settled.result.producers
        .filter((p) => plans.find((plan) => plan.id === p.id)?.accountId === corpId)
        .reduce((n, p) => n + p.producedUnits, 0);
    expect(produced(stateId)).toBeGreaterThan(0);
    expect(produced(privId)).toBe(0);
    expect(w.total()).toBeCloseTo(before);

    const heldBefore = w.memory
      .collection("corporations")
      .docs.find((c) => String(c._id) === stateId)!.liquidCapital as number;
    const returned = await returnStateRunAdvances(w.db, w.ctx, advances);
    const back = returned.get(stateId) ?? 0;
    expect(back).toBeGreaterThan(0);
    expect(back).toBeLessThanOrEqual(advanced * RATE + 1e-9);
    expect(back).toBeLessThanOrEqual(heldBefore);
    const heldAfter = w.memory
      .collection("corporations")
      .docs.find((c) => String(c._id) === stateId)!.liquidCapital as number;
    expect(heldAfter).toBeCloseTo(heldBefore - back);
    // The treasury carries exactly what was advanced and not returned.
    expect(w.budget().treasuryBalance).toBe(-Math.round(advanced * RATE) + Math.round(back));
    // Nothing leaks: what the company keeps is no more than its trading surplus.
    expect(heldAfter).toBeGreaterThanOrEqual(0);
    expect(w.total()).toBeCloseTo(before, 0);
  });

  it("replays frozen amounts on a retried turn instead of advancing twice", async () => {
    const w = world();
    const plans = w.prepare().map((p) => p.plan);
    const stateCorpIds = new Set([w.state._id.toHexString()]);
    const first = await advanceStateRuns(w.db, w.ctx, { plans, stateCorpIds });
    const balance = w.budget().treasuryBalance;
    const second = await advanceStateRuns(w.db, w.ctx, { plans, stateCorpIds });
    expect([...second]).toEqual([...first]);
    expect(w.budget().treasuryBalance).toBe(balance);
  });

  it("draws funded Treasury cash only up to what it can spend", async () => {
    const w = world(4);
    const plans = w.prepare().map((p) => p.plan);
    const stateId = w.state._id.toHexString();
    const advances = await advanceStateRuns(w.db, w.ctx, {
      plans,
      stateCorpIds: new Set([stateId]),
    });
    expect(advances.get(stateId)).toBeCloseTo(4 / RATE);
    expect(w.budget().treasuryCashLocal).toBe(0);
    expect(w.budget().treasuryBalance).toBe(-4);
    const corp = w.memory.collection("corporations").docs.find((c) => String(c._id) === stateId)!;
    expect(corp.liquidCapital).toBeCloseTo(4);
  });
});
