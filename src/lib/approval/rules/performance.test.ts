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
});

describe("performance components", () => {
  it("names the metrics behind the score", async () => {
    const { describePerformanceComponents, performanceApproval } = await import("./performance");
    const metrics = [
      { value: 80, reference: 100, higherBetter: true, label: "Output" },
      { value: 110, reference: 100, higherBetter: true, label: "Jobs" },
    ];
    const text = describePerformanceComponents(metrics);
    expect(text).toContain("Biggest drags: Output");
    expect(text).toContain("Biggest gains: Jobs");
    expect(performanceApproval(metrics)).toBe(47.5);
  });
});
