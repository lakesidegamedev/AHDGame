import { describe, expect, it } from "vitest";
import {
  WIDE_ECONOMY_SUPPLY_HEADROOM,
  wideEconomyBaseline,
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
  it("buys the room between demand and 1.1x supply, averaged over turns", () => {
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
    // Supply (120 + 100) / 2 = 110, demand (80 + 100) / 2 = 90.
    expect(b.units.steel).toBeCloseTo(WIDE_ECONOMY_SUPPLY_HEADROOM * 110 - 90, 9);
    expect(b.realGdp).toEqual({ CA_ON: 100, US_CA: 300, US_NY: 100 });
    expect(b.countryOfState.CA_ON).toBe("CA");
  });

  it("gives nothing to a good already short at baseline", () => {
    const b = wideEconomyBaseline({
      turns: [
        [
          { commodity: "healthcare_services", supply: 100, demand: 153 },
          { commodity: "oil", supply: 100, demand: 110 },
        ],
      ],
      states,
    });
    expect(b.units.healthcare_services).toBeUndefined();
    expect(b.units.oil).toBeUndefined();
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

const build = (realGdpNow: Map<string, number>, price: number | null = 10) =>
  wideEconomyOrders({
    baseline,
    realGdpNow,
    accountId: (c) => `wide:${c}`,
    referencePrice: () => price,
    isStateScoped: (c) => c === "healthcare_services",
    mapBook: (book) => book,
  });

const atBaseline = new Map(Object.entries(baseline.realGdp));

describe("wideEconomyOrders", () => {
  it("splits each good by baseline real GDP share, one world order per country", () => {
    const steel = build(atBaseline).filter((o) => o.commodity === "steel");
    const us = steel.find((o) => o.countryId === "US")!;
    const ca = steel.find((o) => o.countryId === "CA")!;
    expect(us.units).toBeCloseTo(40, 9);
    expect(ca.units).toBeCloseTo(10, 9);
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
    expect(hc.find((o) => o.book === "state:US_CA")!.units).toBeCloseTo(6, 9);
  });

  it("grows each state only with its own real GDP", () => {
    const grown = build(new Map([...atBaseline, ["US_CA", 330]]));
    const us = grown.find((o) => o.commodity === "steel" && o.countryId === "US")!;
    const ca = grown.find((o) => o.commodity === "steel" && o.countryId === "CA")!;
    // US_CA grew 10%: 50 x 330 / 500 + 50 x 100 / 500 = 43.
    expect(us.units).toBeCloseTo(43, 9);
    expect(ca.units).toBeCloseTo(10, 9);
  });

  it("orders nothing without a reference price or for states not in the baseline", () => {
    expect(build(atBaseline, null)).toEqual([]);
    const extra = build(new Map([...atBaseline, ["US_TX", 1000]]));
    expect(extra.some((o) => o.book === "state:US_TX")).toBe(false);
    expect(extra.find((o) => o.commodity === "steel" && o.countryId === "US")!.units).toBeCloseTo(
      40,
      9
    );
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
