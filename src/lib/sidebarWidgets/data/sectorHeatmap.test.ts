import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { buildSectorTiles, HEATMAP_TILES, loadSectorHeatmap, OTHER_SECTOR } from "./sectorHeatmap";

describe("buildSectorTiles", () => {
  it("sums market cap per sector and weights the change by it", () => {
    const tiles = buildSectorTiles([
      { type: "energy", typeLabel: "Energy", marketCapAnchor: 300, priceChange1h: 2 },
      { type: "energy", typeLabel: "Energy", marketCapAnchor: 100, priceChange1h: -2 },
      { type: "retail", typeLabel: "Retail", marketCap: 50, priceChange1h: -1 },
      { type: "retail", typeLabel: "Retail", marketCap: 0, priceChange1h: 40 },
      { typeLabel: "No type", marketCap: 10, priceChange1h: 1 },
    ]);
    expect(tiles).toEqual([
      { type: "energy", label: "Energy", marketCap: 400, change: 1, listings: 2 },
      { type: "retail", label: "Retail", marketCap: 50, change: -1, listings: 1 },
    ]);
  });

  it("folds the smallest sectors into one tile", () => {
    const listings = Array.from({ length: 12 }, (_, i) => ({
      type: `s${i}`,
      typeLabel: `S${i}`,
      marketCapAnchor: 100 - i,
      priceChange1h: i < HEATMAP_TILES - 1 ? 0 : 3,
    }));
    const tiles = buildSectorTiles(listings);
    expect(tiles).toHaveLength(HEATMAP_TILES);
    const other = tiles.at(-1)!;
    expect(other.type).toBe(OTHER_SECTOR);
    expect(other.listings).toBe(12 - (HEATMAP_TILES - 1));
    expect(other.change).toBeCloseTo(3, 9);
  });
});

describe("loadSectorHeatmap", () => {
  it("reads only the listing fields it needs from one snapshot", async () => {
    const findOne = vi.fn().mockResolvedValue({
      exchangeName: "NYSE",
      turn: 40,
      listings: [{ type: "energy", typeLabel: "Energy", marketCapAnchor: 10, priceChange1h: 1 }],
    });
    const db = { collection: () => ({ findOne }) } as unknown as Db;
    const data = await loadSectorHeatmap(db, "nyse");
    expect(data).toMatchObject({ exchange: "nyse", exchangeName: "NYSE", turn: 40 });
    expect(data?.tiles).toHaveLength(1);
    const projection = findOne.mock.calls[0]![1].projection;
    expect(Object.keys(projection)).not.toContain("listings");
    expect(projection["listings.priceChange1h"]).toBe(1);
  });

  it("returns null for unknown exchanges and missing snapshots", async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const db = { collection: () => ({ findOne }) } as unknown as Db;
    expect(await loadSectorHeatmap(db, "nowhere")).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
    expect(await loadSectorHeatmap(db, "global")).toBeNull();
  });
});
