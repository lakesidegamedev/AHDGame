import { describe, expect, it } from "vitest";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporationsClient";
import { backgroundSectorMass } from "./backgroundEconomy";

const state = { _id: "CA", countryId: "US", gdp: 1_000_000 };

describe("backgroundSectorMass", () => {
  it("returns one positive revenue term per operating lane", () => {
    const mass = backgroundSectorMass(state, "1991-default");
    expect(mass.map((row) => row.sectorType)).toEqual([...OPERATING_SECTOR_TYPES]);
    expect(mass.every((row) => row.revenue > 0)).toBe(true);
  });

  it("is a pure function of the region doc and preset", () => {
    expect(backgroundSectorMass(state, "1991-default")).toEqual(
      backgroundSectorMass({ ...state }, "1991-default")
    );
  });

  it("scales with regional GDP", () => {
    const small = backgroundSectorMass({ ...state, gdp: 1_000_000 }, "1991-default");
    const large = backgroundSectorMass({ ...state, gdp: 4_000_000 }, "1991-default");
    const sum = (rows: { revenue: number }[]) =>
      rows.reduce((total, row) => total + row.revenue, 0);
    expect(sum(large)).toBeGreaterThan(sum(small));
  });

  it("treats a missing GDP as no background economy beyond the era floor", () => {
    const mass = backgroundSectorMass({ ...state, gdp: Number.NaN }, "1991-default");
    expect(mass.every((row) => Number.isFinite(row.revenue))).toBe(true);
  });
});
