import { describe, expect, it } from "vitest";
import { plantBuildProgress } from "./plantBuildProgress";
import { summarizeBuildQueue } from "@/lib/corporations/sectorBuildQueue";
import { deliveredFraction } from "@/lib/corporations/buildDelivery";
import type { SectorBuildOrder } from "@/lib/db/types";

const order = (over: Partial<SectorBuildOrder>): SectorBuildOrder => ({
  unitsOrdered: 8_500,
  costPaidAnchor: 1_000,
  startTurn: 100,
  onlineTurn: 200,
  smooth: true,
  deliveryBaseFraction: 0,
  ...over,
});

describe("plantBuildProgress", () => {
  it("counts a plant as built only once all of it has arrived", () => {
    const p = plantBuildProgress([{ unitsOrdered: 1_000, unitsDelivered: 990 }], 100);
    expect(p).toEqual({ ordered: 10, built: 9, building: 1 });
  });

  it("never reports more built than ordered", () => {
    const p = plantBuildProgress([{ unitsOrdered: 300, unitsDelivered: 9_999 }], 100);
    expect(p).toEqual({ ordered: 3, built: 3, building: 0 });
  });

  it("matches the sector panel and the Operations table on the same queue", () => {
    const queue = [order({}), order({ unitsOrdered: 3_700, startTurn: 120, onlineTurn: 180 })];
    const size = 100;
    const currentTurn = 150;
    const settled = 149;
    // Sector panel: per order, from the order's own settled delivery.
    const panel = queue
      .map((o) =>
        plantBuildProgress(
          [
            {
              unitsOrdered: o.unitsOrdered,
              unitsDelivered: o.unitsOrdered * deliveredFraction(o, settled),
            },
          ],
          size
        )
      )
      .reduce((a, b) => ({
        ordered: a.ordered + b.ordered,
        built: a.built + b.built,
        building: a.building + b.building,
      }));
    // Operations table: the list summary through the same helper.
    const summary = summarizeBuildQueue(queue, currentTurn, settled);
    expect(plantBuildProgress(summary?.orderUnits ?? [], size)).toEqual(panel);
  });

  it("stops counting delivery at the settled turn, not the schedule", () => {
    const queue = [order({})];
    const caughtUp = summarizeBuildQueue(queue, 150, 150);
    const lagging = summarizeBuildQueue(queue, 150, 110);
    const built = (s: typeof caughtUp) => plantBuildProgress(s?.orderUnits ?? [], 100).built;
    expect(built(lagging)).toBeLessThan(built(caughtUp));
  });
});
