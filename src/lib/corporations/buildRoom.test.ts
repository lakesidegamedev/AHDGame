import { describe, expect, it } from "vitest";
import { buildRoomUnits, queuedUndeliveredUnits } from "./buildRoom";

describe("room to build", () => {
  it("counts only capacity still to be delivered", () => {
    const queue = [
      { unitsOrdered: 100, costPaidAnchor: 1, startTurn: 10, onlineTurn: 20, smooth: true },
      { unitsOrdered: 50, costPaidAnchor: 1, startTurn: 10, onlineTurn: 20 },
    ];
    // Smooth order half delivered at turn 15; all-at-once order not landed yet.
    expect(queuedUndeliveredUnits(queue, 15)).toBeCloseTo(50 + 50);
    expect(queuedUndeliveredUnits(queue, 20)).toBe(0);
    expect(queuedUndeliveredUnits(undefined, 15)).toBe(0);
  });

  it("is unmet demand less queued capacity, never negative", () => {
    expect(buildRoomUnits(1533, 300)).toBe(1233);
    expect(buildRoomUnits(100, 300)).toBe(0);
  });
});
