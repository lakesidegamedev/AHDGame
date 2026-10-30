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
});
