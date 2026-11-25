import { describe, expect, it } from "vitest";
import { laneKeyOf } from "./laneKey";
import {
  WIDE_ECONOMY_DEMAND_SHARE,
  WIDE_ECONOMY_MAX_SHARE,
  wideEconomyLaneShortage,
  wideEconomyShortageBoost,
  wideEconomySurplusBoost,
  wideEconomyLaneSurplus,
  wideEconomyBoostedOrders,
  wideEconomyBoostOffers,
  WIDE_ECONOMY_SELLER_MARKUP,
  WIDE_ECONOMY_SUPPLY_HEADROOM,
  wideEconomyBaseline,
  wideEconomyOffers,
  wideEconomyWeights,
  wideEconomyOrderId,
  wideEconomyOrders,
  type WideEconomyBaseline,
} from "./wideEconomyRules";

const states = [
  { stateId: "US_CA", countryId: "US", realGdp: 300 },
  { stateId: "US_NY", countryId: "US", realGdp: 100 },
  { stateId: "CA_ON", countryId: "CA", realGdp: 100 },
];

describe("wideEconomyBaseline", () => {
  it("sizes each good at a share of its demand, averaged over turns", () => {
    const b = wideEconomyBaseline({
      turns: [
        [
          { commodity: "steel", supply: 100, demand: 80 },
          { commodity: "steel", supply: 20, demand: 0 },
        ],
        [{ commodity: "steel", supply: 100, demand: 100 }],
      ],
      states,
    });
    // Demand (80 + 100) / 2 = 90 per turn.
    expect(b.units.steel).toBeCloseTo(WIDE_ECONOMY_DEMAND_SHARE * 90, 9);
    expect(b.realGdp).toEqual({ CA_ON: 100, US_CA: 300, US_NY: 100 });
    expect(b.countryOfState.CA_ON).toBe("CA");
  });

  it("covers short goods too, and never ordnance", () => {
    const b = wideEconomyBaseline({
      turns: [
        [
          { commodity: "advertising", supply: 100, demand: 160 },
          { commodity: "ordnance", supply: 100, demand: 50 },
        ],
      ],
      states,
    });
    expect(b.units.advertising).toBeCloseTo(16, 9);
    expect(b.units.ordnance).toBeUndefined();
  });

  it("builds an empty baseline from no turns", () => {
    expect(wideEconomyBaseline({ turns: [], states }).units).toEqual({});
  });
});

const baseline: WideEconomyBaseline = {
  units: { steel: 50, healthcare_services: 10 },
  realGdp: { US_CA: 300, US_NY: 100, CA_ON: 100 },
  countryOfState: { US_CA: "US", US_NY: "US", CA_ON: "CA" },
};

const lineInput = (realGdpNow: Map<string, number>, price: number | null = 10) => ({
  baseline,
  realGdpNow,
  accountId: (c: string) => `wide:${c}`,
  referencePrice: () => price,
  isStateScoped: (c: string) => c === "healthcare_services",
  mapBook: (book: string) => book,
});
const build = (realGdpNow: Map<string, number>, price: number | null = 10) =>
  wideEconomyOrders(lineInput(realGdpNow, price));

const atBaseline = new Map(Object.entries(baseline.realGdp));
const H = WIDE_ECONOMY_SUPPLY_HEADROOM;

