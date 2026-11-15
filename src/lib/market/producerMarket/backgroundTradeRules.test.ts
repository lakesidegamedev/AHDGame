import { describe, expect, it } from "vitest";
import {
  backgroundFundingByAccount,
  backgroundOfferId,
  backgroundOrderEligibility,
  backgroundOrderId,
  backgroundTradeLines,
  backgroundTradeOutcomes,
  isBackgroundTradable,
} from "./backgroundTradeRules";
import { fundedLedgerRows, fundedLedgers } from "./fundedLedgerRules";
import {
  backgroundFundingMoves,
  backgroundReturnMoves,
  producerMoveLedgerLegs,
} from "./liveFundingRules";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import { producerFillSpend, producerTrades, type MarketAccount } from "./rules";
import { routeEligibility, type RouteOpen } from "./routeRules";

const FR = "FR-wallet";
const price: Record<string, number> = { iron: 1, steel: 8 };
const refPrice = (c: string) => price[c] ?? null;

// A US mill makes 10 steel a turn from 10 iron; France (a background country)
// offers iron and wants steel.
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
const millOffer = { id: JSON.stringify(["us-mill", "output", "steel"]), sellerCountry: "US" };
const millInput = JSON.stringify(["us-mill", "input", "iron"]);

// France's contribution on the price phase's basis: 4 per turn at a divisor of 4
// is 1 settlement unit; here the divisor is 1 so the numbers read directly.
const france = backgroundTradeLines({
  economies: [
    {
      countryId: "FR",
      accountId: FR,
      byCommodity: {
        iron: { supply: 100, demand: 0 },
        steel: { supply: 0, demand: 5 },
        // Local services and the per-country service books never cross a border.
        healthcare_services: { supply: 50, demand: 50 },
        freight: { supply: 50, demand: 50 },
      },
    },
  ],
  referencePrice: refPrice,
  priceHeadroom: 1.25,
  unitsPerTurnDivisor: 1,
});

function settle(open: RouteOpen | null) {
  const routeOffers = [
    { id: millOffer.id, commodity: "steel", sellerCountry: "US" },
    ...france.offers.map((o) => ({ id: o.id, commodity: o.commodity, sellerCountry: "FR" })),
  ];
  const eligible = backgroundOrderEligibility(france.orders, routeOffers, open);
  const orders = france.orders.map((o) => ({ ...o, eligibleOfferIds: eligible.get(o.id) ?? [] }));
  const funding = backgroundFundingByAccount(orders).get(FR) ?? 0;
  const accounts: MarketAccount[] = [
    { id: "us-corp", cash: 1000 },
    { id: "us-households", cash: 0 },
    { id: "us-services", cash: 0 },
    { id: FR, cash: funding },
  ];
  const result = advanceProducerEconomy({
    turn: 3,
    accounts,
    producers: [mill],
    externalOffers: france.offers,
    externalOrders: orders,
    // The mill's input order reaches France only on an open route.
    ...(open
      ? {
          eligibleOffersByOrder: routeEligibility(
            [{ id: millInput, commodity: "iron", buyerCountry: "US" }],
            routeOffers,
            open
          ),
        }
      : {}),
  });
  return { accounts, result, orders, funding };
}

describe("background country trade lines", () => {
  it("posts only goods that cross borders, at reference prices, per settlement turn", () => {
    expect(isBackgroundTradable("iron")).toBe(true);
    expect(isBackgroundTradable("freight")).toBe(false);
    expect(isBackgroundTradable("healthcare_services")).toBe(false);
    expect(france.offers).toEqual([
      {
        id: backgroundOfferId("FR", "iron"),
        accountId: FR,
        commodity: "iron",
        book: "world",
        units: 100,
        unitPrice: 1,
        countryId: "FR",
      },
    ]);
    expect(france.orders).toEqual([
      {
        id: backgroundOrderId("FR", "steel"),
        accountId: FR,
        commodity: "steel",
        book: "world",
        units: 5,
        maximumUnitPrice: 10,
        maximumSpend: 40,
        countryId: "FR",
      },
    ]);
    const perTurn = backgroundTradeLines({
      economies: [
        { countryId: "FR", accountId: FR, byCommodity: { iron: { supply: 8, demand: 4 } } },
      ],
      referencePrice: refPrice,
      priceHeadroom: 1.25,
      unitsPerTurnDivisor: 4,
    });
    expect(perTurn.offers[0].units).toBe(2);
    expect(perTurn.orders[0].units).toBe(1);
  });

  it("is empty without background countries", () => {
    expect(
      backgroundTradeLines({
        economies: [],
        referencePrice: refPrice,
        priceHeadroom: 1.25,
        unitsPerTurnDivisor: 4,
      })
    ).toEqual({ offers: [], orders: [] });
  });

  it("never lets a background country buy its own offer, and respects closed routes", () => {
    const orders = [
      { ...france.orders[0] },
      {
        id: backgroundOrderId("FR", "iron"),
        accountId: FR,
        commodity: "iron",
        book: "world",
        units: 1,
        maximumUnitPrice: 2,
        countryId: "FR",
      },
    ];
    const offers = [
      { id: "us-steel", commodity: "steel", sellerCountry: "US" },
      { id: "de-steel", commodity: "steel", sellerCountry: "DE" },
      { id: backgroundOfferId("FR", "iron"), commodity: "iron", sellerCountry: "FR" },
    ];
    const all = backgroundOrderEligibility(orders, offers, null);
    expect(all.get(orders[0].id)).toEqual(["de-steel", "us-steel"]);
    expect(all.get(orders[1].id)).toEqual([]);
    const embargo = backgroundOrderEligibility(orders, offers, (_c, from) => from !== "US");
    expect(embargo.get(orders[0].id)).toEqual(["de-steel"]);
  });
});

