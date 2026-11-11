import { describe, expect, it } from "vitest";
import {
  MAX_COMPARE_NATIONS,
  compareAcrossMetrics,
  rankNations,
  selectionFigure,
  toggleCompared,
  type RankableCountry,
} from "./rankings";

function country(
  countryId: string,
  name: string,
  scores: {
    overall?: number | null;
    economic?: number | null;
    unemployment?: { value: number; score: number | null };
  } = {}
): RankableCountry {
  return {
    countryId,
    name,
    hasData: true,
    categories: {
      economic: scores.unemployment ? { unemploymentRate: scores.unemployment } : {},
    },
    categoryScores: { economic: scores.economic ?? null },
    overallScore: scores.overall ?? null,
  };
}

describe("rankNations", () => {
  it("orders by score, best first", () => {
    const rows = rankNations(
      [country("A", "Alpha", { overall: 40 }), country("B", "Beta", { overall: 81 })],
      { kind: "overall" }
    );
    expect(rows.map((row) => row.countryId)).toEqual(["B", "A"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2]);
  });

  it("gives tied nations the same rank and skips the shared places", () => {
    const rows = rankNations(
      [
        country("A", "Alpha", { overall: 70 }),
        country("B", "Beta", { overall: 70 }),
        country("C", "Gamma", { overall: 60 }),
      ],
      { kind: "overall" }
    );
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it("ranks unranked nations last, alphabetically, without a rank", () => {
    const rows = rankNations(
      [
        country("A", "Alpha", { overall: null }),
        country("B", "Beta", { overall: 55 }),
        country("C", "Charlie", { overall: null }),
      ],
      { kind: "overall" }
    );
    expect(rows.map((row) => row.countryId)).toEqual(["B", "A", "C"]);
    expect(rows.map((row) => row.rank)).toEqual([1, null, null]);
  });

  it("ranks a single metric by its score and keeps the raw value", () => {
    const rows = rankNations(
      [
        country("A", "Alpha", { unemployment: { value: 9.4, score: 30 } }),
        country("B", "Beta", { unemployment: { value: 3.1, score: 88 } }),
      ],
      { kind: "metric", category: "economic", metric: "unemploymentRate" }
    );
    expect(rows[0]).toMatchObject({ countryId: "B", rank: 1, value: 3.1, score: 88 });
    expect(rows[1]).toMatchObject({ countryId: "A", rank: 2, value: 9.4, score: 30 });
  });

  it("ranks a category on its category score and reports no raw value", () => {
    const ranking = rankNations(
      [country("A", "Alpha", { economic: 64 }), country("B", "Beta", { economic: 71 })],
      { kind: "category", category: "economic" }
    );
    expect(ranking[0]).toMatchObject({ countryId: "B", rank: 1, value: null, score: 71 });
  });

  it("treats a missing metric or category as unranked instead of zero", () => {
    const bare = country("C", "Charlie");
    expect(
      selectionFigure(bare, { kind: "metric", category: "economic", metric: "gdpGrowth" })
    ).toEqual({ value: null, score: null });
    const rows = rankNations([bare, country("A", "Alpha", { overall: 10 })], { kind: "overall" });
    expect(rows[1]).toMatchObject({ countryId: "C", rank: null });
  });
});

describe("compareAcrossMetrics", () => {
  it("ranks every cell against the whole world, not just the compared nations", () => {
    const world = [
      country("A", "Alpha", { unemployment: { value: 9.4, score: 30 } }),
      country("B", "Beta", { unemployment: { value: 3.1, score: 88 } }),
      country("C", "Charlie", { unemployment: { value: 6.2, score: 60 } }),
    ];
    const [row] = compareAcrossMetrics({
      countries: world,
      countryIds: ["A", "C"],
      category: "economic",
      metrics: ["unemploymentRate"],
    });
    expect(row!.metric).toBe("unemploymentRate");
    expect(row!.cells).toEqual([
      { countryId: "A", value: 9.4, score: 30, rank: 3 },
      { countryId: "C", value: 6.2, score: 60, rank: 2 },
    ]);
  });

  it("returns a null cell for a nation the payload no longer carries", () => {
    const [row] = compareAcrossMetrics({
      countries: [country("A", "Alpha", { unemployment: { value: 9.4, score: 30 } })],
      countryIds: ["A", "GONE"],
      category: "economic",
      metrics: ["unemploymentRate"],
    });
    expect(row!.cells[1]).toEqual({ countryId: "GONE", value: null, score: null, rank: null });
  });
});

describe("toggleCompared", () => {
  it("adds and removes a nation", () => {
    expect(toggleCompared([], "US")).toEqual(["US"]);
    expect(toggleCompared(["US"], "US")).toEqual([]);
  });

  it("keeps the selection unchanged once the tray is full", () => {
    const full = ["US", "UK", "DE"];
    expect(full).toHaveLength(MAX_COMPARE_NATIONS);
    expect(toggleCompared(full, "JP")).toEqual(full);
    expect(toggleCompared(full, "US")).toEqual(["UK", "DE"]);
  });
});
