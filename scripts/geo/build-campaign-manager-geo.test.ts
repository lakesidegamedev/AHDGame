import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The Campaign Manager map assets: every region and sub-unit they draw must be
 * one the game's subdivision data knows, or a sub-unit's live shares would
 * have nothing to land on.
 */

const ROOT = path.resolve(__dirname, "../..");

interface CampaignGeo {
  w: number;
  h: number;
  regions: Record<string, { n: string; d: string; bb: number[]; nb: string[] }>;
  units: Record<string, Array<{ id: string; n: string; d: string }>>;
  frame?: string;
}

describe.each(["uk", "jp"])("%s campaign map geo", (cc) => {
  const file = path.join(ROOT, "public/geo/campaign-manager", `${cc}.json`);
  const dataDir = path.join(ROOT, "src/data/subdivisions", cc);

  it("exists and stays under 1.5 MB", () => {
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBeLessThan(1.5 * 1024 * 1024);
  });

  it("draws exactly the game's regions, with neighbours among them", () => {
    const geo = JSON.parse(fs.readFileSync(file, "utf8")) as CampaignGeo;
    const regions = fs
      .readdirSync(dataDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(Object.keys(geo.regions).sort()).toEqual(regions);
    expect(Object.keys(geo.units).sort()).toEqual(regions);
    for (const r of Object.values(geo.regions)) {
      expect(r.bb).toHaveLength(4);
      for (const nb of r.nb) expect(regions).toContain(nb);
    }
  });

  it("draws every sub-unit the game's data has, by id", () => {
    const geo = JSON.parse(fs.readFileSync(file, "utf8")) as CampaignGeo;
    for (const code of Object.keys(geo.units)) {
      const data = JSON.parse(fs.readFileSync(path.join(dataDir, `${code}.json`), "utf8")) as {
        subdivisions: Array<{ id: string }>;
      };
      expect(geo.units[code].map((u) => u.id).sort()).toEqual(
        data.subdivisions.map((s) => s.id).sort()
      );
      for (const u of geo.units[code]) expect(u.d.startsWith("M")).toBe(true);
    }
  });
});
