import { describe, expect, it } from "vitest";
import { validateCatalog } from "@/lib/politicalLegislation/validate";
import { JP_LAWS } from "./jpLaws";

describe("JP law book", () => {
  it("passes the full catalog validator", () => {
    expect(validateCatalog(JP_LAWS, "JP")).toEqual([]);
  });

  it("carries 63 primaries, 41 secondaries and 6 tax laws", () => {
    expect(JP_LAWS.filter((l) => l.kind === "primary")).toHaveLength(63);
    expect(JP_LAWS.filter((l) => l.kind === "secondary")).toHaveLength(41);
    expect(JP_LAWS.filter((l) => l.kind === "tax")).toHaveLength(6);
  });

  it("uses no em or en dashes in player copy", () => {
    const copy = JP_LAWS.flatMap((l) => [
      l.title,
      l.description,
      ...(l.levels ?? []).flatMap((lv) => [lv.name, lv.description]),
      ...(l.taxPolicy?.waypoints ?? []).map((w) => w.label),
    ]);
    expect(copy.filter((s) => /[–—]/.test(s))).toEqual([]);
  });

  it("opens every price level above the previous one", () => {
    for (const law of JP_LAWS.filter((l) => l.levels)) {
      const cost = (i: number) =>
        (law.levels![i].gdpCostFraction ?? 0) + (law.levels![i].incomeCostFraction ?? 0);
      for (let i = 2; i < 5; i++) expect(cost(i), law.id).toBeGreaterThanOrEqual(cost(i - 1));
    }
  });
});
