import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { COMPOSITION_WEIGHTS } from "./compositionWeights";
import { buildCompositionWeights } from "../../../scripts/generate-composition-weights";

/**
 * The generated table must equal what the seeds say.
 *
 * The composition-weights data file exists so a client bundle can project
 * archetype effects without importing ~460KB of census data. That makes it a
 * second copy, and a second copy is only safe if it cannot drift, so this
 * rebuilds it from the seeds in memory and compares.
 *
 * If this fails, the seeds changed: run `npm run generate:composition`.
 */
describe("generated composition weights", () => {
  it("matches the seeds exactly", () => {
    expect(COMPOSITION_WEIGHTS).toEqual(buildCompositionWeights());
  });

  it("carries exactly the table the TypeScript module carried before the move", () => {
    const digest = createHash("sha256").update(JSON.stringify(COMPOSITION_WEIGHTS)).digest("hex");
    expect(digest).toBe("39e4fed16af3e85eb6acc594595d861410629bc40de97e24d07518f2b8901fbd");
    expect(Object.keys(COMPOSITION_WEIGHTS.WAL)[0]).toBe("post_industrial_workers");
    expect(COMPOSITION_WEIGHTS.WAL.post_industrial_workers).toEqual([
      { dim: "education", key: "no_qualifications", w: 0.35 },
      { dim: "income", key: "low", w: 0.3 },
      { dim: "age", key: "mature", w: 0.2 },
      { dim: "urbanization", key: "urban", w: 0.15 },
    ]);
  });

  it("is non-vacuous", () => {
    const countries = Object.keys(COMPOSITION_WEIGHTS);
    expect(countries.length).toBeGreaterThanOrEqual(17);
    const archetypes = countries.reduce(
      (s, cc) => s + Object.keys(COMPOSITION_WEIGHTS[cc]).length,
      0
    );
    expect(archetypes).toBeGreaterThanOrEqual(130);
  });

  it("every archetype's weights sum to 1", () => {
    for (const [cc, table] of Object.entries(COMPOSITION_WEIGHTS)) {
      for (const [archetypeId, weights] of Object.entries(table)) {
        expect(weights.length, `${cc}:${archetypeId}`).toBeGreaterThan(0);
        const sum = weights.reduce((s, w) => s + w.w, 0);
        expect(sum, `${cc}:${archetypeId} weights must sum to 1`).toBeCloseTo(1, 6);
      }
    }
  });
});
