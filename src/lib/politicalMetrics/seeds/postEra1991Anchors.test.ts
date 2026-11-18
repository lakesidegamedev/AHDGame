import { describe, expect, it } from "vitest";
import { baselineFor } from "./baselineAnchors";
import { NATIONAL_BASELINES_1979 } from "./nationalBaselines1979";
import { NATIONAL_BASELINES_1991 } from "./nationalBaselines1991";
import { NATIONAL_BASELINES_2027 } from "./nationalBaselines2027";
import { scoreGovernanceStyle } from "@/lib/governanceStyle/score";
import { baselineLevelFor, getCatalog } from "@/lib/politicalLegislation/catalog";
import { BASELINE_LEVEL_OVERRIDES_1991 } from "@/lib/politicalLegislation/seeds/baselineLevels1991";
import { POLITICAL_METRIC_COUNTRY_IDS, type PoliticalMetricId } from "../types";

// 1999 has no authored board yet and keeps the values it seeded before the
// 1991 anchor existed. 2007-2023 interpolate toward the authored 2027 board
// until their own boards are written.
const LATER_PRESET_YEARS = [1999];
// Countries the 2027 world seeds. Each must read its own authored 2027 board.
const COUNTRIES_2027 = ["US", "UK", "RU", "DE", "JP", "CN"] as const;

describe("political baselines after the 1991 opening", () => {
  for (const countryId of POLITICAL_METRIC_COUNTRY_IDS) {
    it(`${countryId} later presets seed the pre-1991 board`, () => {
      for (const id of Object.keys(NATIONAL_BASELINES_1979[countryId]) as PoliticalMetricId[]) {
        for (const year of LATER_PRESET_YEARS) {
          expect(baselineFor(countryId, id, year)).toBe(NATIONAL_BASELINES_1979[countryId][id]);
        }
        expect(baselineFor(countryId, id, 1991)).toBe(NATIONAL_BASELINES_1991[countryId][id]);
      }
    });

    it(`${countryId} later presets seed laws at their pre-1991 level`, () => {
      for (const law of getCatalog(countryId)) {
        if (law.kind === "tax") continue;
        const inherited = law.baselineLevel ?? 0;
        for (const year of LATER_PRESET_YEARS) {
          expect(baselineLevelFor(law, year)).toBe(inherited);
        }
        expect(baselineLevelFor(law, 1991)).toBe(
          BASELINE_LEVEL_OVERRIDES_1991[law.id] ?? inherited
        );
      }
    });
  }

  for (const countryId of COUNTRIES_2027) {
    it(`${countryId} 2027 seeds its own authored board`, () => {
      const authored = NATIONAL_BASELINES_2027[countryId];
      expect(authored).toBeDefined();
      for (const id of Object.keys(NATIONAL_BASELINES_1979[countryId]) as PoliticalMetricId[]) {
        expect(baselineFor(countryId, id, 2027)).toBe(authored![id]);
      }
    });
  }

  it("2027 democracies open as functioning democracies", () => {
    for (const countryId of ["US", "UK", "DE", "JP"] as const) {
      const values = NATIONAL_BASELINES_2027[countryId]!;
      expect(scoreGovernanceStyle(values).democraticHealth.value).toBeGreaterThanOrEqual(60);
    }
    expect(scoreGovernanceStyle(NATIONAL_BASELINES_2027.RU!).democraticHealth.value).toBeLessThan(
      40
    );
  });
});
