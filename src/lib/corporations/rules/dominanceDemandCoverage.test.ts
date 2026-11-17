import { describe, expect, it } from "vitest";
import { demandAdjustedSharePercent, demandCoverage } from "./dominanceDemandCoverage";
import type { BuildDemandRow } from "./fundedBuildDemand";

const row = (
  scope: "regional" | "national",
  funded: number | null,
  delivered: number | null
): BuildDemandRow => ({
  commodity: "electronics" as BuildDemandRow["commodity"],
  scope,
  funded,
  delivered,
  unmet: null,
});

describe("demandCoverage", () => {
  it("is served / funded for the scope", () => {
    expect(
      demandCoverage([row("regional", 100, 3), row("national", 400, 40)], "regional")
    ).toBeCloseTo(0.03);
    expect(
      demandCoverage([row("regional", 100, 3), row("national", 400, 40)], "national")
    ).toBeCloseTo(0.1);
  });
  it("caps at 1 and gives no relief when unmeasured or empty", () => {
    expect(demandCoverage([row("regional", 10, 50)], "regional")).toBe(1);
    expect(demandCoverage([row("regional", null, null)], "regional")).toBe(1);
    expect(demandCoverage([row("regional", 0, 0)], "regional")).toBe(1);
    expect(demandCoverage(undefined, "regional")).toBe(1);
  });
  it("takes the best-served output", () => {
    expect(
      demandCoverage([row("regional", 100, 10), row("regional", 100, 60)], "regional")
    ).toBeCloseTo(0.6);
  });
});

describe("demandAdjustedSharePercent", () => {
  it("scales a sole seller of an unserved market down", () => {
    expect(demandAdjustedSharePercent(100, 0.03)).toBeCloseTo(3);
  });
  it("leaves a fully served market unchanged", () => {
    expect(demandAdjustedSharePercent(80, 1)).toBe(80);
  });
});
