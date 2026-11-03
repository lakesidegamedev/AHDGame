import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import source from "@/data/county-population-source.json";
import { apportionPopulation } from "./rules";
describe("committed county population baseline", () => {
  it("covers every county once and reconciles to all 51 official Census state totals", () => {
    const ids = new Set<string>();
    let count = 0;
    for (const f of readdirSync(join(process.cwd(), "src/data/counties")).filter((f) =>
      f.endsWith(".json")
    )) {
      const { counties } = JSON.parse(
        readFileSync(join(process.cwd(), "src/data/counties", f), "utf8")
      ) as { counties: { fips: string; population: number }[] };
      const state = counties[0].fips.slice(0, 2);
      for (const c of counties) {
        expect(ids.has(c.fips)).toBe(false);
        ids.add(c.fips);
        expect(c.population).toBeGreaterThan(0);
        expect(Number.isSafeInteger(c.population)).toBe(true);
      }
      expect(counties.reduce((n, c) => n + c.population, 0)).toBe(
        source.stateTotalsByFips[state as keyof typeof source.stateTotalsByFips]
      );
      for (const target of [1, 1234567])
        expect(
          apportionPopulation(
            counties.map((c) => ({ id: c.fips, population: c.population })),
            target
          ).reduce((n, c) => n + c.population, 0)
        ).toBe(target);
      count += counties.length;
    }
    expect(count).toBe(3142);
    expect(ids.size).toBe(3142);
  });
});
