import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import type { ProducerOffer, PurchaseOrder } from "./producerQuotes";
import {
  residualWideEconomyBuyers,
  wideEconomyFallbackOffers,
  wideEconomyFillBook,
  withWideEconomyFallback,
} from "./wideEconomyRules";
import { laneKeyOf } from "./laneKey";

const WIDE = "wide:US";

const stockOnly = (
  id: string,
  commodity: string,
  units: number,
  price: number
): ProductionPlan => ({
  id,
  accountId: `${id}-corp`,
  capacityUnits: 0,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 0,
  otherOperatingCost: 0,
  labourRecipientAccountId: "households",
  operatingRecipientAccountId: "services",
  inputs: [],
  outputs: [
    {
      commodity,
      book: "world",
      unitsPerOutput: 0,
      referenceUnitPrice: price,
      retainedUnitCost: 1,
      policy: { kind: "manual", unitPrice: price },
      storable: true,
    },
  ],
  inputStock: [],
  outputStock: [{ commodity, book: "world", units, quoteUnitCost: 1 }],
});

const realOrder = (commodity: string, units: number, price: number): PurchaseOrder => ({
  id: `buyer-${commodity}`,
  accountId: "buyer",
  commodity,
  book: "world",
  units,
  maximumUnitPrice: price,
  countryId: "US",
});

const wideSeller = (commodity: string, units: number, price: number): ProducerOffer => ({
  id: JSON.stringify(["wide", "offer", "US", commodity, "world"]),
  accountId: WIDE,
  commodity,
  book: "world",
  units,
  unitPrice: price,
  countryId: "US",
});

const wideBuyer = (commodity: string, units: number, price: number): PurchaseOrder => ({
  id: JSON.stringify(["wide", "US", commodity, "world"]),
  accountId: WIDE,
  commodity,
  book: "world",
  units,
  maximumUnitPrice: price,
  maximumSpend: units * price,
  countryId: "US",
  demandStep: 1,
});

/**
 * Steel is short (2 units in stock, 10 ordered); food has stock to spare
 * (1000 in stock, 100 ordered). The buyer holds `buyerCash`.
 */
const run = (
  options: {
    sellers?: ProducerOffer[];
    buyers?: PurchaseOrder[];
    buyerCash?: number;
    foodOrdered?: number;
  } = {}
) =>
  advanceProducerEconomy({
    turn: 1,
    accounts: [
      { id: "scarce-corp", cash: 0 },
      { id: "plenty-corp", cash: 0 },
      { id: "buyer", cash: options.buyerCash ?? 1000 },
      { id: WIDE, cash: 250 },
      { id: "households", cash: 0 },
      { id: "services", cash: 0 },
    ],
    carryLossByCommodity: { steel: 0, food: 0 },
    producers: [stockOnly("scarce", "steel", 2, 10), stockOnly("plenty", "food", 1000, 5)],
    externalOrders: [realOrder("steel", 10, 12), realOrder("food", options.foodOrdered ?? 100, 6)],
    trackCountryBooks: true,
    ...(options.sellers ? { residualOffers: options.sellers } : {}),
    ...(options.buyers ? { residualOrders: options.buyers } : {}),
  });

const cashOf = (r: ReturnType<typeof run>, id: string) => r.accounts.find((a) => a.id === id)!.cash;
const outcome = (r: ReturnType<typeof run>, commodity: string) =>
  r.orderOutcomes!.find((o) => o.accountId === "buyer" && o.commodity === commodity)!;
const plantSold = (r: ReturnType<typeof run>, id: string) =>
  r.producers.find((p) => p.id === id)!.products[0]!.soldUnits;
const totalCash = (r: ReturnType<typeof run>) => r.accounts.reduce((sum, a) => sum + a.cash, 0);

