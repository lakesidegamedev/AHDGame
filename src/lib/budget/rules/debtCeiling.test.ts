import { describe, expect, it } from "vitest";
import { debtCeilingBindingYear } from "./debtCeiling";

const points = (ratios: number[]) => ratios.map((debtToGdp, year) => ({ year, debtToGdp }));

const base = {
  gdp: 1_000,
  debtPrincipal: 500,
  storedCeiling: 600,
  countryId: "US",
  realGrowthPct: 0,
};

describe("debtCeilingBindingYear", () => {
  it("names the first year the projected stock crosses the limit", () => {
    // 50% of GDP now (500), growing to 55, 60, 65 percent.
    const r = debtCeilingBindingYear({ ...base, points: points([0.5, 0.55, 0.6, 0.65]) });
    expect(r).toEqual({ kind: "within", year: 3 });
  });

  it("reports a ceiling already exceeded", () => {
    expect(
      debtCeilingBindingYear({ ...base, debtPrincipal: 700, points: points([0.7, 0.7]) })
    ).toEqual({ kind: "already" });
  });

  it("reports the limit not being reached inside the horizon", () => {
    expect(debtCeilingBindingYear({ ...base, points: points([0.5, 0.52, 0.54, 0.56]) })).toEqual({
      kind: "beyond",
    });
  });

  it("breaches sooner when GDP grows against a fixed stored ceiling", () => {
    // A constant ratio still grows the debt stock with GDP, so a fixed ceiling
    // arrives sooner. Flat GDP stays under 600 for both years.
    const flat = debtCeilingBindingYear({ ...base, points: points([0.45, 0.45, 0.6]) });
    expect(flat).toEqual({ kind: "beyond" });
    const growing = debtCeilingBindingYear({
      ...base,
      realGrowthPct: 20,
      points: points([0.45, 0.45, 0.6]),
    });
    expect(growing).toEqual({ kind: "within", year: 2 });
  });

  it("uses the East German GDP floor instead of a frozen small ceiling", () => {
    // Stored ceiling 100 is below 40% of GDP, so the effective limit is 400.
    const r = debtCeilingBindingYear({
      ...base,
      countryId: "DD",
      storedCeiling: 100,
      debtPrincipal: 300,
      points: points([0.3, 0.35, 0.4, 0.45]),
    });
    expect(r).toEqual({ kind: "within", year: 3 });
  });

  it("returns none without a usable ceiling or GDP", () => {
    expect(debtCeilingBindingYear({ ...base, storedCeiling: 0, points: points([1, 2]) })).toEqual({
      kind: "none",
    });
    expect(debtCeilingBindingYear({ ...base, gdp: 0, points: points([1, 2]) })).toEqual({
      kind: "none",
    });
  });
});
