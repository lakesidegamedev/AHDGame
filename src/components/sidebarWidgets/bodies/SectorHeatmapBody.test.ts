import { describe, expect, it } from "vitest";
import { foldTiles } from "./SectorHeatmapBody";

const tile = (type: string, marketCap: number, change: number) => ({
  type,
  label: type,
  marketCap,
  change,
  listings: 1,
});

describe("foldTiles", () => {
  it("keeps the largest tiles and folds the rest into a cap-weighted Other", () => {
    const tiles = [tile("a", 50, 1), tile("b", 30, 2), tile("c", 15, -2), tile("d", 5, 4)];
    const folded = foldTiles(tiles, 3);
    expect(folded.map((t) => t.type)).toEqual(["a", "b", "other"]);
    expect(folded[2]).toMatchObject({ marketCap: 20, listings: 2 });
    expect(folded[2]!.change).toBeCloseTo((15 * -2 + 5 * 4) / 20, 5);
  });

  it("leaves short lists alone", () => {
    const tiles = [tile("a", 50, 1)];
    expect(foldTiles(tiles, 5)).toBe(tiles);
  });
});
