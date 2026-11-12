import { describe, expect, it } from "vitest";
import { validateCatalog } from "@/lib/politicalLegislation/validate";
import { CN_LAWS } from "./cnLaws";

describe("CN law book", () => {
  it("passes the full catalog validator", () => {
    expect(validateCatalog(CN_LAWS, "CN")).toEqual([]);
  });

  it("carries 63 primaries, 41 secondaries and 6 tax laws", () => {
    expect(CN_LAWS.filter((l) => l.kind === "primary")).toHaveLength(63);
    expect(CN_LAWS.filter((l) => l.kind === "secondary")).toHaveLength(41);
    expect(CN_LAWS.filter((l) => l.kind === "tax")).toHaveLength(6);
  });

  it("uses no em or en dashes in player copy", () => {
    const copy = CN_LAWS.flatMap((l) => [
      l.title,
      l.description,
      ...(l.levels ?? []).flatMap((lv) => [lv.name, lv.description]),
      ...(l.taxPolicy?.waypoints ?? []).map((w) => w.label),
    ]);
    expect(copy.filter((s) => /[–—]/.test(s))).toEqual([]);
  });

  it("opens every price level above the previous one", () => {
    for (const law of CN_LAWS.filter((l) => l.levels)) {
      const cost = (i: number) =>
        (law.levels![i].gdpCostFraction ?? 0) + (law.levels![i].incomeCostFraction ?? 0);
      for (let i = 2; i < 5; i++) expect(cost(i), law.id).toBeGreaterThanOrEqual(cost(i - 1));
    }
  });
});
