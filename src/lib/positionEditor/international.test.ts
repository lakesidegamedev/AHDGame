import { describe, it, expect } from "vitest";
import { getCountryLayer1Model } from "@/lib/seeds/international";
import { editorConfigFromCountryModel } from "./derive";
import { computeDerivedComposition } from "./preview";

const COUNTRIES = ["UK", "DE", "JP", "IE", "BR", "CN"] as const;

describe("international positionEditor", () => {
  for (const id of COUNTRIES) {
    describe(`${id} era=2019`, () => {
      const model = getCountryLayer1Model(id, "2019")!;
      const firstRegionId = Object.keys(model?.census ?? {})[0];

      it("getCountryLayer1Model returns non-null", () => {
        expect(model).not.toBeNull();
        expect(firstRegionId).toBeDefined();
      });

      it("editorConfigFromCountryModel returns valid config with correct dims and layer1", () => {
        const config = editorConfigFromCountryModel(model, firstRegionId, "2019");
        expect(config.dims).toEqual(model.dims);
        expect(config.countryId).toBe(id);
        expect(config.stateId).toBe(firstRegionId);
        for (const dim of model.dims) {
          expect(Object.keys(config.layer1[dim] ?? {}).length).toBeGreaterThan(0);
        }
      });

      it("computeDerivedComposition returns census buckets and a finite state lean in [-5,5]", () => {
        const derived = computeDerivedComposition(
          editorConfigFromCountryModel(model, firstRegionId, "2019")
        );
        expect(derived.buckets.length).toBeGreaterThan(0);
        for (const section of derived.buckets) {
          const total = section.buckets.reduce((s, b) => s + b.sharePct, 0);
          expect(total, section.dim).toBeCloseTo(100, 4);
        }
        for (const lean of [derived.stateEconomicLean, derived.stateSocialLean]) {
          expect(Number.isFinite(lean)).toBe(true);
          expect(lean).toBeGreaterThanOrEqual(-5);
          expect(lean).toBeLessThanOrEqual(5);
        }
      });
    });
  }
});
