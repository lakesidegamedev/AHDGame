/**
 * Nation ranking rules for the world rankings page.
 *
 * Plain data in, plain data out: the page feeds in the national metrics payload
 * it already receives and gets back an ordered table, so the same ordering can
 * be reused by a report, a sim harness or an embed without importing React.
 * No database, clock, randomness or network here.
 *
 * Ranks come from `score`, not the raw measure: `scoreMetric` is what knows
 * which direction a statistic runs (unemployment is better low, growth better
 * high) and what the country's era-scaled bands are. A nation with no score has
 * no comparable figure and sorts after every ranked nation as unranked, rather
 * than being treated as zero.
 */

import type { MetricCategoryId } from "@/lib/db/types";

export interface RankableMetric {
  value: number;
  score: number | null;
}

/** The subset of the national metrics payload the ranking needs. */
export interface RankableCountry {
  countryId: string;
  name: string;
  hasData: boolean;
  categories: Record<string, Record<string, RankableMetric>>;
  categoryScores: Record<string, number | null>;
  overallScore: number | null;
}

/** What the table is ordered by: the overall score, a category score, or one metric. */
export type RankingSelection =
  | { kind: "overall" }
  | { kind: "category"; category: MetricCategoryId }
  | { kind: "metric"; category: MetricCategoryId; metric: string };

export interface RankedNation {
  countryId: string;
  name: string;
  /** 1 is best. Ties share a rank. Null when the nation has no comparable figure. */
  rank: number | null;
  /** The raw measure, for a metric selection. Null for the score-only views. */
  value: number | null;
  score: number | null;
}

/** The figure a nation contributes to one selection. */
export function selectionFigure(
  country: RankableCountry,
  selection: RankingSelection
): { value: number | null; score: number | null } {
  if (selection.kind === "overall") {
    return { value: null, score: country.overallScore };
  }
  if (selection.kind === "category") {
    return { value: null, score: country.categoryScores[selection.category] ?? null };
  }
  const metric = country.categories[selection.category]?.[selection.metric] ?? null;
  return { value: metric?.value ?? null, score: metric?.score ?? null };
}

const compareNames = (a: RankedNation, b: RankedNation) => a.name.localeCompare(b.name);

/**
 * Every nation in rank order, best first, with unranked nations last.
 *
 * Ranking is a competition rank: equal scores share a rank and the next nation
 * skips the places they shared, so two nations tied at 2 are both #2 and the
 * next is #4. That is the convention a reader expects from a leaderboard, and
 * it keeps a tie from inventing a winner.
 */
export function rankNations(
  countries: readonly RankableCountry[],
  selection: RankingSelection
): RankedNation[] {
  const rows: RankedNation[] = countries.map((country) => {
    const figure = selectionFigure(country, selection);
    return {
      countryId: country.countryId,
      name: country.name,
      rank: null,
      value: figure.value,
      score: figure.score,
    };
  });

  const ranked: RankedNation[] = [];
  const unranked: RankedNation[] = [];
  for (const row of rows) {
    if (row.score !== null && Number.isFinite(row.score)) ranked.push(row);
    else unranked.push(row);
  }

  ranked.sort((a, b) => b.score! - a.score! || compareNames(a, b));
  let lastScore: number | undefined;
  let lastRank = 0;
  ranked.forEach((row, index) => {
    if (lastScore === undefined || row.score !== lastScore) {
      lastRank = index + 1;
      lastScore = row.score!;
    }
    row.rank = lastRank;
  });

  unranked.sort(compareNames);
  return [...ranked, ...unranked];
}

export interface CompareCell {
  countryId: string;
  value: number | null;
  score: number | null;
  rank: number | null;
}

/** One statistic, with a cell per compared nation. */
export interface CompareRow {
  metric: string;
  cells: CompareCell[];
}

/**
 * Compare the chosen nations across every statistic in a category.
 *
 * Each row is ranked against ALL nations, not just the compared ones, so a
 * value of 4.1% can be read as "#7 of 12" rather than a bare number. Metrics
 * are returned in the order the caller supplies, which is the payload's own.
 */
export function compareAcrossMetrics(input: {
  countries: readonly RankableCountry[];
  countryIds: readonly string[];
  category: MetricCategoryId;
  metrics: readonly string[];
}): CompareRow[] {
  return input.metrics.map((metric) => {
    const ranking = rankNations(input.countries, {
      kind: "metric",
      category: input.category,
      metric,
    });
    const byCountry = new Map(ranking.map((row) => [row.countryId, row]));
    return {
      metric,
      cells: input.countryIds.map((countryId) => {
        const row = byCountry.get(countryId);
        return {
          countryId,
          value: row?.value ?? null,
          score: row?.score ?? null,
          rank: row?.rank ?? null,
        };
      }),
    };
  });
}

/** How many nations a comparison may hold at once. */
export const MAX_COMPARE_NATIONS = 3;

/** Add or remove one nation from a comparison, keeping the current selection on a full tray. */
export function toggleCompared(
  selected: readonly string[],
  countryId: string,
  limit: number = MAX_COMPARE_NATIONS
): string[] {
  if (selected.includes(countryId)) return selected.filter((id) => id !== countryId);
  if (selected.length >= limit) return [...selected];
  return [...selected, countryId];
}
