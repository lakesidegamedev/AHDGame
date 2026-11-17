import { describe, expect, it } from "vitest";
import { backgroundOrderId, backgroundTradeLines } from "./backgroundTradeRules";
import { markPublicFairShare } from "./publicFairShareRules";
import { settleProducerMarket } from "./rules";

// Two background countries want the same scarce electricity. Country codes sort
// "AT" before "IE", so in id order AT took everything and IE got nothing.
const lines = () =>
  backgroundTradeLines({
    economies: [
      { countryId: "IE", accountId: "ie", byCommodity: { energy: { supply: 0, demand: 100 } } },
      { countryId: "AT", accountId: "at", byCommodity: { energy: { supply: 0, demand: 100 } } },
      { countryId: "US", accountId: "us", byCommodity: { energy: { supply: 60, demand: 0 } } },
    ],
    referencePrice: () => 10,
    priceHeadroom: 1.25,
    unitsPerTurnDivisor: 1,
  });

const bought = (fair: boolean) => {
  const { offers, orders } = lines();
  const result = settleProducerMarket({
    turn: 1,
    trackCountryBooks: true,
    accounts: [
      { id: "ie", cash: 2000 },
      { id: "at", cash: 2000 },
      { id: "us", cash: 0 },
    ],
    offers: offers.filter((o) => o.countryId === "US"),
    orders: fair ? markPublicFairShare(orders) : orders,
  });
  const units = new Map<string, number>();
  for (const o of result.orders) units.set(o.id, o.deliveredUnits);
  return units;
};

describe("background buyers on a scarce world book", () => {
  it("without sharing, the alphabetically first country takes all supply", () => {
    const units = bought(false);
    expect(units.get(backgroundOrderId("AT", "energy"))).toBeCloseTo(60, 6);
    expect(units.get(backgroundOrderId("IE", "energy")) ?? 0).toBe(0);
  });

  it("with sharing, equal demand splits the supply equally", () => {
    const units = bought(true);
    expect(units.get(backgroundOrderId("AT", "energy"))).toBeCloseTo(30, 6);
    expect(units.get(backgroundOrderId("IE", "energy"))).toBeCloseTo(30, 6);
  });
});
