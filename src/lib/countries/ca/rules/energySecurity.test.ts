import { describe, expect, it } from "vitest";
import { CA_ENERGY_2025 } from "../data/caEnergy2025";
import { canadianEnergySecurity } from "./energySecurity";

describe("Canadian sourced energy-security baseline", () => {
  it("uses distinct, dated Canadian flow and inventory data without a foreign fixture", () => {
    const result = canadianEnergySecurity(CA_ENERGY_2025);
    expect(result.status).toBe("proxy");
    expect(result.value).toBeGreaterThan(0);
    expect(result.value).toBeLessThan(100);
    expect(result.source).toContain("2510005501");
    expect(result.source).toContain("2510008101");
    expect(result.source).not.toMatch(/US game|fallback|1991/);
    expect(result.note).toContain("73.4%");
    expect(result.note).toContain("not an IEA stockholding obligation");
    expect(result.note).toContain("outside this indicator's stock-cover boundary");
  });
  it("responds to Canadian imports and stocks while keeping fuel units separate", () => {
    const baseline = canadianEnergySecurity(CA_ENERGY_2025).value!;
    const change = (imports: number, stocks: number) =>
      canadianEnergySecurity({
        ...CA_ENERGY_2025,
        fuels: CA_ENERGY_2025.fuels.map((f) => ({
          ...f,
          annualImports: f.annualImports * imports,
          decemberClosingCommercialStock: f.decemberClosingCommercialStock * stocks,
        })),
      }).value!;
    expect(change(2, 1)).toBeGreaterThan(baseline);
    expect(change(1, 0)).toBeGreaterThan(baseline);
    expect(change(1, 2)).toBeLessThan(baseline);
    const scaled = canadianEnergySecurity({
      ...CA_ENERGY_2025,
      fuels: CA_ENERGY_2025.fuels.map((f) => ({
        ...f,
        annualImports: f.annualImports * 1000,
        annualDomesticUse: f.annualDomesticUse * 1000,
        decemberClosingCommercialStock: f.decemberClosingCommercialStock * 1000,
      })),
    });
    expect(scaled.value).toBeCloseTo(baseline, 12);
  });
  it("rejects missing fuels, invalid source shares and incorrect unit labels", () => {
    expect(() =>
      canadianEnergySecurity({ ...CA_ENERGY_2025, fuels: CA_ENERGY_2025.fuels.slice(0, 1) })
    ).toThrow();
    expect(() =>
      canadianEnergySecurity({ ...CA_ENERGY_2025, primaryProductionShares: { gas: 70 } })
    ).toThrow();
    expect(() =>
      canadianEnergySecurity({
        ...CA_ENERGY_2025,
        fuels: CA_ENERGY_2025.fuels.map((f) => ({ ...f, unit: "m3" })),
      })
    ).toThrow();
    expect(() =>
      canadianEnergySecurity({
        ...CA_ENERGY_2025,
        fuels: CA_ENERGY_2025.fuels.map((f) => ({
          ...f,
          decemberClosingCommercialStock: Number.NaN,
        })),
      })
    ).toThrow();
  });
});
