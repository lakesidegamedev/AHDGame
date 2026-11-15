import { describe, expect, it } from "vitest";
import { buildTradeAffinity } from "@/lib/trade/tradeAffinity";
import type { CommodityType } from "@/lib/constants/commodities";
import type { Tariff } from "@/lib/db/types/tariff";
import type { TradeEmbargo } from "@/lib/db/types/tradeEmbargo";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import {
  producerTrades,
  type MarketAccount,
  type ProducerOffer,
  type PurchaseOrder,
} from "./rules";
import { routeEligibility } from "./routeRules";
import {
  fundedTariffs,
  importTariffKey,
  importTariffRate,
  importTariffTable,
  landedPriceGate,
  type ImportTariffTable,
} from "./tariffRules";

// A US mill makes 10 steel a turn from 10 iron, paying at most 2 for iron.
// France sells iron at 1 and wants steel; a US mine sells iron at 1.5.
const mill: ProductionPlan = {
  id: "us-mill",
  accountId: "us-corp",
  capacityUnits: 10,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 10,
  otherOperatingCost: 5,
  labourRecipientAccountId: "us-households",
  operatingRecipientAccountId: "us-services",
  inputs: [{ commodity: "iron", unitsPerOutput: 1, book: "world", maximumUnitPrice: 2 }],
  outputs: [
    {
      commodity: "steel",
      unitsPerOutput: 1,
      book: "world",
      policy: { kind: "manual", unitPrice: 8 },
      referenceUnitPrice: 8,
      storable: false,
    },
  ],
  inputStock: [],
  outputStock: [],
};
const frIron: ProducerOffer = {
  id: "fr-iron",
  accountId: "fr-wallet",
  commodity: "iron",
  book: "world",
  units: 6,
  unitPrice: 1,
  countryId: "FR",
};
const usIron: ProducerOffer = {
  id: "us-iron",
  accountId: "us-mine",
  commodity: "iron",
  book: "world",
  units: 20,
  unitPrice: 1.5,
  countryId: "US",
};
const frSteel: PurchaseOrder = {
  id: "fr-steel",
  accountId: "fr-wallet",
  commodity: "steel",
  book: "world",
  units: 4,
  maximumUnitPrice: 10,
  maximumSpend: 40,
  countryId: "FR",
};
const opening: MarketAccount[] = [
  { id: "us-corp", cash: 1000 },
  { id: "us-mine", cash: 0 },
  { id: "us-households", cash: 0 },
  { id: "us-services", cash: 0 },
  { id: "fr-wallet", cash: 40 },
];

function settle(importTariffs?: ImportTariffTable) {
  return advanceProducerEconomy({
    turn: 7,
    accounts: opening,
    producers: [mill],
    externalOffers: [frIron, usIron],
    externalOrders: [frSteel],
    countryOfProducer: () => "US",
    ...(importTariffs ? { importTariffs } : {}),
  });
}

const bought = (result: ReturnType<typeof settle>, seller: string) =>
  [...producerTrades(result.tradeReceipt)]
    .filter((t) => t.sellerAccountId === seller && t.buyerAccountId === "us-corp")
    .reduce((n, t) => n + t.units, 0);

const table = (rates: Record<string, number>): ImportTariffTable =>
  Object.fromEntries(
    Object.entries(rates).map(([route, rate]) => {
      const [c, e, i] = route.split(">");
      return [importTariffKey(c, e, i), rate];
    })
  );

