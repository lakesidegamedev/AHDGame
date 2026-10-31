import { describe, expect, it } from "vitest";
import {
  fundedSellThrough,
  nppDemandThrottle,
  nppOperatingCapacityUnits,
} from "./fundedSellThrough";

const EPOCH = "epoch-1";
const receipt = (over: Record<string, unknown> = {}) => ({
  worldEpoch: EPOCH,
  capacityUnits: 100,
  offeredUnits: 40,
  soldUnits: 40,
  ...over,
});

describe("fundedSellThrough", () => {
  it("is sold over offered, clamped to [0, 1]", () => {
    expect(fundedSellThrough({ producerSettlement: receipt() }, EPOCH)).toBe(1);
    expect(fundedSellThrough({ producerSettlement: receipt({ soldUnits: 10 }) }, EPOCH)).toBe(0.25);
    expect(fundedSellThrough({ producerSettlement: receipt({ soldUnits: 50 }) }, EPOCH)).toBe(1);
  });

  it("has no reading without an offer or a receipt from this world", () => {
    expect(fundedSellThrough({}, EPOCH)).toBeNull();
    expect(fundedSellThrough({ producerSettlement: receipt({ offeredUnits: 0 }) }, EPOCH)).toBe(
      null
    );
    expect(
      fundedSellThrough({ producerSettlement: receipt({ worldEpoch: "old" }) }, EPOCH)
    ).toBeNull();
  });
});

describe("nppDemandThrottle", () => {
  it("reads the legacy throttle on a legacy world", () => {
    const sector = { demandThrottleFactor: 0.4, producerSettlement: receipt() };
    expect(nppDemandThrottle(sector, undefined)).toBe(0.4);
    expect(nppDemandThrottle({}, undefined)).toBeNull();
  });

  it("reads sell-through on a funded world, never the funded throttle", () => {
    expect(
      nppDemandThrottle({ demandThrottleFactor: 0.4, producerSettlement: receipt() }, EPOCH)
    ).toBe(1);
    expect(nppDemandThrottle({ demandThrottleFactor: 0.4 }, EPOCH)).toBeNull();
  });
});

describe("nppOperatingCapacityUnits", () => {
  it("takes daily capacity from the funded receipt", () => {
    const sector = { operatingCapacityUnits: 999, producerSettlement: receipt() };
    expect(nppOperatingCapacityUnits(sector, EPOCH)).toBe(2400);
    expect(nppOperatingCapacityUnits(sector, undefined)).toBe(999);
    expect(nppOperatingCapacityUnits({ operatingCapacityUnits: 999 }, EPOCH)).toBeNull();
  });
});
