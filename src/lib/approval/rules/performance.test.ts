import { describe, expect, it } from "vitest";
import { performanceApproval, fiscalApprovalModifiers } from "./performance";

describe("scoped government performance", () => {
  it("rewards a country-wide improvement against fixed references", () => {
    const reference = 100;
    expect(performanceApproval([{ value: 100, reference, higherBetter: true }])).toBe(50);
    expect(performanceApproval([{ value: 110, reference, higherBetter: true }])).toBe(65);
    expect(performanceApproval([{ value: 120, reference, higherBetter: true }])).toBe(70);
    expect(performanceApproval([{ value: 80, reference, higherBetter: true }])).toBe(30);
  });
  it("respects lower-is-better and does not depend on other regions", () => {
    const metric = { value: 8, reference: 10, higherBetter: false };
    expect(performanceApproval([metric])).toBe(70);
    expect(performanceApproval([{ ...metric, value: 12 }])).toBe(30);
    expect(performanceApproval([])).toBe(50);
    expect(performanceApproval([{ ...metric, reference: NaN }])).toBe(50);
  });
  it("names national and regional fiscal penalties separately", () => {
    const national = fiscalApprovalModifiers(180, -5);
    const regional = fiscalApprovalModifiers(100, -5, true);
    expect(national.map((row) => row.id)).toEqual(["nationalDebt", "nationalDeficit"]);
    expect(regional.map((row) => row.id)).toEqual(["regionalDebt", "regionalDeficit"]);
    expect(regional.map((row) => row.effect)).toEqual([-10, -5]);
    expect(fiscalApprovalModifiers(0, 0)).toEqual([]);
  });

  it("rewards a region's own surplus like the national budget", () => {
    const surplus = fiscalApprovalModifiers(0, 1.5, true);
    expect(surplus.map((row) => row.id)).toEqual([
      "regionalBalancedBudget",
      "regionalFiscalDiscipline",
    ]);
    expect(surplus.every((row) => row.effect === 1)).toBe(true);
    expect(fiscalApprovalModifiers(10, 0.6, true).map((row) => row.id)).toEqual([
      "regionalDebt",
      "regionalBalancedBudget",
    ]);
    expect(fiscalApprovalModifiers(95, 2, true).map((row) => row.id)).not.toContain(
      "regionalFiscalDiscipline"
    );
  });
});

describe("performance components", () => {
  it("sums each metric's points into the performance score", async () => {
    const { performanceApproval, performanceComponents } = await import("./performance");
    const metrics = [
      { value: 80, reference: 100, higherBetter: true, label: "Output" },
      { value: 110, reference: 100, higherBetter: true, label: "Jobs" },
    ];
    expect(performanceComponents(metrics).map((part) => part.label)).toEqual(["Output", "Jobs"]);
    expect(performanceApproval(metrics)).toBe(47.5);
  });
});
