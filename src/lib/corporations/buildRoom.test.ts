import { describe, expect, it } from "vitest";
import { buildRoomUnits, listsBuildOutputs, queuedUndeliveredUnits } from "./buildRoom";
import { fullMixBuildRoom } from "./rules/buildDemandCapacity";
import { getStrategy } from "@/lib/constants/sectorStrategies";

describe("room to build", () => {
  it("counts only capacity still to be delivered", () => {
    const queue = [
      {
        unitsOrdered: 100,
        costPaidAnchor: 1,
        startTurn: 10,
        onlineTurn: 20,
        smooth: true,
        deliveryBaseFraction: 0,
      },
      {
        unitsOrdered: 50,
        costPaidAnchor: 1,
        startTurn: 10,
        onlineTurn: 20,
        deliveryBaseFraction: 0,
      },
    ];
    // Both orders are half delivered at turn 15.
    expect(queuedUndeliveredUnits(queue, 15)).toBeCloseTo(50 + 25);
    expect(queuedUndeliveredUnits(queue, 20)).toBe(0);
    expect(queuedUndeliveredUnits(undefined, 15)).toBe(0);
  });

  it("is unmet demand less queued capacity, never negative", () => {
    expect(buildRoomUnits(1533, 300)).toBe(1233);
    expect(buildRoomUnits(100, 300)).toBe(0);
  });

  it("gives a store no per-product rows, so its room comes from unserved store demand", () => {
    // Per-product rows for a mix that makes nothing give no figure at all, and
    // the state page then showed neither the room card nor its Build here link.
    expect(fullMixBuildRoom([])).toBeNull();
    expect(listsBuildOutputs(getStrategy("retail", "standard").supply ?? {})).toBe(false);
    expect(listsBuildOutputs(getStrategy("manufacturing", "standard").supply ?? {})).toBe(true);
    expect(listsBuildOutputs({ advertising: 0 })).toBe(false);
  });
});
