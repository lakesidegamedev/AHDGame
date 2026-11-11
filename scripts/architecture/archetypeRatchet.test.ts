import { describe, expect, it } from "vitest";
import {
  countArchetypes,
  findRegressions,
  isAllowedConcept,
  isScannedFile,
  lowerBaseline,
  readBaseline,
  scanRepo,
} from "./archetypeRatchet";

describe("archetype counter", () => {
  it("counts the word in any case", () => {
    expect(countArchetypes("an Archetype and ARCHETYPES, archetype")).toBe(3);
    expect(countArchetypes("bucketApprovals")).toBe(0);
  });
  it("exempts the non-voter concepts only", () => {
    expect(isAllowedConcept("src/lib/nppAutonomy/governingArchetype.ts")).toBe(true);
    expect(isAllowedConcept("src/lib/cabinet/rules/estates.ts")).toBe(true);
    expect(isAllowedConcept("src/lib/military/arsenal.ts")).toBe(true);
    expect(isAllowedConcept("src/lib/npp/ceoArchetype.ts")).toBe(true);
    expect(
      isAllowedConcept("src/lib/migrations/entries/2026-11-11-bucket-approvals-rename.ts")
    ).toBe(true);
    expect(isAllowedConcept("src/lib/migrations/entries/2026-12-01-other.ts")).toBe(false);
    expect(isAllowedConcept("src/lib/demographics/granularElectorate.ts")).toBe(false);
    expect(isScannedFile("src/lib/demographics/granularElectorate.ts")).toBe(true);
    expect(isScannedFile("src/lib/military/arsenal.ts")).toBe(false);
  });
});

describe("archetype ratchet", () => {
  const baseline = { "a.ts": 2 };
  it("passes when counts are equal or lower", () => {
    expect(findRegressions(baseline, { "a.ts": 1 })).toEqual([]);
  });
  it("fails a higher count or a new file", () => {
    expect(findRegressions(baseline, { "a.ts": 3, "b.ts": 1 })).toEqual([
      { file: "a.ts", baseline: 2, current: 3 },
      { file: "b.ts", baseline: 0, current: 1 },
    ]);
  });
  it("lowers counts, drops cleaned files, never raises or adds", () => {
    expect(lowerBaseline({ ...baseline, "c.ts": 1 }, { "a.ts": 5, "new.ts": 9 })).toEqual({
      "a.ts": 2,
    });
  });
});

describe("repository archetype mentions", () => {
  it("do not exceed the committed baseline", () => {
    const regressions = findRegressions(readBaseline().files, scanRepo());
    expect(
      regressions,
      regressions.map((r) => `${r.file}: ${r.baseline} -> ${r.current}`).join("\n") +
        "\nDescribe voters with census buckets (dim:bucket). Only removals may lower the baseline: npm run archetypes:lower"
    ).toEqual([]);
  }, 90_000);
});
