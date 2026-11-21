import { describe, expect, it } from "vitest";
import { productionProductivityMultiplier } from "./productionProductivity";
import { plantThroughputMultiplier } from "./plantThroughput";

describe("plant productivity basis", () => {
  it("preserves neutral output and applies both known productivity sources once", () => {
    const input = { sector: { sectorType: "energy" }, supply: { energy: 1 }, currentTurn: 100 };
    expect(productionProductivityMultiplier(input)).toBe(1);
    expect(
      productionProductivityMultiplier({ sector: { sectorType: "media" }, currentTurn: 100 })
    ).toBe(1);
    expect(productionProductivityMultiplier({ ...input, preset: "1991-default" })).toBe(1.3);
    expect(
      productionProductivityMultiplier({
        ...input,
        preset: "1991-default",
        outputRateMult: { energy: 2 },
      })
    ).toBe(2.6);
    expect(
      productionProductivityMultiplier({ ...input, preset: "1991-default", currentTurn: 48 })
    ).toBe(1);
  });

  it("increases quoted output for Standard stores in the 2027 preset", () => {
    const input = { sector: { sectorType: "retail" }, currentTurn: 46, preset: "2027-default" };
    expect(productionProductivityMultiplier(input)).toBe(1.26);
    expect(
      productionProductivityMultiplier({
        ...input,
        sector: { ...input.sector, strategyId: "ecommerce" },
      })
    ).toBe(1);
    expect(productionProductivityMultiplier({ ...input, preset: "2019-default" })).toBe(1);
  });

  it("phases the throughput change with a retail retool", () => {
    const sector = {
      sectorType: "retail",
      strategyId: "ecommerce",
      transitionFromStrategyId: "standard",
      transitionStartTurn: 46,
    };
    expect(plantThroughputMultiplier(sector, 46, "2027-default")).toBe(1.26);
    expect(plantThroughputMultiplier(sector, 52, "2027-default")).toBeCloseTo(1.13);
    expect(plantThroughputMultiplier(sector, 58, "2027-default")).toBe(1);
  });

  it("scales projected fintech output in 2027 and phases the increase during a retool", () => {
    const sector = {
      sectorType: "financial",
      strategyId: "fintech",
      transitionFromStrategyId: "standard",
      transitionStartTurn: 46,
    };
    const input = { sector, preset: "2027-default", currentTurn: 58 };
    expect(productionProductivityMultiplier(input)).toBe(3);
    expect(productionProductivityMultiplier({ ...input, currentTurn: 46 })).toBe(1);
    expect(productionProductivityMultiplier({ ...input, currentTurn: 52 })).toBe(2);
    expect(productionProductivityMultiplier({ ...input, preset: "2019-default" })).toBe(1);
    expect(
      productionProductivityMultiplier({ ...input, sector: { sectorType: "financial" } })
    ).toBe(1);
  });
});
