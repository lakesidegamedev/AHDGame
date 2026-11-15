import { describe, it, expect } from "vitest";
import { COST_SCALE_ANCHORS } from "./costs";
import { getNationalBudgetSeedConfigsForPreset } from "@/lib/seeds/reference/budgets";
import type { CountryId } from "@/lib/constants/countries";

describe("COST_SCALE_ANCHORS stay in sync with the budget seed configs", () => {
  const low = getNationalBudgetSeedConfigsForPreset("1991-default");
  const high = getNationalBudgetSeedConfigsForPreset("2019-default");
  const opening2027 = getNationalBudgetSeedConfigsForPreset("2027-default");

  for (const countryId of Object.keys(COST_SCALE_ANCHORS) as CountryId[]) {
    it(`${countryId} low/high gdp & population match the seed configs`, () => {
      const anchor = COST_SCALE_ANCHORS[countryId]!;
      const lowCfg = low.find((c) => c.countryId === countryId);
      // A country that first appears in 2027 anchors its high end on that
      // opening; its low anchor is an authored extrapolation with no world to
      // match.
      const highCfg =
        high.find((c) => c.countryId === countryId) ??
        (lowCfg ? undefined : opening2027.find((c) => c.countryId === countryId));
      expect(highCfg, `${countryId} 2019 or first-opening seed config`).toBeDefined();
      expect(anchor.gdpHigh).toBe(highCfg!.gdp);
      expect(anchor.popHigh).toBe(highCfg!.population);
      if (!lowCfg) {
        expect(
          high.some((c) => c.countryId === countryId),
          `${countryId} 1991 seed config`
        ).toBe(false);
        return;
      }
      expect(anchor.gdpLow).toBe(lowCfg.gdp);
      expect(anchor.popLow).toBe(lowCfg.population);
    });
  }
});
