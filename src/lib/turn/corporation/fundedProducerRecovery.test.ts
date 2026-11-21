import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { makeCorporation } from "@/lib/test-utils/factories";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { CAPITAL_DEPRECIATION_PER_TURN } from "@/lib/market/capital";
import { prepareProducerSector } from "./producerSectorPlan";
import {
  producerWalletId,
  runCorporationProducerMarket,
  type ProducerWalletScope,
} from "./producerMarketPhase";
import { runFundedProducerTurn } from "./fundedProducerTurn";
import { snapshotFundedHost } from "./fundedProducerRecovery";
import type { FundedPublicationContext } from "./settleFundedProducerTurn";
import { reconcileExcludedEntrants } from "./reconcileExcludedEntrants";
import * as demandBuilder from "./producerTurnDemand";
import { advanceProducerCapacity } from "@/lib/market/producerMarket/capacityRules";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
function fixture() {
  const memory = createInMemoryDb();
  const corp = makeCorporation({
    liquidCapital: 1000,
    liquidCurrencyCode: "USD",
    producerPayables: { worldEpoch: "world", turn: 0, claims: [] },
  });
  const scopes: ProducerWalletScope[] = [
    { kind: "households", countryId: "US", stateId: "US_CA", currency: "USD" },
    { kind: "operatingPayee", countryId: "US", stateId: "US_CA", currency: "USD" },
  ];
  const household = producerWalletId("world", scopes[0]);
  const operating = producerWalletId("world", scopes[1]);
  const sector = {
    _id: new ObjectId(),
    corporationId: corp._id,
    sectorType: "financial" as const,
    capitalStock: (10 * TURNS_PER_DAY) / (1 - CAPITAL_DEPRECIATION_PER_TURN),
    capacityBookAnchor: 100,
    buildQueue: [],
    producerCapacity: { worldEpoch: "world", turn: 0 },
    producerInventory: { worldEpoch: "world", turn: 0, inputStock: [], outputStock: [] },
    producerQuotes: { financial_services: { kind: "manual" as const, unitPrice: 3 } },
  };
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
  memory.seed("corporations", [{ ...corp }]);
  memory.seed("corporateSectors", [sector]);
  const input: Parameters<typeof runCorporationProducerMarket>[1] = {
    worldEpoch: "world",
    turn: 1,
    corporations: [corp],
    walletScopes: scopes,
    rates: new Map([["USD", 2]]),
    prepare: () => [
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
      }),
    ],
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
  };
  return { memory, corp, sector, household, operating, input, db: memory as unknown as Db };
}

function host(f: ReturnType<typeof fixture>) {
  const lookups = {
    corporations: [f.corp],
    sectorsByCorp: new Map([[String(f.corp._id), [f.sector]]]),
    exchangeRatesByCurrency: new Map([["USD", 2]]),
  };
  const input = {
    turn: 1,
    worldEpoch: "world",
    lookups,
    env: { lookups },
    seedHouseholds: false,
  } as unknown as Parameters<typeof runFundedProducerTurn>[1];
  const scopeById = new Map(f.input.walletScopes.map((s) => [producerWalletId("world", s), s]));
  const context = {
    openingTurn: 0,
    idleSectorIds: [],
    advanceCtx: { rates: f.input.rates },
    countryCurrency: new Map(),
    budgetIdByCountry: new Map(),
    scopeById,
    traders: [],
    background: { warnings: [] },
    stateAdvances: new Map(),
    treasuryFunded: null,
    openingShareByCountry: undefined,
    shortageOn: false,
    carryShare: 0,
    tariffScopes: [],
    tariffCollector: new Map(),
    input,
    demand: {
      headcountBySectorId: new Map([[String(f.sector._id), { desiredWorkers: 10, workers: 10 }]]),
      firstWalletByCorp: new Map([
        [String(f.corp._id), { sectorId: String(f.sector._id), wallet: f.household }],
      ]),
      planSector: new Map([[String(f.sector._id), String(f.sector._id)]]),
      backgroundOffers: [],
      backgroundOrders: [],
      householdSource: null,
      funding: [],
      investmentFunding: [],
    },
  } as unknown as FundedPublicationContext;
  return { input, context };
}
const money = (f: ReturnType<typeof fixture>) =>
  f.memory.collection("corporations").docs.reduce((s, c) => s + Number(c.liquidCapital) / 2, 0) +
  f.memory.collection("producerEconomyAccounts").docs.reduce((s, w) => s + Number(w.cash) / 2, 0);

