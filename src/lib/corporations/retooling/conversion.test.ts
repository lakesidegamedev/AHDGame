import { describe, expect, it } from "vitest";
import { revenuePerCapacityUnitForStrategy } from "@/lib/constants/capacityEconomy";
import { conversionStrategyId, industryConversionFields } from "./conversion";

describe("industry conversion at book value", () => {
  const media = {
    sectorType: "media" as const,
    strategyId: "standard",
    capitalStock: 200,
    buildQueue: [{ unitsOrdered: 50, costPaidAnchor: 1000, startTurn: 1, onlineTurn: 5 }],
    otherOpexPerUnitAnchor: 4,
  };

  it("keeps nameplate revenue and money opex while moving to the new lane", () => {
    const result = industryConversionFields(media, "construction");
    if (!result.ok) throw new Error(result.reason);
    const rpuFrom = revenuePerCapacityUnitForStrategy("media", "standard", 1);
    const rpuTo = revenuePerCapacityUnitForStrategy("construction", "standard", 1);
    expect(result.ratio).toBeCloseTo(rpuFrom / rpuTo);
    expect((result.set.capitalStock as number) * rpuTo).toBeCloseTo(200 * rpuFrom);
    const queue = result.set.buildQueue as { unitsOrdered: number; costPaidAnchor: number }[];
    expect(queue[0].unitsOrdered).toBeCloseTo(50 * result.ratio);
    expect(queue[0].costPaidAnchor).toBe(1000);
    expect(
      (result.set.otherOpexPerUnitAnchor as number) * (result.set.capitalStock as number)
    ).toBeCloseTo(4 * 200);
    expect(result.set).toMatchObject({
      sectorType: "construction",
      strategyId: "standard",
      producerQuotes: {},
    });
  });

  it("maps composite lanes to their persisted identity", () => {
    const result = industryConversionFields(media, "manufacturing_vehicles");
    if (!result.ok) throw new Error(result.reason);
    expect(result.set).toMatchObject({ sectorType: "manufacturing", industryModel: "vehicles" });
  });

  it("refuses a conversion into the same lane", () => {
    expect(industryConversionFields(media, "media").ok).toBe(false);
  });

  it("uses a requested production method only when the lane offers it", () => {
    expect(conversionStrategyId("construction", "not-a-method")).toBe("standard");
  });
});
