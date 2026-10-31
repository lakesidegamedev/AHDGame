/**
 * 1979 income vintages for AT, ES, FI, FR, GR, IT and SE (#3398).
 *
 * Each of these countries seeds a bundle authored as roughly 1979 nominal
 * currency, but carried only a single 1953 anchor, so a 1979 world scored every
 * region 100 or every region 0. These tests pin the authored vintage, the
 * provenance stamp that activates it, and the scoring spread it produces.
 */
import { describe, expect, it } from "vitest";
import {
  getIncomeAnchor,
  getIncomeStartVintage,
  getStartingIncomeAnchor,
  incomeVintageStampsFor,
} from "@/lib/era/metricCatalog";
import { scoreMetric } from "@/lib/utils/metricScoring";
import { loadSeededStateMetrics } from "@/lib/states/conditions/seedMetricsLoader";

const WEST = ["AT", "ES", "FI", "FR", "GR", "IT", "SE"] as const;
type West = (typeof WEST)[number];

/** Authored national level of each ~1979 seed bundle, and the bundle's regional range. */
const EXPECTED: Record<West, { value: number; min: number; max: number }> = {
  AT: { value: 190_000, min: 170_000, max: 215_000 },
  ES: { value: 700_000, min: 480_000, max: 980_000 },
  FI: { value: 52_000, min: 42_000, max: 62_000 },
  FR: { value: 50_000, min: 44_000, max: 68_000 },
  GR: { value: 350_000, min: 260_000, max: 430_000 },
  IT: { value: 7_000_000, min: 4_400_000, max: 9_500_000 },
  SE: { value: 90_000, min: 82_000, max: 108_000 },
};

/** The 1953 overlay anchor each country carried before #3398. */
const ANCHOR_1953: Record<West, number> = {
  AT: 18_400,
  ES: 14_000,
  FI: 292_500,
  FR: 420_000,
  GR: 9_300,
  IT: 550,
  SE: 8_000,
};

const STAMPS_1979 = incomeVintageStampsFor(1979);

describe("#3398 authored 1979 start vintage", () => {
  for (const c of WEST) {
    it(`${c}: has a 1979 vintage in the seed bundle's unit and range`, () => {
      const vintage = getIncomeStartVintage(c, 1979);
      expect(vintage).not.toBeNull();
      expect(vintage!.id).toBe(`${c.toLowerCase()}-1979-household-authored`);
      expect(vintage!.value).toBe(EXPECTED[c].value);
      // Inside the authored regional range: the anchor is the bundle's national
      // level, not an interpolation from another currency vintage.
      expect(vintage!.value).toBeGreaterThanOrEqual(EXPECTED[c].min);
      expect(vintage!.value).toBeLessThanOrEqual(EXPECTED[c].max);
      expect(STAMPS_1979[c]).toBe(vintage!.id);
    });

    it(`${c}: the 1979 anchor applies only to a stamped 1979 world`, () => {
      expect(getStartingIncomeAnchor(c, 1979, STAMPS_1979)).toBe(EXPECTED[c].value);
      // An unstamped world keeps the anchor it was calibrated against.
      expect(getStartingIncomeAnchor(c, 1979, null)).toBe(getIncomeAnchor(c, 1979));
      expect(getIncomeAnchor(c, 1979)).toBe(ANCHOR_1953[c]);
    });

    it(`${c}: seeded regions no longer all score the same`, () => {
      const scores = loadSeededStateMetrics(c, "1979-default").map((m) =>
        scoreMetric(
          "medianIncome",
          m.economic.medianIncome!.value,
          c,
          "1979-default",
          1979,
          1,
          1979,
          STAMPS_1979
        )!
      );
      expect(scores.length).toBeGreaterThan(1);
      // The bug pinned every region to 0 or every region to 100.
      expect(new Set(scores.map((s) => Math.round(s))).size).toBeGreaterThan(1);
      expect(scores.some((s) => s > 0 && s < 100)).toBe(true);
    });
  }
});