describe("import tariff table", () => {
  it("keeps only open routes with a positive tariff, never a domestic one", () => {
    const t = importTariffTable({
      sellerCountriesByCommodity: new Map([
        ["iron", new Set(["FR", "US", "RU"])],
        ["steel", new Set(["US"])],
      ]),
      buyerCountries: new Set(["US", "FR", "RU"]),
      importCostMultiplier: (c, _e, i) => (i === "US" && c === "iron" ? 1.25 : 1),
      open: (_c, e, i) => !(e === "RU" && i === "US"),
    });
    expect(t).toEqual({ [importTariffKey("iron", "FR", "US")]: 0.25 });
    expect(importTariffRate(t, "iron", "FR", "US")).toBe(0.25);
    expect(importTariffRate(t, "iron", "US", "US")).toBe(0);
    expect(importTariffRate(t, "iron", undefined, "US")).toBe(0);
  });

  it("reads country-wide, sector and targeted tariffs from the trade system", () => {
    const tariffs = [
      { countryId: "US", scopeType: "economy_wide", rate: 10 },
      { countryId: "US", scopeType: "origin_country", targetOriginCountryId: "CN", rate: 25 },
    ] as unknown as Tariff[];
    const fns = buildTradeAffinity({
      ftaPairs: new Set(),
      blocsByCountry: new Map(),
      tariffs,
      embargoes: [],
    });
    const t = importTariffTable({
      sellerCountriesByCommodity: new Map([["iron", new Set(["CN", "FR"])]]),
      buyerCountries: new Set(["US"]),
      importCostMultiplier: (c, e, i) =>
        fns.importCostMultiplierFor(c as CommodityType, e as never, i as never),
      open: (c, e, i) => fns.affinityFor(c as CommodityType, e as never, i as never) > 0,
    });
    expect(importTariffRate(t, "iron", "FR", "US")).toBeCloseTo(0.1, 12);
    expect(importTariffRate(t, "iron", "CN", "US")).toBeCloseTo(0.35, 12);
  });
});

describe("landed-price gate", () => {
  const order: PurchaseOrder = {
    id: "o",
    accountId: "buyer",
    commodity: "iron",
    book: "world",
    units: 5,
    maximumUnitPrice: 2,
    countryId: "US",
  };

  it("drops an import whose landed price passes the buyer's limit", () => {
    const gate = landedPriceGate([frIron, usIron], table({ "iron>FR>US": 1.5 }));
    const [gated] = gate([order]);
    expect(gated.eligibleOfferIds).toEqual(["us-iron"]);
  });

  it("leaves an affordable import, a buyer's own site and agreed prices alone", () => {
    const gate = landedPriceGate([frIron, usIron], table({ "iron>FR>US": 0.5 }));
    expect(gate([order])[0]).toBe(order);
    const dear = landedPriceGate([frIron, usIron], table({ "iron>FR>US": 3 }));
    const own = { ...order, accountId: "fr-wallet" };
    expect(dear([own])[0]).toBe(own);
    const contract = { ...order, contractUnitPrice: 1, supplierOfferId: "fr-iron" };
    expect(dear([contract])[0]).toBe(contract);
    const stateless = { ...order, countryId: undefined };
    expect(dear([stateless])[0]).toBe(stateless);
  });

  it("narrows an existing route list and shares lists between equal orders", () => {
    const gate = landedPriceGate([frIron, usIron], table({ "iron>FR>US": 3 }));
    const routed = { ...order, eligibleOfferIds: ["fr-iron", "us-iron"] };
    const [a, b] = gate([routed, { ...routed, id: "o2" }]);
    expect(a.eligibleOfferIds).toEqual(["us-iron"]);
    expect(b.eligibleOfferIds).toBe(a.eligibleOfferIds);
    const already = { ...order, eligibleOfferIds: ["us-iron"] };
    expect(gate([already])[0]).toBe(already);
  });
});

