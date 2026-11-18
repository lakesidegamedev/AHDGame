import { describe, expect, it } from "vitest";
import type { CompareCell, RankedNation } from "./rankings";
import { buildCompareSummary, type CompareSummarySide } from "./compareSummary";

function ranked(score: number | null, rank: number | null): RankedNation {
  return { countryId: "FR", name: "France", rank, value: null, score };
}

function cell(value: number | null, rank: number | null): CompareCell {
  return { countryId: "FR", value, score: null, rank };
}

const sides: [CompareSummarySide, CompareSummarySide] = [
  { name: "France", overall: ranked(58, 12), categoryRank: ranked(54, 14) },
  { name: "Japan", overall: ranked(61, 8), categoryRank: ranked(57, 9) },
];

describe("buildCompareSummary", () => {
  it("opens with both names and their world ranks", () => {
    const text = buildCompareSummary({
      sides,
      category: "economic",
      rows: [],
      url: null,
    });

    expect(text.split("\n")).toEqual([
      "France vs Japan",
      "Overall score: 58 (#12) vs 61 (#8)",
      "Economic average: 54 (#14) vs 57 (#9)",
    ]);
  });

  it("formats metric lines through the catalog and keeps the link last", () => {
    const text = buildCompareSummary({
      sides,
      category: "economic",
      rows: [
        { metric: "unemploymentRate", cells: [cell(6.2, 20), cell(7, 29)] },
        { metric: "gdpGrowth", cells: [cell(3.25, 4), cell(1.4, 48)] },
      ],
      url: "https://example.test/world?compare=FR,JP",
    });
    const lines = text.split("\n");

    expect(lines[3]).toBe("Unemployment Rate: 6.2% (#20) vs 7.0% (#29)");
    expect(lines[4]).toBe("GDP Growth: 3.3% (#4) vs 1.4% (#48)");
    expect(lines.at(-1)).toBe("https://example.test/world?compare=FR,JP");
  });

  it("writes at most three metric lines", () => {
    const rows = ["gdpGrowth", "wageGrowth", "unemploymentRate", "medianIncome"].map((metric) => ({
      metric,
      cells: [cell(1, 1), cell(2, 2)] as const,
    }));
    const text = buildCompareSummary({ sides, category: "economic", rows, url: null });

    expect(text.split("\n")).toHaveLength(2 + 1 + 3);
  });

  it("skips a metric that only one side has", () => {
    const text = buildCompareSummary({
      sides,
      category: "economic",
      rows: [
        { metric: "gdpGrowth", cells: [cell(3.2, 4), cell(null, null)] },
        { metric: "wageGrowth", cells: [cell(2.1, 5), cell(4.6, 31)] },
      ],
      url: null,
    });

    expect(text).not.toContain("GDP Growth");
    expect(text).toContain("Wage Growth: 2.1% (#5) vs 4.6% (#31)");
  });

  it("falls back to n/a for a side with no stored figures", () => {
    const text = buildCompareSummary({
      sides: [sides[0], { name: "Japan", overall: null, categoryRank: null }],
      category: null,
      rows: [],
      url: null,
    });

    expect(text).toBe("France vs Japan\nOverall score: 58 (#12) vs n/a");
  });

  it("still produces a readable line when nothing but the names is known", () => {
    const text = buildCompareSummary({
      sides: [
        { name: "France", overall: null, categoryRank: null },
        { name: "Japan", overall: null, categoryRank: null },
      ],
      category: null,
      rows: [],
      url: "https://example.test/world",
    });

    expect(text).toBe("France vs Japan\nhttps://example.test/world");
  });
});
