import { describe, it, expect } from "vitest";
import { loadSubdivisionFile } from "./subdivisionData";
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
