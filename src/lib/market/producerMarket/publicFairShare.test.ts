import { describe, expect, it } from "vitest";
import { producerTrades, settleProducerMarket, type PurchaseOrder } from "./rules";
import { markHomeCountryFirst } from "./publicHomeFirstRules";
import { markPublicFairShare, proRataShares, publicFairShareOn } from "./publicFairShareRules";

const tradeUnits = (receipt: Parameters<typeof producerTrades>[0]) => {
  const byOffer = new Map<string, number>();
  for (const trade of producerTrades(receipt))
    byOffer.set(trade.offerId, (byOffer.get(trade.offerId) ?? 0) + trade.units);
  return byOffer;
};

const gov = (country: string, units: number, extra: Partial<PurchaseOrder> = {}) =>
  ({
    id: `public:${country}:ordnance:world`,
    accountId: `gov-${country}`,
    commodity: "ordnance",
    book: "world",
    units,
    maximumUnitPrice: 50,
    maximumSpend: 100_000,
    countryId: country,
    ...extra,
  }) satisfies PurchaseOrder;

// A scarce world book: 60 units at 10 and 30 at 20, sold by a country with
// no public order of its own, plus 40 home units for "US".
const market = (orders: PurchaseOrder[], cash: Record<string, number> = {}) =>
  settleProducerMarket({
    turn: 1,
    trackCountryBooks: true,
    accounts: [
      ...["AT", "JP", "UK", "US"].map((c) => ({ id: `gov-${c}`, cash: cash[c] ?? 100_000 })),
      { id: "maker-de", cash: 0 },
      { id: "maker-us", cash: 0 },
    ],
    offers: [
      {
        id: "offer-de-a",
        accountId: "maker-de",
        commodity: "ordnance",
        book: "world",
        units: 60,
        unitPrice: 10,
        countryId: "DE",
      },
      {
        id: "offer-de-b",
        accountId: "maker-de",
        commodity: "ordnance",
        book: "world",
        units: 30,
        unitPrice: 20,
        countryId: "DE",
      },
      {
        id: "offer-us",
        accountId: "maker-us",
        commodity: "ordnance",
        book: "world",
        units: 40,
        unitPrice: 15,
        countryId: "US",
      },
    ],
    orders,
  });

const delivered = (result: ReturnType<typeof market>, country: string) =>
  result.orders.find((o) => o.id === `public:${country}:ordnance:world`)!.deliveredUnits;

describe("publicFairShareOn", () => {
  it("is off when absent or 0", () => {
    expect(publicFairShareOn(undefined)).toBe(false);
    expect(publicFairShareOn(0)).toBe(false);
    expect(publicFairShareOn(1)).toBe(true);
  });
});

describe("markPublicFairShare", () => {
  it("flags world-book orders that name a country only", () => {
    const marked = markPublicFairShare([
      gov("AT", 1),
      { ...gov("AT", 1), id: "state", book: "state:CA" },
      { ...gov("AT", 1), id: "stateless", countryId: undefined },
    ]);
    expect(marked.map((o) => o.fairShare ?? false)).toEqual([true, false, false]);
  });
});

describe("proRataShares", () => {
  it("splits pro rata to weight when nobody is capped", () => {
    expect(
      proRataShares(60, [
        { weight: 10, cap: 100 },
        { weight: 20, cap: 100 },
      ])
    ).toEqual([20, 40]);
  });

  it("caps a row and hands its unused share to the rest in proportion", () => {
    const shares = proRataShares(90, [
      { weight: 100, cap: 10 },
      { weight: 100, cap: 100 },
      { weight: 50, cap: 100 },
    ]);
    expect(shares[0]).toBe(10);
    expect(shares[1]).toBeCloseTo(160 / 3, 9);
    expect(shares[2]).toBeCloseTo(80 / 3, 9);
  });

  it("never hands out more than the total cap, and skips empty rows", () => {
    expect(
      proRataShares(100, [
        { weight: 5, cap: 5 },
        { weight: 0, cap: 50 },
        { weight: 7, cap: 0 },
        { weight: 20, cap: 20 },
      ])
    ).toEqual([5, 0, 0, 20]);
  });
});

