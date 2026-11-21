import { describe, expect, it } from "vitest";
import { COMMODITY_TYPES, type CommodityType } from "@/lib/constants/commodities";
import type { CommodityPrice } from "@/lib/db/types";
import type { CollectionSource } from "@/lib/db/repositories/source";
import type { ReachableBookEntry as ReachableBook } from "@/lib/trade/reachableBook";
import { priceCommodity, type CommodityPricingContext } from "./pricing";
import { readPreviousCommodityPrices } from "./previousPrices";
import type { CountryLedger, GlobalLedger, StateLedger } from "./ledgerTypes";

const MAX_MOVE = 0.02;
const BASE = Object.fromEntries(COMMODITY_TYPES.map((c) => [c, 100])) as Record<
  CommodityType,
  number
>;

type Doc = Record<string, unknown>;

/** One stored collection whose reads honour an inclusion projection, as Mongo does. */
function storedCommodityPrices(initial: Doc[]) {
  const docs = initial.map((d) => ({ ...d }));
  const project = (doc: Doc, projection?: Record<string, unknown>): Doc => {
    if (!projection) return { ...doc };
    const out: Doc = {};
    for (const key of ["_id", ...Object.keys(projection)]) {
      if (key in doc) out[key] = doc[key];
    }
    return out;
  };
  const collection = {
    find: (_filter: unknown, options?: { projection?: Record<string, unknown> }) => ({
      toArray: async () => docs.map((d) => project(d, options?.projection)),
    }),
  };
  const db = { collection: () => collection } as unknown as CollectionSource;
  const write = (commodity: string, set: Doc) => {
    const doc = docs.find((d) => d.commodity === commodity);
    if (doc) Object.assign(doc, set);
  };
  return { db, write };
}

function countryBook(supply: number, demand: number): ReachableBook {
  return {
    supply,
    demand,
    domesticDemand: demand,
    imports: 0,
    exports: 0,
    blockedSupply: 0,
    untradedSupply: 0,
  };
}

function settlementContext(
  previous: CommodityPrice[],
  usBook: ReachableBook,
  turn: number
): CommodityPricingContext {
  const flat = () => ({ supply: 100, demand: 100 });
  const global: GlobalLedger = new Map(COMMODITY_TYPES.map((c) => [c, flat()]));
  const byState: StateLedger = new Map([["s1", new Map(COMMODITY_TYPES.map((c) => [c, flat()]))]]);
  const byCountry: CountryLedger = new Map([
    ["US", new Map(COMMODITY_TYPES.map((c) => [c, flat()]))],
  ]);
  return {
    ledgerBasePrices: BASE,
    commodityNominalPriceIndex: 1,
    scarcityDriftEnabled: false,
    fundedPricing: true,
    fundedPricePace: { maxMove: MAX_MOVE },
    commandEconomyEnabled: false,
    priceCurrentYear: null,
    freightRampFraction: 1,
    freightSettlement: null,
    existingPriceMap: new Map(previous.map((p) => [p.commodity, p])),
    nudgeMap: new Map(),
    laggedRatios: new Map(),
    reachableBooks: new Map([["US", new Map([["consulting_services" as CommodityType, usBook]])]]),
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
    turn,
    now: new Date(0),
  };
}

async function settle(
  store: ReturnType<typeof storedCommodityPrices>,
  usBook: ReachableBook,
  turn: number
): Promise<number> {
  const previous = await readPreviousCommodityPrices(store.db);
  const ctx = settlementContext(previous, usBook, turn);
  const { priceOp } = priceCommodity(ctx, "consulting_services" as CommodityType, new Set());
  const set = priceOp.updateOne.update.$set as Doc;
  store.write("consulting_services", set);
  return (set.reachablePrices as Record<string, number>).US;
}

const firstTurnDoc: Doc = {
  _id: "consulting_services",
  commodity: "consulting_services",
  basePrice: 100,
  globalPrice: 100,
  globalSupply: 100,
  globalDemand: 100,
  statePrices: {},
  stateSupply: {},
  stateDemand: {},
};

describe("country reachable price pace through the previous price loader", () => {
  it("moves a country's reachable price at most the configured pace between turns", async () => {
    const store = storedCommodityPrices([firstTurnDoc]);
    const glutPrice = await settle(store, countryBook(5_000, 500), 1);
    const shortPrice = await settle(store, countryBook(500, 5_000), 2);
    expect(shortPrice).toBeGreaterThan(glutPrice);
    expect(shortPrice).toBeLessThanOrEqual(Math.round(glutPrice * (1 + MAX_MOVE) * 100) / 100);
    const back = await settle(store, countryBook(5_000, 500), 3);
    expect(back).toBeGreaterThanOrEqual(Math.round(shortPrice * (1 - MAX_MOVE) * 100) / 100);
  });

  it("does not clamp a country's first reachable price when no previous one is stored", async () => {
    const store = storedCommodityPrices([firstTurnDoc]);
    const first = await settle(store, countryBook(5_000, 500), 1);
    const unpaced = priceCommodity(
      settlementContext([], countryBook(5_000, 500), 1),
      "consulting_services" as CommodityType,
      new Set()
    ).priceOp.updateOne.update.$set.reachablePrices?.US;
    expect(first).toBe(unpaced);
    expect(first).toBeLessThan(100 * (1 - MAX_MOVE));
  });
});
