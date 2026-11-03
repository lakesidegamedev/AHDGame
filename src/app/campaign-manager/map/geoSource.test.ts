import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/elections/[id]/blend/presMap/usStatesGeo", () => ({
  MAP_WIDTH: 960,
  MAP_HEIGHT: 600,
  COUNTY_OFFSET_Y: 50,
  loadUsStateGeo: vi.fn(async () => [
    { id: "OH", d: "M0,0Z", centroid: [5, 5], width: 10, height: 10, x0: 0, y0: 0 },
    { id: "PA", d: "M11,0Z", centroid: [16, 5], width: 10, height: 10, x0: 11, y0: 0 },
    { id: "CA", d: "M90,90Z", centroid: [95, 95], width: 10, height: 10, x0: 90, y0: 90 },
  ]),
}));

import { boxesTouch, loadCampaignGeo } from "./geoSource";

afterEach(() => vi.unstubAllGlobals());

describe("loadCampaignGeo", () => {
  it("has no map for a country without one", async () => {
    expect(await loadCampaignGeo("DE")).toBeNull();
  });

  it("builds US regions from the presidential state outlines, units from results", async () => {
    const geo = (await loadCampaignGeo("US"))!;
    expect(geo.w).toBe(960);
    expect(geo.unitSource).toBe("results");
    expect(geo.unitOffsetY).toBe(50);
    expect(geo.regions.OH.bb).toEqual([0, 0, 10, 10]);
    expect(geo.regions.OH.nb).toEqual(["PA"]);
    expect(geo.regions.CA.nb).toEqual([]);
  });

  it("reads the pre-projected UK and JP assets", async () => {
    const asset = {
      w: 975,
      h: 610,
      regions: { KAN: { n: "Kanto", d: "M0,0Z", bb: [0, 0, 5, 5], nb: [] } },
      units: { KAN: [{ id: "JP-13", n: "Tokyo", d: "M1,1Z" }] },
      frame: "M0,0H5",
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(asset)));
    vi.stubGlobal("fetch", fetchMock);
    const geo = (await loadCampaignGeo("JP"))!;
    expect(fetchMock).toHaveBeenCalledWith("/geo/campaign-manager/jp.json", expect.anything());
    expect(geo.unitSource).toBe("static");
    expect(geo.units?.KAN[0].id).toBe("JP-13");
    expect(geo.frame).toBe("M0,0H5");
  });

  it("returns null when an asset fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 }))
    );
    expect(await loadCampaignGeo("UK")).toBeNull();
  });
});

describe("boxesTouch", () => {
  it("counts boxes within slack as neighbours", () => {
    expect(boxesTouch([0, 0, 10, 10], [12, 0, 20, 10])).toBe(true);
    expect(boxesTouch([0, 0, 10, 10], [20, 0, 30, 10])).toBe(false);
  });
});