describe("a background country in a funded market", () => {
  it("sells into and buys from the US book, and money is conserved", () => {
    const { accounts, result, orders, funding } = settle(() => true);
    const trades = [...producerTrades(result.tradeReceipt)];
    const sold = trades.filter((t) => t.sellerAccountId === FR);
    const bought = trades.filter((t) => t.buyerAccountId === FR);
    // The US mill bought French iron for its run and sold France steel.
    expect(sold.reduce((n, t) => n + t.units, 0)).toBeGreaterThan(0);
    expect(sold.every((t) => t.buyerAccountId === "us-corp" && t.commodity === "iron")).toBe(true);
    expect(bought.reduce((n, t) => n + t.units, 0)).toBeCloseTo(5);
    expect(bought.every((t) => t.sellerAccountId === "us-corp")).toBe(true);
    // The market only moves money between its participants.
    const total = (rows: readonly MarketAccount[]) => rows.reduce((n, r) => n + r.cash, 0);
    expect(total(result.accounts)).toBeCloseTo(total(accounts), 9);

    // What the wallet read back is exactly what the trades say.
    const outcome = backgroundTradeOutcomes({
      economies: [{ countryId: "FR", accountId: FR }],
      offers: france.offers,
      orders,
      openingCash: new Map(accounts.map((a) => [a.id, a.cash])),
      closingCash: new Map(result.accounts.map((a) => [a.id, a.cash])),
      fills: producerFillSpend(result.tradeReceipt),
    }).get("FR")!;
    expect(outcome.soldValue).toBeCloseTo(
      sold.reduce((n, t) => n + t.amount, 0),
      9
    );
    expect(outcome.boughtValue).toBeCloseTo(
      bought.reduce((n, t) => n + t.amount, 0),
      9
    );
    expect(outcome.offeredValue).toBe(100);
    expect(outcome.requestedValue).toBe(40);

    // Mint in, burn out: the wallet's budget plus its export receipts less its
    // imports is exactly what is burned at close, so it ends the turn empty.
    const closing = result.accounts.find((a) => a.id === FR)!.cash;
    expect(closing).toBeCloseTo(funding - outcome.boughtValue + outcome.soldValue, 9);
    const row = { countryId: "FR", walletId: FR, currencyCode: "EUR", localPerAnchor: 0.9 };
    const mint = backgroundFundingMoves("w", 3, [{ ...row, amountLocal: funding * 0.9 }]);
    const burn = backgroundReturnMoves("w", 3, [{ ...row, amountLocal: closing * 0.9 }]);
    for (const move of [...mint, ...burn]) {
      const legs = producerMoveLedgerLegs(move)!;
      expect(legs.reduce((n, leg) => n + leg.anchorAmount, 0)).toBeCloseTo(0, 9);
    }
    expect(mint[0].legs[1]).toMatchObject({ kind: "credit", filter: { _id: FR } });
    expect(burn[0].legs[0]).toMatchObject({ kind: "debit", filter: { _id: FR } });
  });

  it("an embargo blocks both directions", () => {
    const closed: RouteOpen = (_c, from, to) =>
      !((from === "US" && to === "FR") || (from === "FR" && to === "US"));
    const { result, funding } = settle(closed);
    const trades = [...producerTrades(result.tradeReceipt)];
    expect(trades.filter((t) => t.sellerAccountId === FR || t.buyerAccountId === FR)).toEqual([]);
    expect(result.accounts.find((a) => a.id === FR)!.cash).toBeCloseTo(funding, 9);
  });

  it("lands in its own national book on the price phase's basis", () => {
    const rows = fundedLedgerRows({
      outcomes: [{ commodity: "steel", book: "world", accountId: FR, requestedUnits: 5 }],
      products: [
        { producerId: FR, commodity: "iron", book: "world", offeredUnits: 100, countryId: "FR" },
        { producerId: "us-mill", commodity: "steel", book: "world", offeredUnits: 10 },
      ],
      stateOfAccount: () => null,
      countryOfAccount: (id) => (id === FR ? "FR" : null),
      stateOfProducer: (id) => (id === "us-mill" ? "US-PA" : null),
      unitScale: 4,
    });
    const books = fundedLedgers(rows);
    expect(books.global.get("iron")).toEqual({ supply: 400, demand: 0 });
    expect(books.statelessByCountry.get("FR")?.get("iron")).toEqual({ supply: 400, demand: 0 });
    expect(books.statelessByCountry.get("FR")?.get("steel")).toEqual({ supply: 0, demand: 20 });
    expect(books.byState.get("US-PA")?.get("steel")).toEqual({ supply: 40, demand: 0 });
  });
});
