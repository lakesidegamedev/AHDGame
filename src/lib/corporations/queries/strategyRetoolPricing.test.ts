import { describe, expect, it } from "vitest";
import { STRATEGY_RETOOL_COST_FRACTION } from "@/lib/constants/sectorStrategies";
import { strategyRetoolPricing } from "./strategyRetoolPricing";

const input = {
  sector: { strategyId: "standard", revenue: 1000 },
  sectorHostLiquidCode: undefined,
  sectorHostFxRate: 1,
  techTreesEnabled: false,
  techCurrentYear: 2027,
};

describe("strategyRetoolPricing", () => {
  it("quotes the plain retool fee for a method without a downside", () => {
    expect(strategyRetoolPricing(input, [], "lean").retoolCost).toBe(
      1000 * STRATEGY_RETOOL_COST_FRACTION
    );
  });

  it("adds the downside charge the retool command bills", () => {
    // 25% fee plus humanoid robotics' 30% downside charge.
    expect(strategyRetoolPricing(input, [], "humanoid_robotics").retoolCost).toBe(550);
  });
});

it("uses the host denomination and actual corporation currency for the foreign spread", () => {
  const quote = strategyRetoolPricing(
    { ...input, sectorHostLiquidCode: "JPY", sectorHostFxRate: 100, corporationLiquidCode: "USD" },
    [],
    "humanoid_robotics"
  );
  expect(quote.baseRetoolCost).toBe(2.5);
  expect(quote.downsideCharge).toBe(3);
  expect(quote.foreignSpread).toBeGreaterThan(0);
  expect(quote.retoolCost).toBeCloseTo(5.5 + quote.foreignSpread);
});
