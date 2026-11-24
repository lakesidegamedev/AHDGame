import { describe, expect, it } from "vitest";
import { fundedCostParts } from "./fundedCostParts";

describe("fundedCostParts", () => {
  it("splits the site bill into idle upkeep and running costs per day", () => {
    const parts = fundedCostParts(
      {
        otherOperatingPaid: 90,
        otherOperatingArrears: 10,
        idleOperatingCost: 30,
        minorInputPremium: 2,
        inventoryWriteOff: 1,
      },
      { managementOverhead: 5, growthCost: 7 },
      2,
      (n) => n * 10
    );
    expect(parts.idleUpkeepAnchor).toBe(60);
    expect(parts.siteRunningAnchor).toBe(140);
    expect(parts.minorInputPremiumAnchor).toBe(4);
    expect(parts.inventoryWriteOffAnchor).toBe(2);
    expect(parts.managementOverheadAnchor).toBe(50);
    expect(parts.growthAnchor).toBe(70);
  });

  it("caps idle upkeep at the bill and marks unrecorded legs null", () => {
    const parts = fundedCostParts(
      { otherOperatingPaid: 10, idleOperatingCost: 50 },
      {},
      1,
      (n) => n
    );
    expect(parts.idleUpkeepAnchor).toBe(10);
    expect(parts.siteRunningAnchor).toBe(0);
    expect(parts.managementOverheadAnchor).toBeNull();
    expect(parts.growthAnchor).toBeNull();
  });
});
