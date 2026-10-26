import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "sectorRows.ts"), "utf8");

/**
 * `stateMetricContributions` is the per-metric margin rationale list: ~188
 * entries and ~51 KB per sector on a live corporation. On 2026-10-24 it was
 * 94% of the `GET /api/corporations/:id` payload (898 KB of 923 KB in
 * production), and nothing that consumes that payload renders it — the sector
 * sub-page fetches its own copy with the sector detail.
 *
 * These assertions are the regression guard for that: the corporation-detail
 * sector rows must keep stripping the field. A future feature that genuinely
 * needs the rationale list on the overview should expose it as a separate,
 * explicitly-requested flag rather than silently re-inflating every page load.
 */
describe("corporation detail sector rows payload", () => {
  it("strips stateMetricContributions before spreading the margin modifiers", () => {
    expect(source).toMatch(
      /const\s*\{\s*stateMetricContributions:\s*_stateMetricContributions\s*,\s*\.\.\.modsForApi\s*\}\s*=\s*mods;/
    );
  });

  it("spreads the stripped modifiers rather than the raw modifier object", () => {
    expect(source).toMatch(/\.\.\.modsForApi,/);
    expect(source).not.toMatch(/\.\.\.mods,/);
  });
});