describe("wideEconomyOrders", () => {
  it("splits each good by baseline real GDP share, one world order per country", () => {
    const steel = build(atBaseline).filter((o) => o.commodity === "steel");
    const us = steel.find((o) => o.countryId === "US")!;
    const ca = steel.find((o) => o.countryId === "CA")!;
    expect(us.units).toBeCloseTo(40 * H, 9);
    expect(ca.units).toBeCloseTo(10 * H, 9);
    expect(us.book).toBe("world");
    expect(us.id).toBe(wideEconomyOrderId("US", "steel", "world"));
  });

  it("bids the reference price at most, in one tranche counted only for what it buys", () => {
    for (const o of build(atBaseline)) {
      expect(o.maximumUnitPrice).toBe(10);
      expect(o.maximumSpend).toBeCloseTo(o.units * 10, 9);
      expect(o.demandStep).toBe(1);
    }
  });

  it("orders state-scoped goods on each state's own book", () => {
    const hc = build(atBaseline).filter((o) => o.commodity === "healthcare_services");
    expect(hc.map((o) => o.book).sort()).toEqual(["state:CA_ON", "state:US_CA", "state:US_NY"]);
    expect(hc.find((o) => o.book === "state:US_CA")!.units).toBeCloseTo(6 * H, 9);
  });

  it("grows each state only with its own real GDP", () => {
    const grown = build(new Map([...atBaseline, ["US_CA", 330]]));
    const us = grown.find((o) => o.commodity === "steel" && o.countryId === "US")!;
    const ca = grown.find((o) => o.commodity === "steel" && o.countryId === "CA")!;
    // US_CA grew 10%: 50 x 330 / 500 + 50 x 100 / 500 = 43.
    expect(us.units).toBeCloseTo(43 * H, 9);
    expect(ca.units).toBeCloseTo(10 * H, 9);
  });

  it("orders nothing without a reference price or for states not in the baseline", () => {
    expect(build(atBaseline, null)).toEqual([]);
    const extra = build(new Map([...atBaseline, ["US_TX", 1000]]));
    expect(extra.some((o) => o.book === "state:US_TX")).toBe(false);
    expect(extra.find((o) => o.commodity === "steel" && o.countryId === "US")!.units).toBeCloseTo(
      40 * H,
      9
    );
  });
});

describe("wideEconomyOffers", () => {
  it("offers the baseline share a little above the reference price, so demand sits above supply", () => {
    const offers = wideEconomyOffers(lineInput(atBaseline));
    const us = offers.find((o) => o.commodity === "steel" && o.countryId === "US")!;
    expect(us.units).toBeCloseTo(40, 9);
    expect(us.unitPrice).toBeCloseTo(10 * WIDE_ECONOMY_SELLER_MARKUP, 9);
    expect(us.book).toBe("world");
    const orders = build(atBaseline);
    const sum = (xs: { units: number }[]) => xs.reduce((n, x) => n + x.units, 0);
    expect(sum(orders) / sum(offers)).toBeCloseTo(H, 9);
  });
});

describe("unfilled wider-economy orders", () => {
  it("are recorded only for what they bought, so they never read as a shortage", async () => {
    const { productionOrderOutcomes } = await import("./productionOrderOutcomes");
    const [order] = build(atBaseline).filter(
      (o) => o.commodity === "steel" && o.countryId === "US"
    );
    const outcomes = productionOrderOutcomes(
      [order],
      [{ id: order.id, requestedUnits: order.units, deliveredUnits: 3 } as never],
      new Map()
    );
    expect(outcomes).toEqual([
      expect.objectContaining({ commodity: "steel", requestedUnits: 3, deliveredUnits: 3 }),
    ]);
  });
});

