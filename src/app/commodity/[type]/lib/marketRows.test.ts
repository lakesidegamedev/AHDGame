import { describe, expect, it } from "vitest";
import { TURNS_PER_DAY } from "@/lib/constants/corporationsClient";
import {
  fundedCountryMarket,
  fundedCountryTradeTotals,
  worldFundedMarket,
  type FundedCountryMarket,
} from "@/lib/market/producerMarket/fundedCountryViewRules";
import type { FundedCountryBookRow } from "@/lib/market/producerMarket/fundedBookRules";
import { commodityDetailPerTurn, marketPerTurn } from "@/lib/commodities/perTurnUnits";
import { flowsFromWorldMarket, worldSupplyFigures } from "@/lib/commodities/worldSupplyRules";
import { buildScarcityBreakdown, premiumTrendSentence } from "@/lib/market/priceBreakdownRules";
import {
  balanceParts,
  CARRIED_STOCK_LABEL,
  listRowsWithOthers,
  marketRows,
  NEW_OUTPUT_LABEL,
  newOutputBalance,
  rowsTotal,
} from "./marketRows";

const sum = (xs: readonly { units: number }[]) => xs.reduce((n, x) => n + x.units, 0);

/**
 * Stored books for one good, on the price phase's daily basis (settlement
 * units per turn x TURNS_PER_DAY), as settleFundedProducerTurn writes them.
 * The US has companies, the background economy selling and buying, imports
 * and exports; France is an economy-only country.
 */
const perTurn = (u: number) => u * TURNS_PER_DAY;
const books: FundedCountryBookRow[] = [
  {
    countryId: "US",
    commodity: "advertising",
    supply: perTurn(110),
    demand: perTurn(130),
    requested: perTurn(130),
    filled: perTurn(118),
    spilloverRequested: perTurn(4),
    imports: perTurn(15),
    exports: perTurn(7),
    supplyBy: { company: perTurn(100), wideEconomy: perTurn(10) },
    demandBy: { company: perTurn(90), households: perTurn(30), wideEconomy: perTurn(10) },
    requestedBy: { company: perTurn(90), households: perTurn(30), wideEconomy: perTurn(10) },
    filledBy: { company: perTurn(80), households: perTurn(28), wideEconomy: perTurn(10) },
  },
  {
    countryId: "FR",
    commodity: "advertising",
    supply: perTurn(40),
    demand: perTurn(20),
    requested: perTurn(20),
    filled: perTurn(20),
    imports: perTurn(7),
    exports: perTurn(15),
    supplyBy: { backgroundEconomy: perTurn(40) },
    demandBy: { backgroundEconomy: perTurn(20) },
    requestedBy: { backgroundEconomy: perTurn(20) },
    filledBy: { backgroundEconomy: perTurn(20) },
  },
];

const markets = Object.fromEntries(books.map((b) => [b.countryId, fundedCountryMarket(b)]));
const display = (m: FundedCountryMarket) => marketPerTurn(m);

