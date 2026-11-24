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
import * as backgroundTraders from "./backgroundTraders";

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
    env: (stage === undefined ? {} : { wideEconomyStage: stage }) as unknown as Parameters<
      typeof buildProducerTurnDemand
    >[1]["env"],
    sectorOps: [],
    carry: null,
    ...extra,
  });

describe("wider-economy demand", () => {
  it("builds no wider-economy lines at stage 0 or when the turn passes no stage", async () => {
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

  it("builds the baseline on its first turn: a seller at 10% of demand, a buyer 1.1x that", async () => {
    const r = await buildWith(1, { wideEconomyBaselineTurns: turns });
    expect(r.wideEconomyBaselineCreated?.units).toEqual({ steel: expect.closeTo(8, 9) });
    const steel = r.wideEconomyOrders.filter((o) => o.commodity === "steel");
    expect(steel).toHaveLength(1);
    expect(steel[0].units).toBeCloseTo(8.8, 9);
    expect(steel[0].accountId).toBe("wide:US");
    expect(steel[0].demandStep).toBe(1);
    const offers = r.wideEconomyOffers.filter((o) => o.commodity === "steel");
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ accountId: "wide:US", countryId: "US", book: "world" });
    expect(offers[0].units).toBeCloseTo(8, 9);
  });

  it("gives a lane short in each recent turn a bigger seller, and leaves the buyer as it was", async () => {
    const short = { "steel|world": 0.3 };
    const r = await buildWith(1, {
      wideEconomyBaselineTurns: turns,
      wideEconomyShortageHistory: [short, short, short],
    });
    expect(r.wideEconomyOffers.find((o) => o.commodity === "steel")!.units).toBeCloseTo(8, 9);
    expect(r.wideEconomyBoostOffers.find((o) => o.commodity === "steel")!.units).toBeCloseTo(8, 9);
    expect(r.wideEconomyOrders.find((o) => o.commodity === "steel")!.units).toBeCloseTo(8.8, 9);
    const brief = await buildWith(1, {
      wideEconomyBaselineTurns: turns,
      wideEconomyShortageHistory: [short, short],
    });
    expect(brief.wideEconomyBoostOffers).toEqual([]);
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
    expect(same.wideEconomyOrders.find((o) => o.commodity === "steel")!.units).toBeCloseTo(33, 9);
    // Prices doubled with no real growth: nominal GDP is unchanged here, so real GDP halves.
    const inflated = await buildWith(1, { wideEconomyBaseline: baseline }, 200);
    expect(inflated.wideEconomyOrders.find((o) => o.commodity === "steel")!.units).toBeCloseTo(
      16.5,
      9
    );
  });
});