describe("wider-economy seller after the market", () => {
  it("fills only what real buyers ordered and did not get, and real plants sell exactly as before", () => {
    const off = run();
    const on = run({ sellers: [wideSeller("steel", 5, 10.5)] });
    // The plant still sells its 2 units at its own price.
    expect(plantSold(on, "scarce")).toBeCloseTo(plantSold(off, "scarce"), 12);
    expect(cashOf(on, "scarce-corp")).toBeCloseTo(cashOf(off, "scarce-corp"), 9);
    // The buyer was 8 short; the seller fills its 5 units at its ask.
    expect(outcome(off, "steel")).toMatchObject({ requestedUnits: 10, deliveredUnits: 2 });
    expect(outcome(on, "steel").requestedUnits).toBe(10);
    expect(outcome(on, "steel").deliveredUnits).toBeCloseTo(7, 9);
    expect(cashOf(on, "buyer")).toBeCloseTo(cashOf(off, "buyer") - 5 * 10.5, 9);
    expect(cashOf(on, WIDE)).toBeCloseTo(250 + 5 * 10.5, 9);
    // Money only moves between accounts inside the market.
    expect(totalCash(on)).toBeCloseTo(totalCash(off), 9);
  });

  it("never sells to a buyer ahead of a real plant, even when it asks less", () => {
    const off = run();
    const on = run({ sellers: [wideSeller("steel", 50, 9)] });
    expect(plantSold(on, "scarce")).toBeCloseTo(plantSold(off, "scarce"), 12);
    expect(cashOf(on, "scarce-corp")).toBeCloseTo(cashOf(off, "scarce-corp"), 9);
    // Sized to the 8 units real buyers still wanted, not its whole line.
    expect(outcome(on, "steel").deliveredUnits).toBeCloseTo(10, 9);
  });

  it("keeps the real lane's clearing price and counts only what it sold as supply", () => {
    const off = run();
    const on = run({ sellers: [wideSeller("steel", 5, 10.5)] });
    const price = (r: ReturnType<typeof run>) => r.prices.filter((p) => p.commodity === "steel");
    expect(price(on)).toEqual(price(off));
    expect(on.prices.some((p) => p.book === wideEconomyFillBook("world"))).toBe(false);
    const row = (r: ReturnType<typeof run>) =>
      r.countryBooks!.find((x) => x.countryId === "US" && x.commodity === "steel");
    expect(row(on)!.supply).toBeCloseTo((row(off)?.supply ?? 0) + 5, 9);
    expect(row(on)!.demand).toBeCloseTo(row(off)!.demand, 9);
  });

  it("never spends more than a buyer held at close, and unsold units count as no supply", () => {
    // 20 for steel, 500 for food at 5: the buyer closes with 0.
    const off = run({ buyerCash: 520 });
    expect(cashOf(off, "buyer")).toBeCloseTo(0, 9);
    const on = run({ buyerCash: 520, sellers: [wideSeller("steel", 5, 10.5)] });
    expect(outcome(on, "steel").deliveredUnits).toBeCloseTo(2, 9);
    expect(cashOf(on, "buyer")).toBeCloseTo(0, 9);
    const supply = (r: ReturnType<typeof run>) =>
      r.countryBooks!.find((x) => x.countryId === "US" && x.commodity === "steel")?.supply ?? 0;
    expect(supply(on)).toBeCloseTo(supply(off), 9);
  });

  it("does not fill a buyer whose limit is below its ask", () => {
    const on = run({ sellers: [wideSeller("steel", 5, 12.5)] });
    expect(outcome(on, "steel").deliveredUnits).toBeCloseTo(2, 9);
    expect(cashOf(on, WIDE)).toBeCloseTo(250, 9);
  });
});

describe("wider-economy buyer after the market", () => {
  it("takes only plant output real buyers left unsold", () => {
    const off = run();
    const on = run({ buyers: [wideBuyer("food", 50, 5)] });
    expect(outcome(on, "food").deliveredUnits).toBeCloseTo(outcome(off, "food").deliveredUnits, 9);
    expect(plantSold(on, "plenty")).toBeCloseTo(plantSold(off, "plenty") + 50, 9);
    expect(cashOf(on, WIDE)).toBeCloseTo(0, 9);
    expect(totalCash(on)).toBeCloseTo(totalCash(off), 9);
  });

  it("buys nothing when real buyers took all the output", () => {
    const on = run({ foodOrdered: 1000, buyerCash: 100_000, buyers: [wideBuyer("food", 50, 5)] });
    expect(outcome(on, "food").deliveredUnits).toBeCloseTo(1000, 9);
    expect(cashOf(on, WIDE)).toBeCloseTo(250, 9);
  });

  it("buys nothing priced above its bid", () => {
    const on = run({ buyers: [wideBuyer("food", 50, 4)] });
    expect(cashOf(on, WIDE)).toBeCloseTo(250, 9);
  });
});

