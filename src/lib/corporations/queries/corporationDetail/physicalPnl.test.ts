import { describe, it, expect } from "vitest";
import { buildPhysicalPnl } from "./physicalPnl";
import type { PhysicalRollups } from "./sectorRows";

function rollups(over: Partial<PhysicalRollups> = {}): PhysicalRollups {
  return {
    totalCapacityUnits: 1000,
    totalProducedUnits: 800,
    totalSoldUnits: 600,
    totalOwnSiteUnits: 0,
    totalConstructionInProgressAnchor: 50,
    mothballedSectorCount: 1,
    buildingSectorCount: 2,
    totalUnitsOnOrder: 120,
    ...over,
  };
}

describe("buildPhysicalPnl (#587)", () => {
  it("returns null outside plants, never a half-read object", () => {
    expect(buildPhysicalPnl(false, rollups(), 3)).toBeNull();
  });

  it("computes corp-wide fill as sold over produced, not a mean of sector ratios", () => {
    // A mean-of-ratios would let one tiny plant at 5% fill drag the headline;
    // the ratio of totals keeps the corp's actual sell-through.
    const physical = buildPhysicalPnl(true, rollups(), 3);
    expect(physical?.fillRate).toBeCloseTo(600 / 800, 10);
  });

  it("reads the settled sold share the rows show, weighted by units offered", () => {
    // 100 offered at 60% sold and 300 offered at 100% sold. Made-versus-sold would
    // say 600/800; the rows' own shares give (60 + 300) / 400.
    const physical = buildPhysicalPnl(
      true,
      rollups({ soldShareWeighted: 100 * 0.6 + 300 * 1, soldShareWeight: 400 }),
      2
    );
    expect(physical?.fillRate).toBeCloseTo(0.9, 10);
  });

  it("rounds without converting: output equals the already corp-currency inputs", () => {
    const physical = buildPhysicalPnl(
      true,
      rollups({
        totalCapacityUnits: 1000.4,
        totalProducedUnits: 800.5,
        totalSoldUnits: 600.49,
        totalOwnSiteUnits: 0,
        totalConstructionInProgressAnchor: 50.6,
        totalUnitsOnOrder: 120.2,
      }),
      3
    );
    // Single-currency behavior: this rollup never touches FX, it only rounds
    // the restated rollups it is given.
    expect(physical?.capacityUnits).toBe(1000);
    expect(physical?.producedUnits).toBe(801);
    expect(physical?.soldUnits).toBe(600);
    expect(physical?.constructionInProgressAnchor).toBe(51);
    expect(physical?.unitsOnOrder).toBe(120);
  });

  it("carries counts through untouched", () => {
    const physical = buildPhysicalPnl(true, rollups(), 3);
    expect(physical?.buildingSectorCount).toBe(2);
    expect(physical?.mothballedSectorCount).toBe(1);
    expect(physical?.sectorCount).toBe(3);
  });

  it("handles zero production without NaN fill", () => {
    const physical = buildPhysicalPnl(
      true,
      rollups({ totalProducedUnits: 0, totalSoldUnits: 0 }),
      1
    );
    expect(physical?.fillRate).toBeNull();
    expect(physical?.capacityUnits).toBe(1000);
  });
});
