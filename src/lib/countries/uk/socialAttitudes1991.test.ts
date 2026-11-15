import { describe, expect, it } from "vitest";
import { getUkModel } from "./layer1Model";
import { censusStateLean } from "@/lib/demographics/censusLean";
import { editorConfigFromCountryModel } from "@/lib/positionEditor/derive";
import { computeDerivedComposition } from "@/lib/positionEditor/preview";

describe("UK 1991 social attitudes derive from demographic inputs", () => {
  const model = getUkModel("1991");

  it("keeps the published 1991 age and education gradients independent of party vote", () => {
    const { age, education, income } = model.positions;
    expect(age.young.socialLean).toBeLessThan(age.mid.socialLean);
    expect(age.mid.socialLean).toBeLessThan(age.mature.socialLean);
    expect(age.mature.socialLean).toBeLessThan(age.senior.socialLean);
    expect(education.degree_plus.socialLean).toBeLessThan(education.a_level_equivalent.socialLean);
    expect(education.a_level_equivalent.socialLean).toBeLessThan(
      education.gcse_equivalent.socialLean
    );
    expect(education.gcse_equivalent.socialLean).toBeLessThan(
      education.no_qualifications.socialLean
    );
    expect(income.high.socialLean).toBeLessThan(income.middle.socialLean);
    expect(income.middle.socialLean).toBeLessThan(income.low.socialLean);
  });

  it("responds to age and education share changes without a regional social offset", () => {
    const social = (edit?: (c: ReturnType<typeof editorConfigFromCountryModel>) => void) => {
      const config = editorConfigFromCountryModel(model, "LON", "1991");
      edit?.(config);
      return computeDerivedComposition(config).stateSocialLean;
    };
    const baseline = social();
    expect(
      social((c) => {
        c.layer1.age.young.share -= 10;
        c.layer1.age.senior.share += 10;
      })
    ).toBeGreaterThan(baseline);
    expect(
      social((c) => {
        c.layer1.education.degree_plus.share -= 10;
        c.layer1.education.no_qualifications.share += 10;
      })
    ).toBeGreaterThan(baseline);
    for (const context of Object.values(model.regionalContext ?? {})) {
      expect(context.socialLean ?? 0).toBe(0);
    }
  });

  it("keeps every editor aggregate equal to the census state lean", () => {
    for (const regionId of Object.keys(model.census)) {
      const editor = computeDerivedComposition(
        editorConfigFromCountryModel(model, regionId, "1991")
      );
      const expected = censusStateLean(
        { _id: regionId, countryId: "UK", categoryWeights: {}, lastUpdated: new Date(0) },
        { countryId: "UK", stateId: regionId, preset: "1991-default" }
      );
      expect(editor.stateEconomicLean, regionId).toBeCloseTo(expected.economicLean, 1);
      expect(editor.stateSocialLean, regionId).toBeCloseTo(expected.socialLean, 1);
    }
  });
});
