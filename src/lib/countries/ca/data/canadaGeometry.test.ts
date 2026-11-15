import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { caRegions2027 } from "./caRegions2027";
import { CANADA_GEO_URL, CA_REGION_CODES } from "./canadaGeometry";

describe("Canada map geometry", () => {
  const shard = JSON.parse(readFileSync(`public${CANADA_GEO_URL}`, "utf8")) as {
    features: { properties: { regionCode?: string }; geometry: { type: string } }[];
  };

  it("lists every province and territory once", () => {
    expect([...CA_REGION_CODES].sort()).toEqual(caRegions2027.map((r) => r._id).sort());
  });

  it("ships one tagged polygon feature per region", () => {
    const codes = shard.features.map((f) => f.properties.regionCode);
    expect([...codes].sort()).toEqual([...CA_REGION_CODES].sort());
    for (const f of shard.features) {
      expect(["Polygon", "MultiPolygon"]).toContain(f.geometry.type);
    }
  });

  it("stays small enough to load with the map page", () => {
    expect(readFileSync(`public${CANADA_GEO_URL}`).byteLength).toBeLessThan(150_000);
  });
});