describe("splitting between countries", () => {
  // A US state and a Japanese state of the same size in the anchor currency:
  // 100 in dollars at 1 per anchor, 15,000 in yen at 150 per anchor.
  const mixed = [
    { stateId: "US_CA", countryId: "US", realGdp: 100, anchorGdp: 100 },
    { stateId: "JP_TK", countryId: "JP", realGdp: 15_000, anchorGdp: 100 },
  ];
  const turnsOf = [[{ commodity: "steel", supply: 0, demand: 1000 }]];

  it("splits by real GDP in the anchor currency, not in each country's own currency", () => {
    const baseline = wideEconomyBaseline({ turns: turnsOf, states: mixed });
    expect(baseline.weight).toEqual({ JP_TK: 0.5, US_CA: 0.5 });
    const offers = wideEconomyOffers({
      ...lineInput(
        new Map([
          ["US_CA", 100],
          ["JP_TK", 15_000],
        ])
      ),
      baseline,
    });
    const units = (c: string) => offers.find((o) => o.countryId === c)!.units;
    expect(units("US")).toBeCloseTo(50, 9);
    expect(units("JP")).toBeCloseTo(50, 9);
  });

  it("grows each state with its own real GDP, so exchange rates never read as growth", () => {
    const baseline = wideEconomyBaseline({ turns: turnsOf, states: mixed });
    const offers = wideEconomyOffers({
      ...lineInput(
        new Map([
          ["US_CA", 100],
          ["JP_TK", 16_500],
        ])
      ),
      baseline,
    });
    expect(offers.find((o) => o.countryId === "JP")!.units).toBeCloseTo(55, 9);
    expect(offers.find((o) => o.countryId === "US")!.units).toBeCloseTo(50, 9);
  });

  it("weighs an older baseline from its stored GDP at the given rates", () => {
    expect(
      wideEconomyWeights({ US_CA: 100, JP_TK: 45_000 }, { US_CA: "US", JP_TK: "JP" }, (c) =>
        c === "JP" ? 150 : 1
      )
    ).toEqual({ JP_TK: 0.75, US_CA: 0.25 });
    expect(wideEconomyWeights({ US_CA: 100 }, { US_CA: "US" }, () => null)).toEqual({});
  });
});

describe("short-lane boost", () => {
  const turn = (u: number) => ({ "advertising|world": u, "steel|world": 0.05 });

  it("grows a lane short in every recent turn toward its unmet demand, leaving a balanced lane alone", () => {
    const boost = wideEconomyShortageBoost([turn(0.32), turn(0.3), turn(0.35)]);
    // Smallest recent shortage 30%, less the 10% target: a 20% seller, twice the base.
    expect(boost.get("advertising|world")).toBeCloseTo(2, 9);
    expect(boost.has("steel|world")).toBe(false);
  });

  it("never goes beyond the cap", () => {
    expect(
      wideEconomyShortageBoost([turn(0.9), turn(0.9), turn(0.9)]).get("advertising|world")
    ).toBeCloseTo(WIDE_ECONOMY_MAX_SHARE / WIDE_ECONOMY_DEMAND_SHARE, 9);
  });

  it("needs every recent turn short, and shrinks back as real supply grows", () => {
    expect(wideEconomyShortageBoost([turn(0.3), turn(0.1), turn(0.3)]).size).toBe(0);
    expect(wideEconomyShortageBoost([turn(0.3), turn(0.3)]).size).toBe(0);
    // Real supply grew: the smallest shortage is now 18%, so the seller is back near base.
    expect(wideEconomyShortageBoost([turn(0.18), turn(0.25), turn(0.3)]).size).toBe(0);
  });

  it("adds the extra units as separate offers on the boosted lane only, never to the buyer", () => {
    const base = wideEconomyOffers(lineInput(atBaseline));
    const extra = wideEconomyBoostOffers(base, new Map([["steel|world", 3]]), laneKeyOf);
    expect(extra.map((o) => o.commodity)).toEqual(["steel", "steel"]);
    const us = extra.find((o) => o.countryId === "US")!;
    expect(us.units).toBeCloseTo(80, 9);
    expect(us.unitPrice).toBeCloseTo(
      base.find((o) => o.commodity === "steel" && o.countryId === "US")!.unitPrice,
      9
    );
    expect(JSON.parse(us.id).at(-1)).toBe("boost");
    expect(
      wideEconomyOrders(lineInput(atBaseline)).find(
        (o) => o.commodity === "steel" && o.countryId === "US"
      )!.units
    ).toBeCloseTo(40 * H, 9);
  });
});

