import { describe, it, expect } from "vitest";
import type { CommodityType } from "@/lib/constants/commodities";
import { sectorDeliveryLimited } from "./deliveryLimited";

const stateRatio = new Map([
  ["IN", new Map<CommodityType, number>([["building_materials", 0.97]])],
]);
const ownerRatio = (fraction: number) =>
  new Map([
    [
      "corp1",
      new Map([["IN", new Map<CommodityType, number>([["building_materials", fraction]])]]),
    ],
  ]);
const supply = { building_materials: 100 } as Partial<Record<CommodityType, number>>;

describe("sectorDeliveryLimited", () => {
  it("shows the owner's own figure while the state figure is high", () => {
    const r = sectorDeliveryLimited(
      {
        stateDeliveryLimitedRatioByState: stateRatio,
        ownerDeliveryLimitedRatioByCorp: ownerRatio(0.04),
      },
      "IN",
      supply,
      "corp1"
    );
    expect(r.fraction).toBeCloseTo(0.04);
    expect(r.freightClass).not.toBeNull();
  });

  it("falls back to the state figure for a corporation with no measured slice", () => {
    const lookups = {
      stateDeliveryLimitedRatioByState: stateRatio,
      ownerDeliveryLimitedRatioByCorp: ownerRatio(0.04),
    };
    expect(sectorDeliveryLimited(lookups, "IN", supply, "corp2").fraction).toBeCloseTo(0.97);
    expect(sectorDeliveryLimited(lookups, "IN", supply).fraction).toBeCloseTo(0.97);
  });

  it("is zero when the state has no measured limit", () => {
    expect(
      sectorDeliveryLimited(
        {
          stateDeliveryLimitedRatioByState: new Map(),
          ownerDeliveryLimitedRatioByCorp: ownerRatio(0.5),
        },
        "IN",
        supply,
        "corp1"
      ).fraction
    ).toBe(0);
  });
});