describe("a plant short of an input", () => {
  // The bank needs 1 unit of advertising per unit of output; the only real
  // advertising seller has 4 units.
  const bank: ProductionPlan = {
    id: "bank",
    accountId: "bank-corp",
    capacityUnits: 10,
    activeFraction: 1,
    outputMultiplier: 1,
    labourCost: 0,
    otherOperatingCost: 0,
    labourRecipientAccountId: "households",
    operatingRecipientAccountId: "services",
    inputs: [{ commodity: "advertising", unitsPerOutput: 1, book: "world", maximumUnitPrice: 12 }],
    outputs: [
      {
        commodity: "financial_services",
        unitsPerOutput: 1,
        book: "world",
        referenceUnitPrice: 30,
        policy: { kind: "manual", unitPrice: 30 },
        storable: false,
      },
    ],
    inputStock: [],
    outputStock: [],
  };
  const runBank = (sellers?: ProducerOffer[], bankCountry = "US") =>
    advanceProducerEconomy({
      turn: 1,
      accounts: [
        { id: "bank-corp", cash: 1000 },
        { id: "media-corp", cash: 0 },
        { id: "buyer", cash: 10_000 },
        { id: WIDE, cash: 0 },
        { id: "households", cash: 0 },
        { id: "services", cash: 0 },
      ],
      carryLossByCommodity: { advertising: 0, financial_services: 0 },
      producers: [stockOnly("media", "advertising", 4, 10), bank],
      externalOrders: [realOrder("financial_services", 100, 40)],
      countryOfProducer: (id) => (id === "bank" ? bankCountry : "US"),
      ...(sellers ? { residualOffers: sellers } : {}),
    });
  const produced = (r: ReturnType<typeof runBank>) =>
    r.producers.find((p) => p.id === "bank")!.producedUnits;

  it("plans its run with the wider economy's seller and produces more, while the real seller sells the same", () => {
    const off = runBank();
    const on = runBank([wideSeller("advertising", 100, 10.5)]);
    expect(plantSold(on as never, "media")).toBeCloseTo(plantSold(off as never, "media"), 9);
    expect(cashOf(on as never, "media-corp")).toBeCloseTo(cashOf(off as never, "media-corp"), 9);
    expect(produced(on)).toBeGreaterThan(produced(off));
    expect(cashOf(on as never, WIDE)).toBeGreaterThan(0);
  });

  it("never plans on another country's wider-economy seller", () => {
    const off = runBank(undefined, "CA");
    const on = runBank([wideSeller("advertising", 100, 10.5)], "CA");
    expect(produced(on)).toBeCloseTo(produced(off), 9);
    expect(cashOf(on as never, WIDE)).toBeCloseTo(0, 9);
  });
});

describe("withWideEconomyFallback", () => {
  const seller = wideEconomyFallbackOffers([wideSeller("steel", 100, 10.5)]);

  it("gives an order its own country's seller on its own lane, when it bids the ask", () => {
    const [us, ca, low, contract] = withWideEconomyFallback(
      [
        realOrder("steel", 10, 12),
        { ...realOrder("steel", 10, 12), id: "ca", countryId: "CA" },
        { ...realOrder("steel", 10, 10), id: "low" },
        { ...realOrder("steel", 10, 12), id: "contract", contractUnitPrice: 10 },
      ],
      seller,
      laneKeyOf
    );
    expect(us!.fallbackOfferIds).toEqual([seller[0]!.id]);
    expect(ca!.fallbackOfferIds).toBeUndefined();
    expect(low!.fallbackOfferIds).toBeUndefined();
    expect(contract!.fallbackOfferIds).toBeUndefined();
    expect(seller[0]!.book).toBe(wideEconomyFillBook("world"));
  });

  it("never lets the wider economy buy from itself, and skips goods the turn leaves alone", () => {
    const [own] = withWideEconomyFallback([wideBuyer("steel", 10, 20)], seller, laneKeyOf);
    expect(own!.fallbackOfferIds).toBeUndefined();
    expect(wideEconomyFallbackOffers([wideSeller("energy", 5, 1)], (c) => c === "energy")).toEqual(
      []
    );
  });
});

describe("residualWideEconomyBuyers", () => {
  it("sizes each line to unsold plant output at or below its bid", () => {
    const offers: ProducerOffer[] = [
      { id: "cheap", accountId: "a", commodity: "food", book: "world", units: 30, unitPrice: 5 },
      { id: "dear", accountId: "b", commodity: "food", book: "world", units: 100, unitPrice: 7 },
    ];
    const [order] = residualWideEconomyBuyers({
      buyerLines: [wideBuyer("food", 50, 5)],
      plantOffers: offers,
      offerResults: new Map([
        ["cheap", { offeredUnits: 30, deliveredUnits: 10 }],
        ["dear", { offeredUnits: 100, deliveredUnits: 0 }],
      ]),
      laneKey: laneKeyOf,
    });
    expect(order).toMatchObject({ units: 20, maximumSpend: 100, afterMarket: true });
  });
});