describe("funded host recovery", () => {
  it.each([false, true])(
    "replays before new preparation, frozen host snapshot=%s",
    async (snapshot) => {
      const f = fixture();
      const { input, context } = host(f);
      const before = money(f);
      const prepared = f.input.prepare();
      const retained = { commodity: "steel", units: 3, value: 6 };
      prepared[0].plan.inputStock = [retained];
      f.memory.collection("corporateSectors").docs[0].producerInventory = {
        ...f.sector.producerInventory,
        inputStock: [retained],
      };
      await runCorporationProducerMarket(f.db, {
        ...f.input,
        prepare: () => prepared,
        close: () => ({
          transfers: [],
          meta: snapshot ? { fundedHost: snapshotFundedHost(context) } : {},
        }),
      });
      const cash = money(f);
      const physical = JSON.stringify(
        f.memory
          .collection("corporateSectors")
          .docs.map((s) => [
            s.capitalStock,
            s.capacityBookAnchor,
            s.buildQueue,
            s.producerInventory,
          ])
      );
      // The loaded sector is already at the attempted turn and cannot be prepared again.
      Object.assign(f.sector, f.memory.collection("corporateSectors").docs[0]);
      const result = await runFundedProducerTurn(f.db, input);
      expect(result.receiptsBySectorId.size).toBe(1);
      if (snapshot)
        expect(result.headcountBySectorId.get(String(f.sector._id))).toEqual({
          desiredWorkers: 10,
          workers: 10,
        });
      await runFundedProducerTurn(f.db, input);
      expect(money(f)).toBeCloseTo(cash, 10);
      expect(cash).toBeCloseTo(before, 10);
      expect(
        JSON.stringify(
          f.memory
            .collection("corporateSectors")
            .docs.map((s) => [
              s.capitalStock,
              s.capacityBookAnchor,
              s.buildQueue,
              s.producerInventory,
            ])
        )
      ).toBe(physical);
    }
  );

  it.each([false, true])(
    "finishes a cash/physical crash without preparing or paying twice, afterWrite=%s",
    async (afterWrite) => {
      const f = fixture();
      const { input, context } = host(f);
      const before = money(f);
      const fault = withInjectedCrash(f.memory, {
        collection: "corporateSectors",
        op: "bulkWrite",
        onCall: 1,
        afterWrite,
      });
      await expect(
        runCorporationProducerMarket(fault.db, {
          ...f.input,
          close: () => ({ transfers: [], meta: { fundedHost: snapshotFundedHost(context) } }),
        })
      ).rejects.toThrow("crash");
      await runFundedProducerTurn(f.db, input);
      const cash = money(f);
      const stock = JSON.stringify(
        f.memory.collection("corporateSectors").docs[0].producerInventory
      );
      await runFundedProducerTurn(f.db, input);
      expect(money(f)).toBeCloseTo(cash, 10);
      expect(cash).toBeCloseTo(before, 10);
      expect(
        JSON.stringify(f.memory.collection("corporateSectors").docs[0].producerInventory)
      ).toBe(stock);
    }
  );

  it("counts zero sales once when host publication crashes after its write", async () => {
    const f = fixture();
    const { input, context } = host(f);
    await runCorporationProducerMarket(f.db, {
      ...f.input,
      demand: {},
      close: () => ({ transfers: [], meta: { fundedHost: snapshotFundedHost(context) } }),
    });
    const fault = withInjectedCrash(f.memory, {
      collection: "corporateSectors",
      op: "bulkWrite",
      onCall: 1,
      afterWrite: true,
    });
    await expect(runFundedProducerTurn(fault.db, input)).rejects.toThrow("crash");
    expect(f.memory.collection("corporateSectors").docs[0].producerZeroSalesTurns).toBe(1);
    await runFundedProducerTurn(f.db, input);
    await runFundedProducerTurn(f.db, input);
    expect(f.memory.collection("corporateSectors").docs[0].producerZeroSalesTurns).toBe(1);
  });

  it("admits an excluded empty entrant without rebasing or consuming its paid queue", async () => {
    const f = fixture();
    await runCorporationProducerMarket(f.db, f.input);
    const entrant = {
      ...f.sector,
      _id: new ObjectId(),
      capitalStock: 0,
      capacityBookAnchor: 0,
      buildQueue: [
        { startTurn: 0, onlineTurn: 4, unitsOrdered: 40, costPaidAnchor: 1000, smooth: true },
      ],
    };
    const lookups = {
      corporations: [f.corp],
      sectorsByCorp: new Map([[String(f.corp._id), [entrant]]]),
    } as unknown as Parameters<typeof reconcileExcludedEntrants>[1];
    const queue = JSON.stringify(entrant.buildQueue);
    const allowed = await reconcileExcludedEntrants(f.db, lookups, "world", 2, 1);
    expect(allowed.get(String(entrant._id))).toBe(0);
    const advanced = advanceProducerCapacity({
      state: {
        completedTurn: allowed.get(String(entrant._id))!,
        ownedDailyUnits: 0,
        paidBookAnchor: 0,
        buildQueue: entrant.buildQueue,
      },
      turn: 2,
      activeFraction: 1,
      operatingRecipeRatio: 1,
      recessionCapacityFactor: 1,
    });
    expect(advanced.deliveredDailyUnits).toBe(20);
    expect(
      advanced.state.paidBookAnchor +
        advanced.depreciationAnchor +
        advanced.constructionInProgressAnchor
    ).toBeCloseTo(1000);
    expect(JSON.stringify(entrant.buildQueue)).toBe(queue);
    expect(entrant.producerCapacity.turn).toBe(0);
    entrant._id = f.sector._id;
    expect((await reconcileExcludedEntrants(f.db, lookups, "world", 2, 1)).size).toBe(0);
  });
});

