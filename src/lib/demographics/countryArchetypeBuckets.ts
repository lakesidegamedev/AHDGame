import type { ArchetypeBucketWeight } from "./archetypeBucketMap";
import { COMPOSITION_WEIGHTS } from "./compositionWeights";

/**
 * Per-country archetype to Layer-1 bucket weights, read from the country's own
 * seeded `composition` table rather than hand-authored here: that table already
 * expresses each archetype in the country's own bucket vocabulary, and a
 * restated copy drifted (non-US groups were written in US vocabulary and their
 * weights landed on no bucket).
 *
 * Composition is era-stable (only political positions move between eras), so
 * one table serves every era.
 *
 * Weights come from the generated composition-weights data, not the seed directly,
 * because the seed carries every region's census marginals and cannot be
 * bundled for the browser. A test keeps the generated file in sync with the
 * seed.
 */

/**
 * Archetype→bucket weights for a country, or null when it has no Layer-1 model
 * (callers fall back to the US table).
 */
export function getCountryArchetypeBuckets(
  countryId: string
): Record<string, ArchetypeBucketWeight[]> | null {
  return COMPOSITION_WEIGHTS[countryId.toUpperCase()] ?? null;
}