describe("fair-share public clearing", () => {
  const three = () => [gov("AT", 100), gov("JP", 100), gov("UK", 200)];

  it("without the flag, the alphabetically first government buys out the book", () => {
    const result = market(three());
    expect(delivered(result, "AT")).toBe(100);
    expect(delivered(result, "UK")).toBe(0);
  });

  it("with the flag, each level splits pro rata to what each still wants", () => {
    const result = market(markPublicFairShare(three()));
    // 130 units exist (60 at 10, 40 at 15, 30 at 20) against 400 wanted:
    // every government gets 32.5% of its order at every level.
    expect(delivered(result, "AT")).toBeCloseTo(32.5, 9);
    expect(delivered(result, "JP")).toBeCloseTo(32.5, 9);
    expect(delivered(result, "UK")).toBeCloseTo(65, 9);
    // Each price level split in the same proportions.
    const at = result.orders.find((o) => o.id === "public:AT:ordnance:world")!;
    expect(at.cost).toBeCloseTo(15 * 10 + 10 * 15 + 7.5 * 20, 9);
    // The receipt replays to the same sellers and cash is conserved.
    const units = tradeUnits(result.tradeReceipt);
    expect(units.get("offer-de-a")).toBeCloseTo(60, 9);
    expect(units.get("offer-de-b")).toBeCloseTo(30, 9);
    expect(units.get("offer-us")).toBeCloseTo(40, 9);
    const cash = result.accounts.reduce((sum, a) => sum + a.cash, 0);
    expect(cash).toBeCloseTo(400_000, 6);
  });

  it("favours no country by code: renaming the buyers moves the fills with them", () => {
    const a = market(markPublicFairShare([gov("AT", 100), gov("UK", 300)]));
    const b = market(markPublicFairShare([gov("AT", 300), gov("UK", 100)]));
    expect(delivered(a, "AT")).toBeCloseTo(delivered(b, "UK"), 9);
    expect(delivered(a, "UK")).toBeCloseTo(delivered(b, "AT"), 9);
    expect(delivered(a, "UK")).toBeCloseTo(3 * delivered(a, "AT"), 9);
  });

  it("caps a budget-limited order at its budget and redistributes the rest", () => {
    const result = market(
      markPublicFairShare([gov("AT", 100, { maximumSpend: 50 }), gov("JP", 100), gov("UK", 200)])
    );
    // AT can afford 5 units at 10, so the other 55 of the first level split
    // 1:2 between JP and UK.
    expect(delivered(result, "AT")).toBeCloseTo(5, 9);
    const at = result.orders.find((o) => o.id === "public:AT:ordnance:world")!;
    expect(at.cost).toBeCloseTo(50, 9);
    expect(delivered(result, "JP") + delivered(result, "UK")).toBeCloseTo(125, 9);
    expect(delivered(result, "UK")).toBeCloseTo(2 * delivered(result, "JP"), 9);
  });

  it("caps an order at its account cash", () => {
    const result = market(markPublicFairShare(three()), { AT: 30 });
    expect(delivered(result, "AT")).toBeCloseTo(3, 9);
    expect(delivered(result, "JP") + delivered(result, "UK")).toBeCloseTo(127, 9);
  });

  it("keeps each order's limit price: a low limit stops at the cheap level", () => {
    const result = market(
      markPublicFairShare([gov("AT", 100, { maximumUnitPrice: 10 }), gov("JP", 100)])
    );
    expect(delivered(result, "AT")).toBeCloseTo(30, 9);
    expect(delivered(result, "JP")).toBeCloseTo(100, 9);
  });

  it("leaves eligibility-filtered orders on their ordinary pass", () => {
    const result = market(
      markPublicFairShare([
        gov("AT", 100, { eligibleOfferIds: ["offer-de-a"] }),
        gov("JP", 100),
        gov("UK", 200),
      ])
    );
    expect(delivered(result, "AT")).toBe(60);
    expect(delivered(result, "AT") + delivered(result, "JP") + delivered(result, "UK")).toBeCloseTo(
      130,
      9
    );
    expect(delivered(result, "UK")).toBeCloseTo(2 * delivered(result, "JP"), 9);
  });

  it("still lets a higher-priority order clear first", () => {
    const result = market([
      ...markPublicFairShare(three()),
      { ...gov("US", 50), id: "reserved", priority: 1 },
    ]);
    expect(result.orders.find((o) => o.id === "reserved")!.deliveredUnits).toBe(50);
    expect(delivered(result, "AT") + delivered(result, "JP") + delivered(result, "UK")).toBeCloseTo(
      80,
      9
    );
  });

  it("shares only what the home-first pass leaves", () => {
    const result = market(markPublicFairShare(markHomeCountryFirst([...three(), gov("US", 30)])));
    expect(delivered(result, "US")).toBe(30);
    // 100 units remain for AT, JP and UK; the US order is already satisfied.
    expect(delivered(result, "AT")).toBeCloseTo(25, 9);
    expect(delivered(result, "JP")).toBeCloseTo(25, 9);
    expect(delivered(result, "UK")).toBeCloseTo(50, 9);
  });

  it("honours a shared spend group across members", () => {
    const spendGroup = { id: "g", maximumSpend: 300 };
    const result = market(
      markPublicFairShare([
        gov("AT", 100, { spendGroup }),
        { ...gov("AT", 100, { spendGroup }), id: "public:AT:ordnance:world:2" },
        gov("UK", 200),
      ])
    );
    const atCost = result.orders
      .filter((o) => o.id.startsWith("public:AT"))
      .reduce((sum, o) => sum + o.cost, 0);
    expect(atCost).toBeLessThanOrEqual(300 + 1e-9);
    expect(atCost).toBeCloseTo(300, 9);
  });

  it("is byte-identical with no flagged order, or with a group of one", () => {
    const a = market(three());
    const b = market(three().map((o) => ({ ...o, fairShare: undefined })));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const single = market([...three().slice(0, 2), { ...three()[2], fairShare: true }]);
    expect(JSON.stringify(single.orders)).toBe(JSON.stringify(a.orders));
  });
});