it("freezes fresh host facts and never rebuilds demand on a retry", async () => {
  const f = fixture();
  const { input } = host(f);
  Object.assign(input.lookups, {
    federalBudgets: [],
    exchangeRatesByCurrency: new Map([["USD", 2]]),
  });
  const prepared = f.input.prepare();
  const builder = vi.spyOn(demandBuilder, "buildProducerTurnDemand").mockResolvedValue({
    preparedSectors: prepared,
    walletScopes: f.input.walletScopes,
    funding: [],
    investmentFunding: [],
    skippedSectors: [],
    planSector: new Map([[String(f.sector._id), String(f.sector._id)]]),
    publicBuyerOrders: [],
    investmentBuyerOrders: [],
    backgroundOrders: [],
    backgroundOffers: [],
    householdTransfers: [],
    households: f.input.demand?.households,
    ownerKindByCompany: new Map([[String(f.corp._id), "player"]]),
    firstWalletByCorp: new Map([
      [String(f.corp._id), { sectorId: String(f.sector._id), wallet: f.household }],
    ]),
    householdForPayee: new Map([[f.operating, f.household]]),
    planCountry: new Map([[String(f.sector._id), "US"]]),
    headcountBySectorId: new Map([[String(f.sector._id), { desiredWorkers: 10, workers: 10 }]]),
    householdSource: null,
  } as unknown as Awaited<ReturnType<typeof demandBuilder.buildProducerTurnDemand>>);
  try {
    const first = await runFundedProducerTurn(f.db, input);
    const balances = money(f);
    builder.mockRejectedValue(new Error("fresh preparation must not run on replay"));
    const second = await runFundedProducerTurn(f.db, input);
    expect(second.receiptsBySectorId).toEqual(first.receiptsBySectorId);
    expect(money(f)).toBeCloseTo(balances, 10);
    expect(builder).toHaveBeenCalledTimes(1);
  } finally {
    builder.mockRestore();
  }
});

it("does not count a legacy published zero-sales streak again", async () => {
  const f = fixture();
  const { input } = host(f);
  await runCorporationProducerMarket(f.db, { ...f.input, demand: {} });
  f.memory.collection("corporateSectors").docs[0].producerZeroSalesTurns = 4;
  f.memory.seed("producerMarketOutcomes", [{ _id: "world:1", worldEpoch: "world", turn: 1 }]);
  await runFundedProducerTurn(f.db, input);
  expect(f.memory.collection("corporateSectors").docs[0].producerZeroSalesTurns).toBe(4);
});

it("preserves a large mixed-currency cash book through settlement and host retries", async () => {
  const f = fixture();
  const { input, context } = host(f);
  f.corp.liquidCapital = 1_000_000_000_000;
  f.corp.liquidCurrencyCode = "CAD";
  Object.assign(f.memory.collection("corporations").docs[0], {
    liquidCapital: f.corp.liquidCapital,
    liquidCurrencyCode: "CAD",
  });
  const rates = new Map([
    ["USD", 2],
    ["CAD", 1.25],
  ] as const);
  Object.assign(context.advanceCtx, { rates });
  const balance = () =>
    Number(f.memory.collection("corporations").docs[0].liquidCapital) / 1.25 +
    f.memory.collection("producerEconomyAccounts").docs.reduce((s, w) => s + Number(w.cash) / 2, 0);
  const before = balance();
  await runCorporationProducerMarket(f.db, {
    ...f.input,
    rates,
    close: () => ({ transfers: [], meta: { fundedHost: snapshotFundedHost(context) } }),
  });
  await runFundedProducerTurn(f.db, input);
  const paid = balance();
  await runFundedProducerTurn(f.db, input);
  expect(balance()).toBe(paid);
  expect(Math.abs(paid - before)).toBeLessThan(0.001);
});
