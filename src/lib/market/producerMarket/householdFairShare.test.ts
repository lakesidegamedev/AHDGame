import { describe, expect, it } from "vitest";
import { COUNTRY_ORDER } from "@/lib/constants/countriesCore";
import { HOUSEHOLD_CONSUMER_BASKET, householdPurchaseOrders } from "./householdRules";
import { producerTrades, settleProducerMarket, type PurchaseOrder } from "./rules";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import { spilloverOrders } from "./spilloverRules";
import { laneKeyOf } from "./laneKey";

const household = (countryId: string, cash = 100, eligibleOfferIds?: string[]) => ({
  accountId: `household:${countryId}`,
  countryId,
  stateId: `${countryId}-region`,
  cash,
  spendFraction: 1,
  products: [
    {
      commodity: "network_services",
      book: "world",
      maximumUnitPrice: 1,
      weight: 1,
      ...(eligibleOfferIds ? { eligibleOfferIds } : {}),
    },
  ],
});
const offer = (id = "network", countryId = "DE", units = 30, unitPrice = 1) => ({
  id,
  countryId,
  accountId: "supplier",
  commodity: "network_services",
  book: "world",
  units,
  unitPrice,
});
function market(
  orders: PurchaseOrder[],
  offers = [offer()],
  walletCash: Record<string, number> = {}
) {
  return settleProducerMarket({
    turn: 1,
    orders,
    offers,
    trackCountryBooks: true,
    accounts: [
      { id: "supplier", cash: 0 },
      ...[...new Set(orders.map((o) => o.accountId))].map((id) => ({
        id,
        cash: walletCash[id] ?? 1000,
      })),
    ],
  });
}
const filledByCountry = (result: ReturnType<typeof market>, country: string) =>
  result.countryBooks?.find((r) => r.countryId === country && r.commodity === "network_services")
    ?.filled ?? 0;

