import { describe, expect, it } from "vitest";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  DIVERGENT_TENURE_HAZARD_PER_TURN,
  HISTORICAL_RECORD_END_YEAR,
  rollOpenEndedHistoricalDeparture,
} from "./tenure";
import {
  SURPRISE_CASE_REUSE_AFTER_YEARS,
  SURPRISE_CASE_SPAWN_BANDS,
  SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN,
  drawableTemplates,
  surpriseCaseSpawnProbabilityForYear,
  type HeardSurpriseCase,
} from "./surpriseCaseSpawn";
import { SURPRISE_CASE_TEMPLATES, templatesForYear } from "./surpriseCaseTemplates";

/** Small deterministic generator so the multi-decade runs are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("open-ended seeded justices", () => {
  it("never leave before the authored record ends", () => {
    expect(rollOpenEndedHistoricalDeparture(HISTORICAL_RECORD_END_YEAR - 1, 0)).toBe(false);
  });

  it("leave on the divergent hazard afterwards", () => {
    expect(rollOpenEndedHistoricalDeparture(HISTORICAL_RECORD_END_YEAR, 0)).toBe(true);
    expect(
      rollOpenEndedHistoricalDeparture(
        HISTORICAL_RECORD_END_YEAR + 5,
        DIVERGENT_TENURE_HAZARD_PER_TURN
      )
    ).toBe(false);
  });

  it("turns over a nine-seat bench across 24 years, in every seed", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = mulberry32(seed);
      let departures = 0;
      for (let seat = 0; seat < 9; seat++) {
        for (let turn = 0; turn < 24 * TURNS_PER_YEAR; turn++) {
          const year = HISTORICAL_RECORD_END_YEAR + Math.floor(turn / TURNS_PER_YEAR);
          if (rollOpenEndedHistoricalDeparture(year, rng())) {
            departures++;
            break;
          }
        }
      }
      // Median tenure 15 years: expected about 6 of 9; a bench frozen at 0 or
      // fully replaced at 9 in every seed would both be wrong.
      expect(departures, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(departures, `seed ${seed}`).toBeLessThanOrEqual(9);
    }
  });
});

describe("modern docket", () => {
  it("runs hotter from 2027 than before", () => {
    expect(surpriseCaseSpawnProbabilityForYear(2026)).toBe(
      SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN
    );
    expect(surpriseCaseSpawnProbabilityForYear(2027)).toBe(0.012);
    expect(surpriseCaseSpawnProbabilityForYear(2050)).toBe(0.012);
    expect(SURPRISE_CASE_SPAWN_BANDS.length).toBeGreaterThan(1);
  });

  it("prefers unheard cases, then recycles old ones", () => {
    const pool = [{ templateKey: "a" }, { templateKey: "b" }];
    const heard: HeardSurpriseCase[] = [{ caseKey: "a", decisionYear: 2030 }];
    expect(drawableTemplates(pool, heard, 2031).map((t) => t.templateKey)).toEqual(["b"]);
    const all: HeardSurpriseCase[] = [
      { caseKey: "a", decisionYear: 2030 },
      { caseKey: "b", decisionYear: 2040 },
    ];
    expect(drawableTemplates(pool, all, 2041)).toEqual([]);
    expect(
      drawableTemplates(pool, all, 2030 + SURPRISE_CASE_REUSE_AFTER_YEARS).map((t) => t.templateKey)
    ).toEqual(["a"]);
  });

  it("keeps hearing cases every few years from 2027 through 2060", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rng = mulberry32(seed);
      const heard: HeardSurpriseCase[] = [];
      for (let turn = 0; turn < 34 * TURNS_PER_YEAR; turn++) {
        const year = 2027 + Math.floor(turn / TURNS_PER_YEAR);
        if (rng() >= surpriseCaseSpawnProbabilityForYear(year)) continue;
        const pool = drawableTemplates(
          templatesForYear(SURPRISE_CASE_TEMPLATES, year),
          heard,
          year
        );
        if (pool.length === 0) continue;
        const pick = pool[Math.floor(rng() * pool.length)];
        heard.push({ caseKey: pick.templateKey, decisionYear: year });
      }
      expect(heard.length, `seed ${seed}`).toBeGreaterThanOrEqual(10);
      const lastYear = Math.max(...heard.map((h) => h.decisionYear));
      expect(lastYear, `seed ${seed}`).toBeGreaterThanOrEqual(2050);
      const issues = new Set(heard.map((h) => h.caseKey));
      expect(issues.size, `seed ${seed}`).toBeGreaterThanOrEqual(8);
    }
  });
});