describe("market rows add up to the totals shown", () => {
  it("a country view: sellers, buyers and receivers each add up, in turns", () => {
    const us = display(markets.US!);
    const rows = marketRows(us, { world: false })!;
    expect(rowsTotal(rows.supply.rows)).toBeCloseTo(us.supply, 2);
    expect(rowsTotal(rows.demand.rows)).toBeCloseTo(us.demand, 2);
    expect(rowsTotal(rows.received!.rows)).toBeCloseTo(us.filled!, 2);
    expect(rows.supply.rows.map((r) => r.label)).toEqual([
      "Player and AI companies",
      "Background economy (sellers)",
    ]);
    expect(rows.demand.rows.map((r) => r.label)).toContain("Background economy (buyers)");
    // Unit check: shown per turn, stored daily (24 turns).
    expect(us.supply * TURNS_PER_DAY).toBeCloseTo(books[0]!.supply, 6);
    expect(us.supply).toBe(110);
  });

  it("the supply and demand bar: its parts add up to supply plus imports and demand plus exports", () => {
    const us = display(markets.US!);
    const parts = balanceParts({ supply: us.supply, demand: us.demand, market: us, world: false });
    const trade = fundedCountryTradeTotals(us);
    expect(sum(parts.supplyParts)).toBeCloseTo(trade.supply, 2);
    expect(sum(parts.demandParts)).toBeCloseTo(trade.demand, 2);
    expect(sum(parts.receivedParts!)).toBeCloseTo(us.filled!, 2);
    expect(parts.supplyParts.map((p) => p.label)).toEqual([
      "Player and AI companies",
      "Background economy (sellers)",
      "Imports",
    ]);
    expect(parts.demandParts.map((p) => p.label)).toEqual([
      "Player and AI companies",
      "Households",
      "Background economy (buyers)",
      "Substitution orders",
      "Exports",
    ]);
  });

  it("the world view: country books add up, and trade between countries nets out", () => {
    const world = display(worldFundedMarket(markets));
    const rows = marketRows(world, { world: true })!;
    expect(world.supply).toBe(150);
    expect(rowsTotal(rows.supply.rows)).toBeCloseTo(world.supply, 2);
    expect(rowsTotal(rows.demand.rows)).toBeCloseTo(world.demand, 2);
    expect(rows.supply.rows.map((r) => r.label)).toEqual([
      "Player and AI companies",
      "Background economy (countries without companies)",
      "Background economy (sellers)",
    ]);
    expect(rows.imports).toBeNull();
  });

  it("producer and consumer lists: listed companies plus the other rows equal the market totals", () => {
    const us = display(markets.US!);
    const producers = [{ units: 60 }, { units: 30 }]; // 10 units of companies not listed
    const extra = listRowsWithOthers(producers, us.supplyBy, "sellers")!;
    expect(sum(producers) + sum(extra)).toBeCloseTo(us.supply, 2);
    expect(extra.map((r) => r.label)).toEqual(["Other companies", "Background economy (sellers)"]);
    const consumers = [{ units: 90 }];
    const buyers = listRowsWithOthers(consumers, us.demandBy, "buyers")!;
    expect(sum(consumers) + sum(buyers)).toBeCloseTo(us.demand, 2);
  });

  it("the commodity page payload: every quantity is per turn and the world rows add up", () => {
    const detail = commodityDetailPerTurn({
      globalSupply: perTurn(150),
      globalDemand: perTurn(150),
      stateSupply: {},
      stateDemand: {},
      fundedCountryBooks: markets,
      worldMarket: worldFundedMarket(markets),
      history: [],
      syntheticDemandSources: [],
      demandDriver: null,
    });
    expect(detail.worldMarket!.supply).toBe(150);
    expect(detail.fundedCountryBooks!.US!.supplyBy).toEqual({ company: 100, wideEconomy: 10 });
    const world = marketRows(detail.worldMarket, { world: true })!;
    expect(rowsTotal(world.received!.rows)).toBeCloseTo(detail.worldMarket!.filled!, 2);
  });

  it("one world supply figure: the page, its strip and its chart show the traded total, not the pricing input", () => {
    const world = worldFundedMarket(markets);
    // The stored price row leaves out what the background economy sold (10 a turn in the US).
    const stored = { supply: world.supply - perTurn(10), demand: world.demand };
    const figures = worldSupplyFigures(stored, world);
    const flows = flowsFromWorldMarket(
      {
        clearedUnits: stored.supply,
        clearedUnitsPooled: stored.supply,
        unmetDemandUnits: 0,
        unmetDemandUnitsPooled: 0,
        surplusUnits: 0,
        surplusUnitsPooled: 0,
        stockUnits: null,
      },
      world
    );
    const detail = commodityDetailPerTurn({
      ...figures,
      stateSupply: {},
      stateDemand: {},
      fundedCountryBooks: markets,
      worldMarket: world,
      flows,
      history: [{ supply: world.supply, demand: world.demand }],
      syntheticDemandSources: [],
      demandDriver: null,
    });
    const shown = detail.worldMarket!;
    // Every world supply figure on the page is the same number...
    expect(detail.globalSupply).toBe(150);
    expect(shown.supply).toBe(detail.globalSupply);
    expect(detail.history[0]!.supply).toBe(detail.globalSupply);
    expect(detail.flows!.clearedUnitsPooled + detail.flows!.surplusUnitsPooled).toBeCloseTo(
      detail.globalSupply,
      2
    );
    // ...its rows add up to it exactly, the background economy named apart...
    const rows = marketRows(shown, { world: true })!;
    expect(rowsTotal(rows.supply.rows)).toBeCloseTo(detail.globalSupply, 6);
    expect(Object.fromEntries(rows.supply.rows.map((r) => [r.label, r.units]))).toEqual({
      "Player and AI companies": 100,
      "Background economy (countries without companies)": 40,
      "Background economy (sellers)": 10,
    });
    // ...and the pricing input is kept apart, per turn like the rest.
    expect(detail.pricingSupply).toBe(140);
    expect(detail.globalSupply * TURNS_PER_DAY).toBeCloseTo(world.supply, 6);
  });

  it("the premium sentence says the price reads supply without background sales", () => {
    const breakdown = buildScarcityBreakdown({
      scarcityMult: 1.2,
      previousScarcityMult: 1.18,
      supply: 140,
      demand: 150,
      shownSupply: 150,
      attribution: {
        appliedPrice: 300,
        realBasePrice: 150,
        nominalInflation: 0,
        scarcityMemory: 30,
        producerInputCostPassThrough: 0,
      },
    })!;
    expect(breakdown.pricingLeavesOutBackground).toBe(true);
    expect(
      premiumTrendSentence(
        breakdown.pressure,
        breakdown.maxMovePerTurn,
        breakdown.pricingLeavesOutBackground
      )
    ).toMatch(/^The premium reads supply without what the background economy sold\. Demand/);
  });

  it("old stock: the company row splits into new output and stock, and still adds up", () => {
    const us = { ...display(markets.US!), carriedStock: 30 };
    const rows = marketRows(us, { world: false })!;
    expect(rowsTotal(rows.supply.rows)).toBeCloseTo(us.supply, 9);
    expect(rows.supply.rows.map((r) => [r.label, r.units])).toEqual([
      [NEW_OUTPUT_LABEL, 70],
      [CARRIED_STOCK_LABEL, 30],
      ["Background economy (sellers)", 10],
    ]);
  });

  it("old stock: a market is oversupplied only when new output exceeds orders", () => {
    // 150 offered against 100 ordered, but 60 of it is old stock: new output is 90% of orders.
    const b = newOutputBalance({ supply: 150, demand: 100, carriedStock: 60 });
    expect(b).toEqual({ newSupply: 90, stock: 60, newRatio: 0.9, totalRatio: 1.5 });
    // Stock is never more than the supply it is part of.
    expect(newOutputBalance({ supply: 10, demand: 10, carriedStock: 50 }).stock).toBe(10);
  });
});
