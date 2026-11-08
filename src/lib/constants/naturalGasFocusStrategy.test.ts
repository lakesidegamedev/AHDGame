import { describe, expect, it } from "vitest";
import { getStrategy } from "@/lib/constants/sectorStrategies";
import { baseMarginRow } from "@/lib/economy/repricer/baseMargins";
import { focusedStrategyByResource } from "@/lib/turn/extractionAutoStrategy";

// A recipe that leans toward natural gas instead of oil.
describe("Natural Gas Focus extraction strategy", () => {
  it("makes more natural gas than oil, the mirror of Oil & Gas", () => {
    const gas = getStrategy("extraction", "natural_gas_drilling");
    const oil = getStrategy("extraction", "oil_gas");
    expect(gas.id).toBe("natural_gas_drilling");
    expect(gas.supply.natural_gas).toBe(oil.supply.oil);
    expect(gas.supply.oil).toBe(oil.supply.natural_gas);
    expect(gas.supply.natural_gas!).toBeGreaterThan(gas.supply.oil!);
  });

  it("earns the same base margin as Oil & Gas", () => {
    const gas = baseMarginRow("extraction", "natural_gas_drilling");
    const oil = baseMarginRow("extraction", "oil_gas");
    expect(gas).not.toBeNull();
    expect(gas!.bareMarginPct).toBeCloseTo(oil!.bareMarginPct, 6);
  });

  it("is the focused recipe for natural gas, while Oil & Gas stays the oil recipe", () => {
    const focus = focusedStrategyByResource();
    expect(focus.get("natural_gas")?.id).toBe("natural_gas_drilling");
    expect(focus.get("oil")?.id).toBe("oil_gas");
  });
});
