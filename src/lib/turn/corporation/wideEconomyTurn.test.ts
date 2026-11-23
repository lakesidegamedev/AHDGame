import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { makeCorporation } from "@/lib/test-utils/factories";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { CAPITAL_DEPRECIATION_PER_TURN } from "@/lib/market/capital";
import { prepareProducerSector } from "./producerSectorPlan";
import { producerWalletId, type ProducerWalletScope } from "./producerMarketPhase";
import { runFundedProducerTurn } from "./fundedProducerTurn";
import { buildProducerTurnDemand } from "./producerTurnDemand";
import * as demandBuilder from "./producerTurnDemand";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const RATE = 2;

function demandDb() {
  const memory = createInMemoryDb();
  memory.seed("states", [
    { _id: "US_CA", countryId: "US", gdp: 1000 },
    { _id: "US_NY", countryId: "US", gdp: 500 },
  ]);
  return memory as unknown as Db;
}

const lookups = () =>
  ({
    corporations: [],
    sectorsByCorp: new Map(),
    federalBudgets: [{ _id: new ObjectId(), countryId: "US", currencyCode: "USD" }],
    exchangeRatesByCurrency: new Map([["USD", RATE]]),
    eraUnitScale: 1,
    priceRatioByCommodity: new Map(),
    primeRateByCountry: new Map(),
    preset: "2027",
  }) as unknown as Parameters<typeof buildProducerTurnDemand>[1]["lookups"];

const lookupsWithIndex = (priceIndex: number) =>
  ({
    ...lookups(),
    federalBudgets: [{ _id: new ObjectId(), countryId: "US", currencyCode: "USD", priceIndex }],
  }) as unknown as Parameters<typeof buildProducerTurnDemand>[1]["lookups"];

const turns = [[{ commodity: "steel", supply: 100, demand: 80 }]];

const buildWith = (
  stage: number | undefined,
  extra: Partial<Parameters<typeof buildProducerTurnDemand>[1]> = {},
  priceIndex = 100
) =>
  buildProducerTurnDemand(demandDb(), {
    turn: 1,
    worldEpoch: "world",
    lookups: lookupsWithIndex(priceIndex),
    env: stage === undefined ? {} : { wideEconomyStage: stage },
    sectorOps: [],
    carry: null,
    ...extra,
  });

describe("wider-economy demand", () => {
  it("builds no wider-economy orders at stage 0 or when the stage is absent", async () => {
    expect((await buildWith(0, { wideEconomyBaselineTurns: turns })).wideEconomyOrders).toEqual([]);
    expect(
      (await buildWith(undefined, { wideEconomyBaselineTurns: turns })).wideEconomyOrders
    ).toEqual([]);
  });

  it("orders nothing at stage 1 with no stored baseline and no turns to build one", async () => {
    const r = await buildWith(1);
    expect(r.wideEconomyOrders).toEqual([]);
    expect(r.wideEconomyBaselineCreated).toBeNull();
  });

  it("builds the baseline on its first turn and buys the room up to 1.1x supply", async () => {
    const r = await buildWith(1, { wideEconomyBaselineTurns: turns });
    expect(r.wideEconomyBaselineCreated?.units).toEqual({ steel: expect.closeTo(30, 9) });
    const steel = r.wideEconomyOrders.filter((o) => o.commodity === "steel");
    expect(steel).toHaveLength(1);
    expect(steel[0].units).toBeCloseTo(30, 9);
    expect(steel[0].accountId).toBe("wide:US");
    expect(steel[0].demandStep).toBe(1);
  });

  it("uses a stored baseline as is and grows with real GDP, not with prices", async () => {
    const baseline = {
      units: { steel: 30 },
      realGdp: { US_CA: 10, US_NY: 5 },
      countryOfState: { US_CA: "US", US_NY: "US" },
    };
    // States hold nominal GDP 1000 and 500; at price index 100 that is real 10 and 5.
    const same = await buildWith(1, {
      wideEconomyBaseline: baseline,
      wideEconomyBaselineTurns: turns,
    });
    expect(same.wideEconomyBaselineCreated).toBeNull();
    expect(same.wideEconomyOrders.find((o) => o.commodity === "steel")!.units).toBeCloseTo(30, 9);
    // Prices doubled with no real growth: nominal GDP is unchanged here, so real GDP halves.
    const inflated = await buildWith(1, { wideEconomyBaseline: baseline }, 200);
    expect(inflated.wideEconomyOrders.find((o) => o.commodity === "steel")!.units).toBeCloseTo(
      15,
      9
    );
  });
});

describe("wider-economy funding", () => {
  function fundedWorld() {
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
    const prepare = () => [
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
    ];
    return { memory, corp, sector, scopes, household, operating, prepare };
  }

  async function runWith(wideSpend: number) {
    const f = fundedWorld();
    const wallet = producerWalletId("world", {
      kind: "wideEconomy",
      countryId: "US",
      currency: "USD",
    });
    const orders =
      wideSpend > 0
        ? [
            {
              id: "wide-test",
              accountId: wallet,
              commodity: "steel",
              book: "world",
              units: wideSpend / 5,
              maximumUnitPrice: 5,
              maximumSpend: wideSpend,
              countryId: "US",
            },
          ]
        : [];
    const input = {
      turn: 1,
      worldEpoch: "world",
      lookups: {
        corporations: [f.corp],
        sectorsByCorp: new Map([[String(f.corp._id), [f.sector]]]),
        exchangeRatesByCurrency: new Map([["USD", RATE]]),
        federalBudgets: [{ _id: new ObjectId(), countryId: "US", currencyCode: "USD" }],
      },
      env: {},
      seedHouseholds: false,
    } as unknown as Parameters<typeof runFundedProducerTurn>[1];
    const spy = vi.spyOn(demandBuilder, "buildProducerTurnDemand").mockResolvedValue({
      preparedSectors: f.prepare(),
      walletScopes: f.scopes,
      funding: [],
      investmentFunding: [],
      skippedSectors: [],
      planSector: new Map([[String(f.sector._id), String(f.sector._id)]]),
      publicBuyerOrders: [],
      investmentBuyerOrders: [],
      backgroundOrders: [],
      backgroundOffers: [],
      wideEconomyOrders: orders,
      householdTransfers: [],
      households: [],
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
      await runFundedProducerTurn(f.memory as unknown as Db, input);
    } finally {
      spy.mockRestore();
    }
    const moves = f.memory
      .collection("bankMoneyMoves")
      .docs.filter((m) => m.kind === "producer_background_funding");
    const wallets = f.memory
      .collection("producerEconomyAccounts")
      .docs.filter((w) => w.kind === "wideEconomy");
    return { moves, wallets };
  }

  it("funds nothing and creates no wallet when there are no orders (stage 0)", async () => {
    const r = await runWith(0);
    expect(r.moves).toEqual([]);
    expect(r.wallets).toEqual([]);
  });

  it("funds the wallet with only this turn's spend and closes it empty, so nothing compounds", async () => {
    const r = await runWith(40);
    expect(r.wallets).toHaveLength(1);
    expect(r.moves).toHaveLength(1);
    const mint = (r.moves[0].legs as { kind: string; amount: number }[]).find(
      (l) => l.kind === "mint"
    )!;
    expect(mint.amount).toBeCloseTo(40 * RATE, 6);
    expect(r.wallets[0].cash).toBeCloseTo(0, 6);
  });
});
