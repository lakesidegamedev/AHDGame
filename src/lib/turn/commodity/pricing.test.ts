import { describe, expect, it } from "vitest";
import {
  COMMODITY_TYPES,
  COMMODITY_PRICE_DRIFT_RATE,
  NATIONAL_PRICE_ADJUSTMENT_RATE,
  type CommodityType,
} from "@/lib/constants/commodities";
import type { CommodityPrice } from "@/lib/db/types";
import {
  buildLaggedRatios,
  buildNudgeMap,
  buildPriceHistoryDocs,
  priceCommodity,
  type CommodityPricingContext,
} from "./pricing";
import { settleFreightNetwork } from "@/lib/logistics/settlement";
import type { CountryId } from "@/lib/constants/countries";
import type { CountryLedger, GlobalLedger, StateLedger } from "./ledgerTypes";

const BASE = Object.fromEntries(COMMODITY_TYPES.map((c) => [c, 100])) as Record<
  CommodityType,
  number
>;

function commodityPrice(overrides: Partial<CommodityPrice> = {}): CommodityPrice {
  return {
    commodity: "food",
    basePrice: 100,
    globalPrice: 100,
    globalSupply: 100,
    globalDemand: 100,
    statePrices: {},
    stateSupply: {},
    stateDemand: {},
    turn: 1,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function balanceMaps(food: { supply: number; demand: number }): {
  global: GlobalLedger;
  byState: StateLedger;
  byCountry: CountryLedger;
} {
  const one = () => ({ supply: 0, demand: 0 });
  const global: GlobalLedger = new Map(COMMODITY_TYPES.map((c) => [c, one()]));
  const byState: StateLedger = new Map([
    ["s1", new Map(COMMODITY_TYPES.map((c) => [c, c === "food" ? { ...food } : one()]))],
  ]);
  const byCountry: CountryLedger = new Map([
    ["US", new Map(COMMODITY_TYPES.map((c) => [c, c === "food" ? { ...food } : one()]))],
  ]);
  global.set("food", { ...food });
  return { global, byState, byCountry };
}

function pricingContext(
  food: { supply: number; demand: number },
  overrides?: Partial<CommodityPricingContext>
): CommodityPricingContext {
  const { global, byState, byCountry } = balanceMaps(food);
  return {
    ledgerBasePrices: BASE,
    commodityNominalPriceIndex: 1,
    scarcityDriftEnabled: false,
    commandEconomyEnabled: false,
    priceCurrentYear: null,
    freightSettlementActive: false,
    freightRampFraction: 1,
    freightSettlement: null,
    existingPriceMap: new Map(),
    nudgeMap: new Map(),
    laggedRatios: new Map(),
    reachableBooks: new Map(),
    global,
    byCountry,
    byState,
    allStates: [{ _id: "s1" }],
    stateToCountry: new Map([["s1", "US"]]),
    demandTruncated: new Map(),
    scarcityMultByCommodity: new Map(),
    appliedGlobalPrices: new Map(),
    appliedStatePrices: new Map(),
    appliedNationalPrices: new Map(),
    turn: 1,
    now: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("buildNudgeMap", () => {
  it("keeps only docs carrying a nudge price", () => {
    const out = buildNudgeMap([
      { commodity: "food", nudgePrice: 70 },
      { commodity: "vehicles", nudgePrice: null },
    ] as Pick<CommodityPrice, "commodity" | "nudgePrice">[]);
    expect(out.get("food")).toBe(70);
    expect(out.has("vehicles")).toBe(false);
  });
});

describe("buildLaggedRatios", () => {
  it("ratios prior price against the nominal-scaled base", () => {
    const out = buildLaggedRatios(
      BASE,
      new Map([["food", commodityPrice({ globalPrice: 200 })]]),
      1
    );
    expect(out.get("food")).toBe(2);
    expect(out.has("vehicles")).toBe(false);
  });
});

describe("priceCommodity", () => {
  it("writes a full price op and records applied prices", () => {
    const ctx = pricingContext({ supply: 100, demand: 120 });
    const seen = new Set<string>();
    const { commodity, priceOp } = priceCommodity(ctx, "food", seen);
    expect(commodity).toBe("food");
    const set = priceOp.updateOne.update.$set;
    const nationalPrices = set.nationalPrices;
    expect(set.globalPrice).toBeGreaterThan(0);
    expect(set.statePrices["s1"]).toBeGreaterThan(0);
    expect(nationalPrices).toBeDefined();
    expect(nationalPrices?.["US"]).toBeGreaterThan(0);
    expect(set.nudgePrice).toBeNull();
    expect(set.stateNudges).toEqual({});
    expect(priceOp.updateOne.upsert).toBe(true);
    expect(seen.has("s1")).toBe(true);
    expect(ctx.appliedGlobalPrices.get("food")).toBe(set.globalPrice);
    expect(ctx.appliedNationalPrices.get("food")!["US"]).toBe(nationalPrices?.["US"]);
  });

  it("drifts the state price toward target at the drift rate", () => {
    const bal = { supply: 100, demand: 200 };
    const first = pricingContext(bal);
    const { priceOp: op1 } = priceCommodity(first, "food", new Set());
    const target = op1.updateOne.update.$set.statePrices["s1"];
    const globalG = op1.updateOne.update.$set.globalPrice;

    const start = target * 2;
    const second = pricingContext(bal, {
      existingPriceMap: new Map([
        ["food", commodityPrice({ globalPrice: globalG, statePrices: { s1: start } })],
      ]),
      appliedGlobalPrices: new Map(),
      appliedStatePrices: new Map(),
      appliedNationalPrices: new Map(),
    });
    const { priceOp: op2 } = priceCommodity(second, "food", new Set());
    const next = op2.updateOne.update.$set.statePrices["s1"];
    // Same balances and same lagged global ⇒ same target; one drift step.
    expect(next).toBeCloseTo(start + COMMODITY_PRICE_DRIFT_RATE * (target - start), 2);
  });

  it("moves the national price one adjustment step from last turn's national price", () => {
    const bal = { supply: 100, demand: 200 };
    const { priceOp: op1 } = priceCommodity(pricingContext(bal), "food", new Set());
    const target = op1.updateOne.update.$set.nationalPrices!["US"];

    const start = target * 2;
    const second = pricingContext(bal, {
      existingPriceMap: new Map([["food", commodityPrice({ nationalPrices: { US: start } })]]),
    });
    const { priceOp: op2 } = priceCommodity(second, "food", new Set());
    const next = op2.updateOne.update.$set.nationalPrices!["US"];
    expect(next).toBeCloseTo(start + NATIONAL_PRICE_ADJUSTMENT_RATE * (target - start), 2);
    expect(second.appliedNationalPrices.get("food")!["US"]).toBe(next);
  });

  it("applies peg precedence: state peg > global peg", () => {
    const ctx = pricingContext(
      { supply: 100, demand: 120 },
      {
        existingPriceMap: new Map([
          ["food", commodityPrice({ hardPeg: 50, stateHardPegs: { s1: 60 } })],
        ]),
      }
    );
    const { priceOp } = priceCommodity(ctx, "food", new Set());
    expect(priceOp.updateOne.update.$set.globalPrice).toBe(50);
    expect(priceOp.updateOne.update.$set.statePrices["s1"]).toBe(60);
  });

  it("applies a global nudge over the drifted price", () => {
    const ctx = pricingContext({ supply: 100, demand: 120 }, { nudgeMap: new Map([["food", 70]]) });
    const { priceOp } = priceCommodity(ctx, "food", new Set());
    expect(priceOp.updateOne.update.$set.globalPrice).toBe(70);
    expect(priceOp.updateOne.update.$set.statePrices["s1"]).toBe(70);
  });
});

describe("buildPriceHistoryDocs", () => {
  it("snapshots applied prices per commodity", () => {
    const { global } = balanceMaps({ supply: 100, demand: 120 });
    const docs = buildPriceHistoryDocs({
      global,
      demandTruncated: new Map(),
      appliedGlobalPrices: new Map([["food", 111]]),
      appliedStatePrices: new Map([["food", { s1: 112 }]]),
      appliedNationalPrices: new Map([["food", { US: 113 }]]),
      scarcityMultByCommodity: new Map([["food", 1]]),
      ledgerBasePrices: BASE,
      commodityNominalPriceIndex: 1,
      turn: 7,
      now: new Date("2026-01-01T00:00:00Z"),
    });
    expect(docs).toHaveLength(COMMODITY_TYPES.length);
    const food = docs.find((d) => d.commodity === "food")!;
    expect(food.globalPrice).toBe(111);
    expect(food.statePrices).toEqual({ s1: 112 });
    expect(food.turn).toBe(7);
  });
});

it("prices the reachable markets of runtime successors", () => {
  const ctx = pricingContext(
    { supply: 20_000_000, demand: 100_000_000 },
    { scarcityDriftEnabled: true }
  );
  ctx.reachableBooks.set(
    "SCO",
    new Map([
      [
        "food",
        {
          supply: 20_000_000,
          demand: 100_000_000,
          domesticDemand: 100_000_000,
          imports: 0,
          exports: 0,
          blockedSupply: 0,
          untradedSupply: 0,
        },
      ],
    ])
  );
  ctx.reachableBooks.set(
    "WAL",
    new Map([
      [
        "food",
        {
          supply: 100_000_000,
          demand: 20_000_000,
          domesticDemand: 20_000_000,
          imports: 0,
          exports: 0,
          blockedSupply: 0,
          untradedSupply: 0,
        },
      ],
    ])
  );
  const { priceOp } = priceCommodity(ctx, "food", new Set());
  const prices = priceOp.updateOne.update.$set;
  expect(prices.reachablePrices?.SCO).toBeGreaterThan(prices.reachablePrices?.WAL ?? Infinity);
  expect(prices.scarcityMultByCountry?.SCO).toBeGreaterThan(
    prices.scarcityMultByCountry?.WAL ?? Infinity
  );
});

describe("export price feedback", () => {
  it("keeps a competitive small exporter selling instead of alternating full offer and zero", () => {
    const countries: CountryId[] = ["IE", "JP", "US"];
    const balances = [
      { supply: 2100, demand: 100 },
      { supply: 10000, demand: 5000 },
      { supply: 0, demand: 3000 },
    ];
    let prices: Record<string, number> = { IE: 260, JP: 275, US: 300 };
    const exports: number[] = [];
    for (let turn = 0; turn < 12; turn++) {
      const byCountry: CountryLedger = new Map(
        countries.map((c, i) => [
          c,
          new Map(
            COMMODITY_TYPES.map((k) => [
              k,
              k === "food" ? { ...balances[i] } : { supply: 0, demand: 0 },
            ])
          ),
        ])
      );
      const byState: StateLedger = new Map(
        [...byCountry].map(([c, b]) => [c, new Map([...b].map(([k, v]) => [k, { ...v }]))])
      );
      const freightSettlement = settleFreightNetwork({
        states: countries.map((c) => ({ stateId: c, countryId: c })),
        byCountry,
        byState,
        nationalPricesFor: () => prices,
        statePricesFor: () => ({ IE: 300, JP: 300, US: 300 }),
        basePriceFor: () => 300,
        freightPrice: 0,
        hops: () => null,
        tariffRatePct: () => 0,
        isBlocked: () => false,
      });
      const pairs = freightSettlement.sourcing.pairAggregates.filter(
        (p) => p.commodity === "food" && p.exporter !== p.importer
      );
      exports.push(
        pairs.filter((p) => p.exporter === "IE").reduce((n, p) => n + p.dispatchedUnits, 0)
      );
      for (const p of pairs) {
        byCountry.get(p.exporter)!.get("food")!.supply -= p.dispatchedUnits;
        byCountry.get(p.importer)!.get("food")!.demand -= p.deliveredUnits;
      }
      const ctx = pricingContext(
        { supply: 12100, demand: 8100 },
        {
          ledgerBasePrices: Object.fromEntries(COMMODITY_TYPES.map((c) => [c, 300])) as Record<
            CommodityType,
            number
          >,
          byCountry,
          byState,
          allStates: countries.map((_id) => ({ _id })),
          stateToCountry: new Map(countries.map((c) => [c, c])),
          freightSettlementActive: true,
          freightSettlement,
          existingPriceMap: new Map([
            ["food", commodityPrice({ nationalPrices: prices, globalPrice: 300 })],
          ]),
        }
      );
      priceCommodity(ctx, "food", new Set());
      prices = ctx.appliedNationalPrices.get("food")!;
    }
    expect(exports[0]).toBeCloseTo(2000);
    expect(
      exports.every((units) => units > 1999.9),
      JSON.stringify(exports)
    ).toBe(true);
  });
});
