import { describe, expect, it } from "vitest";
import { producerTrades, settleProducerMarket, type PurchaseOrder } from "./rules";
import { markHomeCountryFirst, publicHomeFirstOn } from "./publicHomeFirstRules";

const tradeUnits = (receipt: Parameters<typeof producerTrades>[0]) => {
  const byOffer = new Map<string, number>();
  for (const trade of producerTrades(receipt))
    byOffer.set(trade.offerId, (byOffer.get(trade.offerId) ?? 0) + trade.units);
  return byOffer;
};

// The live shape: two governments on one scarce world book. The foreign
// order's id sorts first, as "AT" sorts before "US".
const market = (orders: PurchaseOrder[]) =>
  settleProducerMarket({
    turn: 1,
    trackCountryBooks: true,
    accounts: [
      { id: "gov-at", cash: 10_000 },
      { id: "gov-us", cash: 10_000 },
      { id: "maker-us", cash: 0 },
      { id: "maker-jp", cash: 0 },
    ],
    offers: [
      {
        id: "offer-us",
        accountId: "maker-us",
        commodity: "ordnance",
        book: "world",
        units: 60,
        unitPrice: 10,
        countryId: "US",
      },
      {
        id: "offer-jp",
        accountId: "maker-jp",
        commodity: "ordnance",
        book: "world",
        units: 20,
        unitPrice: 12,
        countryId: "JP",
      },
    ],
    orders,
  });

const orders = (): PurchaseOrder[] => [
  {
    id: "public:AT:ordnance:world",
    accountId: "gov-at",
    commodity: "ordnance",
    book: "world",
    units: 70,
    maximumUnitPrice: 50,
    maximumSpend: 5_000,
    countryId: "AT",
  },
  {
    id: "public:US:ordnance:world",
    accountId: "gov-us",
    commodity: "ordnance",
    book: "world",
    units: 50,
    maximumUnitPrice: 50,
    maximumSpend: 5_000,
    countryId: "US",
  },
];

describe("publicHomeFirstOn", () => {
  it("is off when absent or 0", () => {
    expect(publicHomeFirstOn(undefined)).toBe(false);
    expect(publicHomeFirstOn(0)).toBe(false);
    expect(publicHomeFirstOn(1)).toBe(true);
  });
});

describe("markHomeCountryFirst", () => {
  it("flags world-book orders that name a country only", () => {
    const marked = markHomeCountryFirst([
      ...orders(),
      {
        id: "public:US:healthcare_services:state:CA",
        accountId: "gov-us",
        commodity: "healthcare_services",
        book: "state:CA",
        units: 1,
        maximumUnitPrice: 1,
        countryId: "US",
      },
      {
        id: "public:XX:ordnance:world",
        accountId: "gov-us",
        commodity: "ordnance",
        book: "world",
        units: 1,
        maximumUnitPrice: 1,
      },
    ]);
    expect(marked.map((o) => o.homeCountryFirst ?? false)).toEqual([true, true, false, false]);
  });
});

describe("home-country-first public clearing", () => {
  it("without the flag, the order sorted first buys out the home country's sellers", () => {
    const result = market(orders());
    const us = result.orders.find((o) => o.id === "public:US:ordnance:world")!;
    expect(us.deliveredUnits).toBe(10);
    expect(tradeUnits(result.tradeReceipt).get("offer-us")).toBe(60);
  });

  it("with the flag, each government takes its own country's sellers first", () => {
    const result = market(markHomeCountryFirst(orders()));
    const at = result.orders.find((o) => o.id === "public:AT:ordnance:world")!;
    const us = result.orders.find((o) => o.id === "public:US:ordnance:world")!;
    expect(us).toMatchObject({ deliveredUnits: 50, cost: 500 });
    // AT has no home sellers: it takes the US residual, then Japan.
    expect(at).toMatchObject({ deliveredUnits: 30, cost: 340 });
    const units = tradeUnits(result.tradeReceipt);
    expect(units.get("offer-us")).toBe(60);
    expect(units.get("offer-jp")).toBe(20);
    const homeFill = result.tradeReceipt.fills.find((f) => f.homeCountry);
    expect(homeFill).toMatchObject({
      orderId: "public:US:ordnance:world",
      units: 50,
      sellerCountry: "US",
    });
    // Cash is conserved and the receipt replays to the same sellers.
    const cash = Object.fromEntries(result.accounts.map((a) => [a.id, a.cash]));
    expect(cash["maker-us"]).toBe(600);
    expect(cash["maker-jp"]).toBe(240);
    expect(cash["gov-us"] + cash["gov-at"]).toBe(20_000 - 840);
  });

  it("respects the order's limit price and spending limit on the home pass", () => {
    const [at, us] = orders();
    const result = market(
      markHomeCountryFirst([
        at,
        { ...us, maximumUnitPrice: 9 },
        { ...us, id: "b", maximumSpend: 100 },
      ])
    );
    expect(result.orders.find((o) => o.id === "public:US:ordnance:world")!.deliveredUnits).toBe(0);
    expect(result.orders.find((o) => o.id === "b")).toMatchObject({
      deliveredUnits: 10,
      cost: 100,
    });
  });

  it("honours a shared spend group on the home pass", () => {
    const [at, us] = orders();
    const spendGroup = { id: "us-ladder", maximumSpend: 300 };
    const result = market(
      markHomeCountryFirst([
        at,
        { ...us, spendGroup },
        { ...us, id: "public:US:ordnance:world:low", maximumUnitPrice: 10, spendGroup },
      ])
    );
    const usCost = result.orders
      .filter((o) => o.id.startsWith("public:US"))
      .reduce((sum, o) => sum + o.cost, 0);
    expect(usCost).toBe(300);
    expect(
      result.tradeReceipt.fills.filter((f) => f.homeCountry).reduce((n, f) => n + f.units, 0)
    ).toBe(30);
  });

  it("is byte-identical with no flagged order", () => {
    const a = market(orders());
    const b = market(orders().map((o) => ({ ...o, homeCountryFirst: undefined })));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