describe("household fair allocation", () => {
  it.each(Object.keys(HOUSEHOLD_CONSUMER_BASKET))(
    "shares scarce %s fairly without crossing an embargoed route",
    (commodity) => {
      const orders = [
        household("US", 100, ["allowed"]),
        household("UK", 100, ["allowed"]),
        household("JP", 100, []),
      ].flatMap((buyer) =>
        householdPurchaseOrders({
          ...buyer,
          products: buyer.products.map((product) => ({ ...product, commodity })),
        })
      );
      const result = market(orders, [{ ...offer("allowed", "DE", 20), commodity }]);
      for (const [index, expected] of [10, 10, 0].entries())
        expect(
          result.orders.find((row) => row.id === orders[index].id)?.deliveredUnits
        ).toBeCloseTo(expected);
      expect(result.accounts.reduce((sum, account) => sum + account.cash, 0)).toBeCloseTo(3000);
    }
  );

  it("shares scarce supply across every registered country, including independent Scotland and Wales", () => {
    const countries = [...new Set([...COUNTRY_ORDER, "SCO", "WAL"])];
    const orders = countries.flatMap((country) => householdPurchaseOrders(household(country)));
    const result = market(orders, [offer("network", "DE", countries.length * 2)]);
    for (const country of countries) expect(filledByCountry(result, country)).toBeCloseTo(2, 8);
    expect(result.accounts.reduce((sum, a) => sum + a.cash, 0)).toBeCloseTo(
      countries.length * 1000,
      8
    );
    expect(
      market([...orders].reverse(), [offer("network", "DE", countries.length * 2)]).orders
    ).toEqual(result.orders);
  });

  it("allocates proportionally to outstanding demand, not country spelling or wallet count", () => {
    const orders = [household("US", 100), household("UK", 200), household("JP", 300)].flatMap(
      householdPurchaseOrders
    );
    const result = market(orders);
    expect(["US", "UK", "JP"].map((c) => filledByCountry(result, c))).toEqual([5, 10, 15]);
    const split = Array.from({ length: 10 }, (_, i) =>
      householdPurchaseOrders({ ...household("US", 10), accountId: `split:${i}` })
    ).flat();
    const divided = market([...orders.filter((o) => o.countryId !== "US"), ...split]);
    for (const country of ["US", "UK", "JP"])
      expect(filledByCountry(divided, country)).toBeCloseTo(filledByCountry(result, country), 8);
  });

  it("preserves embargo eligibility, including an explicitly empty route list", () => {
    const orders = [
      household("US", 100, ["allowed"]),
      household("UK", 100, ["allowed", "blocked"]),
      household("JP", 100, []),
    ].flatMap(householdPurchaseOrders);
    const result = market(orders, [offer("allowed", "DE", 20), offer("blocked", "RU", 20)]);
    expect(filledByCountry(result, "US")).toBeCloseTo(10);
    expect(filledByCountry(result, "UK")).toBeCloseTo(30);
    expect(filledByCountry(result, "JP")).toBe(0);
    const byOrder = new Map(orders.map((o) => [o.id, o]));
    for (const trade of producerTrades(result.tradeReceipt))
      expect(byOrder.get(trade.orderId)?.eligibleOfferIds).toContain(trade.offerId);
  });

  it("does not override reserved priority, buyer cash, price ceilings or basket budgets", () => {
    const orders = [household("US", 10), household("UK", 100)].flatMap(householdPurchaseOrders);
    const reserved = { ...orders[1], id: "contract", priority: 1, units: 5, maximumSpend: 5 };
    const result = market(
      [...orders, reserved],
      [offer("cheap", "DE", 20), offer("dear", "DE", 100, 2)]
    );
    expect(result.orders.find((o) => o.id === "contract")?.deliveredUnits).toBe(5);
    expect(result.orders.reduce((sum, o) => sum + o.deliveredUnits, 0)).toBeCloseTo(20);
    for (const order of orders)
      expect(result.orders.find((o) => o.id === order.id)!.cost).toBeLessThanOrEqual(
        order.maximumSpend!
      );
    expect(result.accounts.every((a) => a.cash >= 0)).toBe(true);
    const cashLimited = market(orders, [offer("plenty", "DE", 1000)], { "household:US": 3 });
    expect(cashLimited.orders.find((o) => o.id === orders[0].id)?.cost).toBeCloseTo(3);
    expect(cashLimited.accounts.find((a) => a.id === "household:US")?.cash).toBeCloseTo(0);
  });

  it("marks every demand-curve step and retains price-step shared spending caps", () => {
    const orders = ["US", "UK", "JP"].flatMap((country) =>
      householdPurchaseOrders({ ...household(country, 10), demandCurve: { incomeIndex: 1 } })
    );
    expect(orders.length).toBeGreaterThan(3);
    expect(orders.every((o) => o.fairShare === true)).toBe(true);
    const result = market(orders, [offer("cheap", "DE", 1000, 0.5)]);
    for (const country of ["US", "UK", "JP"]) {
      const cost = result.orders
        .filter((r) => orders.some((o) => o.id === r.id && o.countryId === country))
        .reduce((sum, r) => sum + r.cost, 0);
      expect(cost).toBeLessThanOrEqual(10 + 1e-8);
    }
  });

  it("keeps fair-share and embargo flags when stranded household demand spills into another product", () => {
    const orders = ["US", "UK"].flatMap((country) =>
      householdPurchaseOrders({
        ...household(country),
        products: [
          ...household(country, 100, ["allowed"]).products,
          {
            commodity: "software",
            book: "world",
            weight: 1,
            maximumUnitPrice: 1,
            eligibleOfferIds: ["software"],
          },
        ],
      })
    );
    const next = spilloverOrders({
      orders,
      accounts: new Set(orders.map((o) => o.accountId)),
      outcomes: new Map(),
      unsoldUnits: new Map([[laneKeyOf("software", "world"), 100]]),
      laneKey: laneKeyOf,
      share: 0.7,
    });
    expect(next.stats.extraRequested).toBeGreaterThan(0);
    expect(next.orders.every((o) => o.fairShare)).toBe(true);
    for (let i = 0; i < orders.length; i++)
      expect(next.orders[i].eligibleOfferIds).toEqual(orders[i].eligibleOfferIds);
  });

  it("keeps households fair during production settlement and the post-wage billing rebuild", () => {
    const plan: ProductionPlan = {
      id: "plant",
      accountId: "supplier",
      capacityUnits: 100,
      activeFraction: 1,
      outputMultiplier: 1,
      labourCost: 20,
      otherOperatingCost: 0,
      labourRecipientAccountId: "household:JP",
      operatingRecipientAccountId: "services",
      inputs: [{ commodity: "steel", book: "world", unitsPerOutput: 1, maximumUnitPrice: 1 }],
      outputs: [
        {
          commodity: "network_services",
          book: "world",
          unitsPerOutput: 1,
          policy: { kind: "manual", unitPrice: 1 },
          referenceUnitPrice: 1,
          storable: false,
        },
      ],
      inputStock: [],
      outputStock: [],
    };
    const result = advanceProducerEconomy({
      turn: 1,
      accounts: [
        { id: "supplier", cash: 1000 },
        { id: "services", cash: 0 },
        { id: "steel", cash: 0 },
        ...["US", "UK", "JP"].map((c) => ({ id: `household:${c}`, cash: 100 })),
      ],
      producers: [plan],
      households: ["US", "UK", "JP"].map((country) => household(country)),
      externalOffers: [{ ...offer("steel"), accountId: "steel", commodity: "steel", units: 50 }],
      trackCountryBooks: true,
    });
    expect(result.producers[0].billedRunShare).toBeCloseTo(0.5);
    const consumer = result.tradeReceipt.orders.filter((o) => o.commodity === "network_services");
    expect(consumer).toHaveLength(3);
    expect(consumer.every((o) => o.fairShare)).toBe(true);
    const delivered = new Map<string, number>();
    for (const fill of result.tradeReceipt.fills)
      delivered.set(fill.orderId, (delivered.get(fill.orderId) ?? 0) + fill.units);
    const ratios = consumer.map((o) => delivered.get(o.id)! / o.units);
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0], 8);
    expect(consumer.every((o) => (delivered.get(o.id) ?? 0) > 0)).toBe(true);
  });
});
