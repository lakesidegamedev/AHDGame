import { describe, it, expect } from "vitest";
import { loadSubdivisionFile } from "./subdivisionData";
import { formatSubdivisionLean } from "@/lib/utils/subdivisionResults";

describe("unavailable congressional lean", () => {
  it("retains unavailable status through the tooltip adapter instead of claiming Even", async () => {
    const file = await loadSubdivisionFile("congressional-districts", "MT", {
      preset: "2027-default",
    });
    expect(file?.subdivisions).toHaveLength(2);
    for (const district of file!.subdivisions) {
      expect(district.leanScalar).toBeUndefined();
      expect(formatSubdivisionLean(district.leanScalar, district.leanStatus)).toContain(
        "Unavailable"
      );
    }
    expect(formatSubdivisionLean(0, "unavailable")).toContain("Unavailable");
    expect(formatSubdivisionLean(0, "observed")).toBe("Even");
  });
});
describe("county map persisted population", () => {
  it("uses runtime county stocks, including zero, rather than baseline headcounts", async () => {
    const baseline = await loadSubdivisionFile("counties", "WY");
    expect(baseline).not.toBeNull();
    const stocks = new Map(baseline!.subdivisions.map((c, i) => [c.id, i === 0 ? 0 : 100 + i]));
    const current = await loadSubdivisionFile("counties", "WY", {
      preset: "1991-default",
      countyPopulations: stocks,
    });
    expect(current!.subdivisions.map((c) => c.electorate)).toEqual([...stocks.values()]);
    expect(
      await loadSubdivisionFile("counties", "WY", { countyPopulations: new Map() })
    ).toBeNull();
  });
  it.each([-1, NaN, Infinity, 0.5])("rejects malformed runtime headcounts (%s)", async (value) => {
    const baseline = await loadSubdivisionFile("counties", "WY");
    const populations = new Map(baseline!.subdivisions.map((c) => [c.id, 100]));
    populations.set(baseline!.subdivisions[0].id, value);
    expect(
      await loadSubdivisionFile("counties", "WY", { countyPopulations: populations })
    ).toBeNull();
  });
  it("rejects an unsafe aggregate even when individual headcounts are safe", async () => {
    const baseline = await loadSubdivisionFile("counties", "WY");
    const populations = new Map(baseline!.subdivisions.map((c) => [c.id, Number.MAX_SAFE_INTEGER]));
    expect(
      await loadSubdivisionFile("counties", "WY", { countyPopulations: populations })
    ).toBeNull();
  });
});

describe("international subdivision maps", () => {
  it.each([
    ["subdivisions/uk", "LON", 75],
    ["subdivisions/jp", "KAN", 7],
  ])("loads %s geometry with complete persisted weights", async (dataDir, region, count) => {
    const baseline = await loadSubdivisionFile(String(dataDir), String(region));
    expect(baseline?.subdivisions).toHaveLength(Number(count));
    const stocks = new Map(baseline!.subdivisions.map((s, i) => [s.id, i === 0 ? 0 : 100 + i]));
    const active = await loadSubdivisionFile(String(dataDir), String(region), {
      countyPopulations: stocks,
    });
    expect(active!.subdivisions.map((s) => s.electorate)).toEqual([...stocks.values()]);
    expect(active!.subdivisions.every((s) => s.path.length > 0)).toBe(true);
    stocks.delete(baseline!.subdivisions[0].id);
    expect(
      await loadSubdivisionFile(String(dataDir), String(region), { countyPopulations: stocks })
    ).toBeNull();
    expect(await loadSubdivisionFile(String(dataDir), String(region))).toEqual(baseline);
  });
  it("covers all 47 Japanese prefectures once in the correct parent regions", async () => {
    const { JP_REGIONS, JP_PREFECTURES } =
      await import("@/lib/countries/jp/data/jpRegionDirectory");
    const ids = new Set<string>();
    for (const region of JP_REGIONS) {
      const file = await loadSubdivisionFile("subdivisions/jp", region.id);
      const expected = JP_PREFECTURES.filter((p) => p.regionId === region.id).map(
        (p) => `JP-${String(p.id).padStart(2, "0")}`
      );
      expect(file!.subdivisions.map((s) => s.id)).toEqual(expected);
      for (const s of file!.subdivisions) {
        expect(ids.has(s.id)).toBe(false);
        ids.add(s.id);
      }
    }
    expect(ids.size).toBe(47);
  });
});
