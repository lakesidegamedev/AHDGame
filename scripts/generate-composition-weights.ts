/**
 * Regenerate `src/data/demographics/composition-weights.json` from the seeded
 * country models, so a client component can read archetype weights without
 * importing a seed's census marginals. The seed stays the source of truth:
 * `compositionWeights.test.ts` rebuilds the table in memory and fails if the
 * committed file differs.
 *
 *   npm run generate:composition
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCountryLayer1Model } from "../src/lib/seeds/international";
import type { EraId } from "../src/lib/seeds/presetSelector";
import {
  COMPOSITION_ALIASES,
  COMPOSITION_SEEDED_COUNTRY_IDS,
} from "../src/lib/demographics/compositionWeightsSchema";

// Composition is era-stable by design (an archetype's defining demographics do
// not move between eras, only its politics do), so the first era a country is
// seeded for gives the whole table.
const PROBE_ERAS: EraId[] = ["2019", "modern", "1979", "1953"] as EraId[];

export function buildCompositionWeights(): Record<
  string,
  Record<string, Array<{ dim: string; key: string; w: number }>>
> {
  const out: Record<string, Record<string, Array<{ dim: string; key: string; w: number }>>> = {};
  for (const cc of COMPOSITION_SEEDED_COUNTRY_IDS) {
    for (const era of PROBE_ERAS) {
      let model;
      try {
        model = getCountryLayer1Model(cc, era);
      } catch {
        continue;
      }
      const composition = model?.composition;
      if (!composition) continue;
      const table: Record<string, Array<{ dim: string; key: string; w: number }>> = {};
      for (const [archetypeId, entry] of Object.entries(composition)) {
        if (entry?.weights?.length) {
          table[archetypeId] = entry.weights.map((w) => ({ dim: w.dim, key: w.key, w: w.w }));
        }
      }
      if (Object.keys(table).length > 0) {
        out[cc] = table;
        break;
      }
    }
  }
  for (const [alias, source] of Object.entries(COMPOSITION_ALIASES)) {
    if (out[source]) out[alias] = out[source];
  }
  return out;
}

function main() {
  const data = buildCompositionWeights();
  const target = resolve(__dirname, "../src/data/demographics/composition-weights.json");
  writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  const archetypes = Object.values(data).reduce((s, c) => s + Object.keys(c).length, 0);
  console.log(`Wrote ${Object.keys(data).length} countries / ${archetypes} archetypes → ${target}`);
}

if (require.main === module) main();