describe("wider-economy split between countries", () => {
  // A US state of 1,000 dollars at 2 per anchor and a Japanese state of
  // 150,000 yen at 300 per anchor: the same size, 500, in the anchor.
  const mixedDb = () => {
    const memory = createInMemoryDb();
    memory.seed("states", [
      { _id: "US_CA", countryId: "US", gdp: 1000 },
      { _id: "JP_TK", countryId: "JP", gdp: 150_000 },
    ]);
    return memory as unknown as Db;
  };
  const mixedLookups = () =>
    ({
      ...lookups(),
      federalBudgets: [
        { _id: new ObjectId(), countryId: "US", currencyCode: "USD", priceIndex: 100 },
        { _id: new ObjectId(), countryId: "JP", currencyCode: "JPY", priceIndex: 100 },
      ],
      exchangeRatesByCurrency: new Map([
        ["USD", 2],
        ["JPY", 300],
      ]),
    }) as unknown as Parameters<typeof buildProducerTurnDemand>[1]["lookups"];
  const build = (extra: Partial<Parameters<typeof buildProducerTurnDemand>[1]>) =>
    buildProducerTurnDemand(mixedDb(), {
      turn: 1,
      worldEpoch: "world",
      lookups: mixedLookups(),
      env: { wideEconomyStage: 1 } as unknown as Parameters<
        typeof buildProducerTurnDemand
      >[1]["env"],
      sectorOps: [],
      carry: null,
      ...extra,
    });
  const unitsOf = (r: Awaited<ReturnType<typeof build>>, c: string) =>
    r.wideEconomyOffers.find((o) => o.commodity === "steel" && o.countryId === c)!.units;

  it("gives countries of equal size in the anchor currency equal lines", async () => {
    const r = await build({ wideEconomyBaselineTurns: turns });
    expect(r.wideEconomyBaselineCreated?.weight).toEqual({
      JP_TK: expect.closeTo(0.5, 9),
      US_CA: expect.closeTo(0.5, 9),
    });
    expect(unitsOf(r, "US")).toBeCloseTo(unitsOf(r, "JP"), 9);
  });

  it("weighs a baseline stored before the anchor split, and hands the weights back to keep", async () => {
    const r = await build({
      wideEconomyBaseline: {
        units: { steel: 8 },
        realGdp: { US_CA: 10, JP_TK: 1500 },
        countryOfState: { US_CA: "US", JP_TK: "JP" },
      },
    });
    expect(r.wideEconomyBaselineWeights).toEqual({
      JP_TK: expect.closeTo(0.5, 9),
      US_CA: expect.closeTo(0.5, 9),
    });
    expect(unitsOf(r, "US")).toBeCloseTo(4, 9);
    expect(unitsOf(r, "JP")).toBeCloseTo(4, 9);
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

  async function runWith(
    wideSpend: number,
    extra: (wallet: string) => Record<string, unknown> = () => ({}),
    seed: (memory: ReturnType<typeof createInMemoryDb>) => void = () => {},
    traders: Awaited<ReturnType<typeof backgroundTraders.loadBackgroundTraders>>["traders"] = [],
    env: Record<string, unknown> = {}
  ) {
    const f = fundedWorld();
    seed(f.memory);
    const traderSpy = vi
      .spyOn(backgroundTraders, "loadBackgroundTraders")
      .mockResolvedValue({ traders, warnings: [] });
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
      env,
      seedHouseholds: false,
    } as unknown as Parameters<typeof runFundedProducerTurn>[1];
    let result: Awaited<ReturnType<typeof runFundedProducerTurn>> | undefined;
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
      ...extra(wallet),
    } as unknown as Awaited<ReturnType<typeof demandBuilder.buildProducerTurnDemand>>);
    try {
      result = await runFundedProducerTurn(f.memory as unknown as Db, input);
    } finally {
      spy.mockRestore();
      traderSpy.mockRestore();
    }
    const moves = f.memory
      .collection("bankMoneyMoves")
      .docs.filter((m) => m.kind === "producer_background_funding");
    const wallets = f.memory
      .collection("producerEconomyAccounts")
      .docs.filter((w) => w.kind === "wideEconomy");
    const corrections = f.memory
      .collection("bankMoneyMoves")
      .docs.filter((m) => String(m.kind).includes("retry_correction"));
    const returns = f.memory
      .collection("bankMoneyMoves")
      .docs.filter((m) => m.kind === "producer_background_return");
    const turnWarnings = result?.turnWarnings ?? [];
    return { moves, wallets, returns, wallet, memory: f.memory, corrections, turnWarnings };
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

  it("pays the seller's takings out through the declared return, so its wallet closes empty", async () => {
    const publicWallet = producerWalletId("world", {
      kind: "publicBuyer",
      countryId: "US",
      currency: "USD",
    });
    const sellerAsk = 3.15;
    const r = await runWith(0, (wallet) => ({
      funding: [{ countryId: "US", fundingLocal: 10_000 }],
      publicBuyerOrders: [
        {
          id: "public-fs",
          accountId: publicWallet,
          commodity: "financial_services",
          book: "world",
          units: 1_000_000,
          maximumUnitPrice: 4,
          maximumSpend: 10_000,
          countryId: "US",
        },
      ],
      wideEconomyOffers: [
        {
          id: "wide-offer-fs",
          accountId: wallet,
          commodity: "financial_services",
          book: "world",
          units: 5,
          unitPrice: sellerAsk,
          countryId: "US",
        },
      ],
    }));
    // No buyer lines: nothing minted for the wider economy.
    expect(r.moves).toEqual([]);
    expect(r.wallets).toHaveLength(1);
    expect(r.wallets[0].cash).toBeCloseTo(0, 6);
    // The seller sold its 5 units to the public buyer it was short for, and
    // that money left only through the declared return.
    expect(r.returns).toHaveLength(1);
    const legs = r.returns[0].legs as { kind: string; amount: number; filter?: { _id: string } }[];
    expect(legs.find((l) => l.kind === "debit")!.filter!._id).toBe(r.wallet);
    expect(legs.find((l) => l.kind === "burn")!.amount).toBeCloseTo(5 * sellerAsk * RATE, 6);
    // The turn records each lane's real shortage for the next turns' boost.
    const [outcome] = r.memory.collection("producerMarketOutcomes").docs;
    const shortage = outcome.wideShortage as Record<string, number>;
    expect(shortage["financial_services|world"]).toBeGreaterThan(0.9);
  });

  it("keeps the anchor-currency weights it worked out for an older baseline", async () => {
    const r = await runWith(
      0,
      () => ({ wideEconomyBaselineWeights: { US_CA: 1 } }),
      (memory) =>
        memory.seed("producerWideEconomyBaseline", [
          {
            _id: "world",
            units: { steel: 8 },
            realGdp: { US_CA: 10 },
            countryOfState: { US_CA: "US" },
          },
        ])
    );
    const [doc] = r.memory.collection("producerWideEconomyBaseline").docs;
    expect(doc.weight).toEqual({ US_CA: 1 });
  });

  it("funds background countries and the wider economy together, so neither replaces the other", async () => {
    const scope: ProducerWalletScope = {
      kind: "backgroundEconomy",
      countryId: "FR",
      currency: "USD",
    };
    const traderWallet = producerWalletId("world", scope);
    const r = await runWith(
      40,
      () => ({
        backgroundOrders: [
          {
            id: "bg-fr-steel",
            accountId: traderWallet,
            commodity: "steel",
            book: "world",
            units: 6,
            maximumUnitPrice: 5,
            maximumSpend: 30,
            countryId: "FR",
          },
        ],
      }),
      () => {},
      [
        {
          countryId: "FR",
          macroId: new ObjectId() as never,
          accountId: traderWallet,
          scope,
          currency: "USD",
          byCommodity: {} as never,
          fundedTrade: undefined as never,
        },
      ]
    );
    expect(r.corrections).toEqual([]);
    const mints = r.moves.flatMap((m) =>
      (m.legs as { kind: string; amount: number; filter?: { _id: string } }[]).filter(
        (l) => l.kind === "credit"
      )
    );
    const credited = (id: string) =>
      mints.filter((l) => l.filter?._id === id).reduce((n, l) => n + l.amount, 0);
    expect(credited(traderWallet)).toBeCloseTo(30 * RATE, 6);
    expect(credited(r.wallet)).toBeCloseTo(40 * RATE, 6);
  });

  it("stores who every unit came from, daily on the books and per turn per company, with no gap", async () => {
    const publicWallet = producerWalletId("world", {
      kind: "publicBuyer",
      countryId: "US",
      currency: "USD",
    });
    const r = await runWith(
      0,
      (wallet) => ({
        funding: [{ countryId: "US", fundingLocal: 10_000 }],
        publicBuyerOrders: [
          {
            id: "public-fs",
            accountId: publicWallet,
            commodity: "financial_services",
            book: "world",
            units: 1_000_000,
            maximumUnitPrice: 4,
            maximumSpend: 10_000,
            countryId: "US",
          },
        ],
        wideEconomyOffers: [
          {
            id: "wide-offer-fs",
            accountId: wallet,
            commodity: "financial_services",
            book: "world",
            units: 5,
            unitPrice: 3.15,
            countryId: "US",
          },
        ],
      }),
      () => {},
      [],
      { fundedBookStage: 1 }
    );
    const [outcome] = r.memory.collection("producerMarketOutcomes").docs;
    const book = (outcome.books as Record<string, unknown>[]).find(
      (b) => b.countryId === "US" && b.commodity === "financial_services"
    ) as {
      supply: number;
      supplyBy: Record<string, number>;
      demand: number;
      demandBy: Record<string, number>;
    };
    const total = (split: Record<string, number>) =>
      Object.values(split).reduce((n, v) => n + v, 0);
    expect(total(book.supplyBy)).toBeCloseTo(book.supply, 6);
    expect(total(book.demandBy)).toBeCloseTo(book.demand, 6);
    // The background economy sold its 5 units: 5 per turn, 5 x 24 on the daily book.
    expect(book.supplyBy.wideEconomy).toBeCloseTo(5 * TURNS_PER_DAY, 6);
    expect(outcome.attributionGaps).toBeUndefined();
    expect(r.turnWarnings.join(" ")).not.toContain("Market attribution gap");
    // Company books are per turn: their sum times 24 is the company part of the daily book.
    const [companyDoc] = r.memory.collection("producerMarketCompanyBooks").docs;
    const offered = (companyDoc.rows as { offered: number }[]).reduce((n, c) => n + c.offered, 0);
    expect(offered * TURNS_PER_DAY).toBeCloseTo(book.supplyBy.company!, 6);
  });
});
