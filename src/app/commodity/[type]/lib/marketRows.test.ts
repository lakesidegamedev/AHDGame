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
import { balanceParts, listRowsWithOthers, marketRows, rowsTotal } from "./marketRows";

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
      "Companies",
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
      "Companies",
      "Background economy (sellers)",
      "Imports",
    ]);
    expect(parts.demandParts.map((p) => p.label)).toEqual([
      "Companies",
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
      "Companies",
      "Economy-only countries",
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
});