describe("tariffs in a funded market", () => {
  it("with no tariff the clearing is byte-identical to a market without the table", () => {
    const off = JSON.stringify(settle());
    expect(JSON.stringify(settle({}))).toBe(off);
    expect(JSON.stringify(settle(table({ "iron>FR>RU": 0.5 })))).toBe(off);
  });

  it("a prohibitive tariff turns the mill to home iron", () => {
    const free = settle();
    expect(bought(free, "fr-wallet")).toBeCloseTo(6, 9);
    const walled = settle(table({ "iron>FR>US": 1.5 }));
    expect(bought(walled, "fr-wallet")).toBe(0);
    expect(bought(walled, "us-mine")).toBeCloseTo(10, 9);
  });

  it("an affordable tariff moves revenue to the importer and conserves money", () => {
    const rates = table({ "iron>FR>US": 0.5, "steel>US>FR": 0.25 });
    const result = settle(rates);
    const trades = [...producerTrades(result.tradeReceipt)];
    const collector = (c: string) => `tariff:${c}`;
    const cash = new Map(result.accounts.map((a) => [a.id, a.cash]));
    const due = fundedTariffs({
      trades,
      table: rates,
      collectorOf: collector,
      cashOf: (id) => cash.get(id) ?? 0,
    });
    const frIronValue = trades
      .filter((t) => t.sellerAccountId === "fr-wallet")
      .reduce((n, t) => n + t.amount, 0);
    const usSteelValue = trades
      .filter((t) => t.buyerAccountId === "fr-wallet")
      .reduce((n, t) => n + t.amount, 0);
    expect(frIronValue).toBeGreaterThan(0);
    expect(usSteelValue).toBeGreaterThan(0);
    expect(due.collectedByImporter.get("US")).toBeCloseTo(frIronValue * 0.5, 9);
    expect(due.paidByAccount.get("us-corp")).toBeCloseTo(frIronValue * 0.5, 9);
    expect(due.shortfall).toBe(0);
    // France had spent its whole budget on steel, so it pays what it has left.
    const frLeft = cash.get("fr-wallet")!;
    expect(due.collectedByImporter.get("FR") ?? 0).toBeCloseTo(
      Math.min(frLeft, usSteelValue * 0.25),
      9
    );
    // Money is moved, never created: market plus transfers sum to the opening.
    for (const t of due.transfers) {
      cash.set(t.fromAccountId, cash.get(t.fromAccountId)! - t.amount);
      cash.set(t.toAccountId, (cash.get(t.toAccountId) ?? 0) + t.amount);
    }
    const sum = (xs: Iterable<number>) => [...xs].reduce((n, x) => n + x, 0);
    expect(sum(cash.values())).toBeCloseTo(sum(opening.map((a) => a.cash)), 9);
    expect([...cash.values()].every((x) => x >= -1e-9)).toBe(true);
  });

  it("never charges more than the buyer holds and counts the rest as shortfall", () => {
    const due = fundedTariffs({
      trades: [
        {
          kind: "sale",
          buyerAccountId: "b",
          commodity: "iron",
          amount: 100,
          sellerCountry: "FR",
          buyerCountry: "US",
        },
        {
          kind: "internalTransfer",
          buyerAccountId: "b",
          commodity: "iron",
          amount: 100,
          sellerCountry: "FR",
          buyerCountry: "US",
        },
      ],
      table: table({ "iron>FR>US": 0.5 }),
      collectorOf: () => "t",
      cashOf: () => 20,
    });
    expect(due.transfers).toEqual([
      { fromAccountId: "b", toAccountId: "t", amount: 20, importer: "US", commodity: "iron" },
    ]);
    expect(due.shortfall).toBeCloseTo(30, 12);
  });
});

describe("embargoes and blockades close funded routes", () => {
  const offers = [
    { id: "fr-iron", commodity: "iron", sellerCountry: "FR" },
    { id: "us-iron", commodity: "iron", sellerCountry: "US" },
  ];
  const base = { ftaPairs: new Set<string>(), blocsByCountry: new Map(), tariffs: [] };
  const routesFor = (fns: ReturnType<typeof buildTradeAffinity>) =>
    routeEligibility(
      [{ id: "o", commodity: "iron", buyerCountry: "US" }],
      offers,
      (c, e, i) => fns.affinityFor(c as CommodityType, e as never, i as never) > 0
    );

  it("a targeted embargo blocks the import and leaves no tariff on it", () => {
    const embargoes = [
      {
        sourceCountry: "US",
        targetCountry: "FR",
        commodity: "iron",
        direction: "import",
        mode: "block",
      },
    ] as unknown as TradeEmbargo[];
    const fns = buildTradeAffinity({ ...base, embargoes });
    expect(routesFor(fns).o).toEqual(["us-iron"]);
    const t = importTariffTable({
      sellerCountriesByCommodity: new Map([["iron", new Set(["FR"])]]),
      buyerCountries: new Set(["US"]),
      importCostMultiplier: () => 1.5,
      open: (c, e, i) => fns.affinityFor(c as CommodityType, e as never, i as never) > 0,
    });
    expect(t).toEqual({});
  });

  it("a full blockade of either end closes the route; a partial one does not", () => {
    const full = buildTradeAffinity({
      ...base,
      embargoes: [],
      blockadeClosure: new Map([["FR", 1]]),
    });
    expect(routesFor(full).o).toEqual(["us-iron"]);
    const partial = buildTradeAffinity({
      ...base,
      embargoes: [],
      blockadeClosure: new Map([["FR", 0.5]]),
    });
    expect(routesFor(partial).o).toBeUndefined();
  });
});
