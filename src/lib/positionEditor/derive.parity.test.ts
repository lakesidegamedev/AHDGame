import { describe, it, expect } from "vitest";
import { computeDerivedComposition, editorConfigFromSeed } from "./derive";
import { censusStateLean } from "@/lib/demographics/censusLean";
import { stateCensusData } from "@/lib/seeds/stateCensusData";
import type { Layer1Config } from "@/lib/seeds/stateDemographics";

const CFG = (stateCensusData as unknown as Record<string, Layer1Config>).CA;

describe("editor preview reads the census buckets", () => {
  it("an unedited state previews the census lean the seed caches", () => {
    const editor = editorConfigFromSeed("CA", "US", "2019", CFG);
    const derived = computeDerivedComposition(editor);
    const census = censusStateLean(
      { _id: "CA", countryId: "US", categoryWeights: {}, lastUpdated: new Date(0) },
      { countryId: "US", stateId: "CA", preset: "2019-default" }
    );
    expect(derived.stateEconomicLean).toBeCloseTo(census.economicLean, 1);
    expect(derived.stateSocialLean).toBeCloseTo(census.socialLean, 1);
  });

  it("every dimension's bucket shares sum to 100", () => {
    const derived = computeDerivedComposition(editorConfigFromSeed("CA", "US", "2019", CFG));
    expect(derived.buckets.length).toBeGreaterThan(0);
    for (const section of derived.buckets) {
      const total = section.buckets.reduce((s, b) => s + b.sharePct, 0);
      expect(total, section.dim).toBeCloseTo(100, 4);
    }
  });

  it("editing a position moves that bucket and the state lean", () => {
    const editor = editorConfigFromSeed("CA", "US", "2019", CFG);
    const before = computeDerivedComposition(editor);
    editor.layer1.race.white.economicLean = Math.max(-5, editor.layer1.race.white.economicLean - 2);
    const after = computeDerivedComposition(editor);
    const white = (d: typeof before) =>
      d.buckets.find((s) => s.dim === "race")!.buckets.find((b) => b.id === "race:white")!;
    expect(white(after).economicLean).toBeLessThan(white(before).economicLean);
    expect(after.stateEconomicLean).toBeLessThan(before.stateEconomicLean);
  });

  it("editing a share moves the lean toward the bigger bucket", () => {
    const editor = editorConfigFromSeed("CA", "US", "2019", CFG);
    const before = computeDerivedComposition(editor).stateEconomicLean;
    const edited = structuredClone(editor);
    const { black, white } = edited.layer1.race;
    black.share += 20;
    white.share -= 20;
    const after = computeDerivedComposition(edited).stateEconomicLean;
    expect(Math.sign(after - before)).toBe(Math.sign(black.economicLean - white.economicLean));
  });

  it("falls back to the editor entries for a region with no census", () => {
    const editor = editorConfigFromSeed("XX", "US", "2019", CFG);
    const derived = computeDerivedComposition(editor);
    expect(Number.isFinite(derived.stateEconomicLean)).toBe(true);
    expect(derived.buckets.map((s) => s.dim)).toEqual(editor.dims);
  });
});