describe("real lane shortage", () => {
  it("counts what the wider economy filled as unmet, and leaves its own buyer out", () => {
    const shortage = wideEconomyLaneShortage({
      outcomes: [
        {
          accountId: "bank",
          commodity: "advertising",
          book: "world",
          requestedUnits: 100,
          deliveredUnits: 90,
        },
        {
          accountId: "wide:US",
          commodity: "advertising",
          book: "world",
          requestedUnits: 50,
          deliveredUnits: 50,
        },
      ],
      orders: [{ id: "o", commodity: "advertising", book: "world" }],
      fills: [
        { orderId: "o", units: 20, spillBook: "wide:world" },
        { orderId: "o", units: 70 },
      ],
      isWideAccount: (id) => id.startsWith("wide:"),
      laneKey: laneKeyOf,
    });
    // 100 asked, 90 received, 20 of it from the wider economy: real unmet 30%.
    expect(shortage["advertising|world"]).toBeCloseTo(0.3, 9);
  });
});

describe("the buyer on oversupplied lanes", () => {
  const WIDE = "wide-us";
  const lane = laneKeyOf("steel", "world");

  it("reads only new output: sales and own-site deliveries count first, old stock never", () => {
    const surplus = wideEconomyLaneSurplus({
      products: [
        // Made 100, sold 50 and handed 20 to its own sites; it also offered old stock.
        {
          commodity: "steel",
          book: "world",
          producedUnits: 100,
          soldUnits: 50,
          internalDeliveredUnits: 20,
        },
        // Sold all it made plus some stock: never more than fully taken.
        { commodity: "oil", book: "world", producedUnits: 10, soldUnits: 15 },
      ],
      outcomes: [
        // 10 of the steel sales went to the wider economy's own buyer: not real demand.
        { accountId: WIDE, commodity: "steel", book: "world", deliveredUnits: 10 },
        { accountId: "corp", commodity: "steel", book: "world", deliveredUnits: 40 },
      ],
      isWideAccount: (id) => id === WIDE,
      laneKey: laneKeyOf,
    });
    expect(surplus[lane]).toBeCloseTo(0.4, 9);
    expect(surplus[laneKeyOf("oil", "world")]).toBe(0);
  });

  it("grows only after three oversupplied turns, toward 10% unsold, capped at 2.5x", () => {
    const turn = (u: number) => ({ [lane]: u });
    expect(wideEconomySurplusBoost([turn(0.3), turn(0.3)]).size).toBe(0);
    expect(wideEconomySurplusBoost([turn(0.3), turn(0.1), turn(0.3)]).size).toBe(0);
    // Smallest of the three, 0.3, less the 10% target: a 20% buyer, twice the base.
    expect(wideEconomySurplusBoost([turn(0.35), turn(0.3), turn(0.4)]).get(lane)).toBeCloseTo(2, 9);
    expect(wideEconomySurplusBoost([turn(0.9), turn(0.9), turn(0.9)]).get(lane)).toBeCloseTo(
      2.5,
      9
    );
    // Just past the threshold: below the base share after the target, so no boost.
    expect(wideEconomySurplusBoost([turn(0.16), turn(0.16), turn(0.16)]).size).toBe(0);
  });

  it("scales the boosted lane's units and spend, and leaves other lanes alone", () => {
    const base = [
      {
        id: "a",
        accountId: WIDE,
        commodity: "steel",
        book: "world",
        units: 10,
        maximumUnitPrice: 5,
        maximumSpend: 50,
      },
      {
        id: "b",
        accountId: WIDE,
        commodity: "oil",
        book: "world",
        units: 4,
        maximumUnitPrice: 2,
        maximumSpend: 8,
      },
    ];
    const out = wideEconomyBoostedOrders(base, new Map([[lane, 2]]), laneKeyOf);
    expect(out[0]).toMatchObject({ units: 20, maximumSpend: 100, maximumUnitPrice: 5 });
    expect(out[1]).toBe(base[1]);
  });
});
