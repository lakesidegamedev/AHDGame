import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CampaignGeo } from "@/app/campaign-manager/map/geoSource";
import { CA_GEOGRAPHY_REGIONS } from "./rules/localGeography";
import { loadSubdivisionFile } from "@/lib/maps/subdivisionData";
import { getSubdivisionMode } from "@/lib/maps/subdivisionConfig";

describe("Canadian Campaign Manager geography", () => {
  const geo: CampaignGeo = JSON.parse(readFileSync("public/geo/campaign-manager/ca.json", "utf8"));

  it("keeps official province outlines and both local layers in one qualified frame", async () => {
    expect(geo.supportedPresets).toEqual(["2027-default"]);
    expect(Object.keys(geo.regions).sort()).toEqual([...CA_GEOGRAPHY_REGIONS].sort());
    expect(geo.units).toBeNull();
    expect(geo.clipUnitsToRegions).toBe(true);
    const counts: Record<string, number> = {};
    for (const [layerName, layer] of Object.entries(geo.unitLayers!)) {
      counts[layerName] = 0;
      for (const region of CA_GEOGRAPHY_REGIONS) {
        const source = (await loadSubdivisionFile(`subdivisions/ca/${layerName}`, region, {
          preset: "2027-default",
        }))!;
        const units = layer.units[region];
        expect(units.map((u) => [u.id, u.n])).toEqual(
          source.subdivisions.map((u) => [u.id, u.name])
        );
        counts[layerName] += units.length;
        for (const unit of units) {
          expect(unit.d).toMatch(/^M/);
          expect(unit.d).not.toMatch(/NaN|Infinity/);
          for (const point of unit.d.matchAll(/[ML](-?\d+\.\d+),(-?\d+\.\d+)/g)) {
            // Legal water extents can fall outside the land frame; the map clips them.
            expect(Number.isFinite(Number(point[1]))).toBe(true);
            expect(Number.isFinite(Number(point[2]))).toBe(true);
          }
        }
        expect(geo.regions[region].nb.every((id) => id !== region && geo.regions[id])).toBe(true);
        const [x0, y0, x1, y1] = geo.regions[region].bb;
        expect(x0 >= 0 && y0 >= 0 && x1 <= geo.w && y1 <= geo.h).toBe(true);
      }
    }
    expect(counts).toEqual({ "federal-ridings": 343, "census-divisions": 293 });
  });

  it("matches the election map authority without assigning federal ridings to provincial races", () => {
    for (const [type, layer] of Object.entries(geo.unitLayerByType!)) {
      expect(getSubdivisionMode("CA", type)?.config.dataDir.endsWith(layer)).toBe(true);
    }
    expect(geo.unitLayerByType?.caCommons).toBe("federal-ridings");
    expect(geo.unitLayerByType?.special_caCommons).toBe("federal-ridings");
    expect(geo.unitLayerByType?.special_governor).toBe("census-divisions");
    expect(geo.unitLayerByType?.provincialLegislature).toBe("census-divisions");
    expect(geo.unitLayerByType?.governor).toBe("census-divisions");
    expect(geo.unitLayerByType?.caSenate).toBeUndefined();
  });
});
