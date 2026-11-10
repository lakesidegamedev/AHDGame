/**
 * Offline codegen for the playable-region 1953 texture (issue #704).
 *
 * Derives per-region deviations from the authoritative legacy regional seeds
 * (see src/lib/politicalMetrics/derive/playableTexture.ts for the pipeline)
 * and either prints a review report (default) or writes the committed data
 * file (with --emit). The committed output is the reviewable artifact the
 * seed path reads; this script is what makes it reproducible.
 *
 * Run: npx tsx scripts/debug/derive-playable-region-texture-1953.ts [--emit]
 */
import { writeFileSync } from "node:fs";
import {
  derivePlayableTexture1953,
  PLAYABLE_TEXTURE_BOUND,
  PLAYABLE_TEXTURE_PRESET,
  PLAYABLE_TEXTURE_YEAR,
  type PlayableTexture,
} from "@/lib/politicalMetrics/derive/playableTexture";

const EMIT = process.argv.includes("--emit");
const OUT_PATH = "src/data/political-metrics/regional-texture-1953.json";

function serialize(texture: PlayableTexture): string {
  const sorted = Object.fromEntries(
    (["US", "UK", "RU", "DD"] as const).map((countryId) => [
      countryId,
      Object.fromEntries(
        Object.keys(texture[countryId])
          .sort()
          .map((regionId) => [
            regionId,
            Object.fromEntries(
              Object.entries(texture[countryId][regionId]).sort(([x], [y]) => (x < y ? -1 : 1))
            ),
          ])
      ),
    ])
  );
  return JSON.stringify(sorted, null, 1) + "\n";
}

function main(): void {
  const { texture, diagnostics } = derivePlayableTexture1953();

  console.log(
    `preset ${PLAYABLE_TEXTURE_PRESET}, year ${PLAYABLE_TEXTURE_YEAR}, bound +/-${PLAYABLE_TEXTURE_BOUND}`
  );
  console.log("cc     regions  varying  unauthored  scaled  textured-regions");
  let totalEntries = 0;
  for (const d of diagnostics) {
    const scaled = d.families.filter((f) => f.scale < 1).length;
    const entries = Object.values(texture[d.countryId]).reduce(
      (n, r) => n + Object.keys(r).length,
      0
    );
    totalEntries += entries;
    console.log(
      `${d.countryId.padEnd(6)} ${String(d.regions).padStart(7)}  ${String(d.varyingFamilies).padStart(7)}  ` +
        `${String(d.unauthored.length).padStart(10)}  ${String(scaled).padStart(6)}  ${entries}`
    );
    console.log(`  lean=${JSON.stringify(d.lean)} unauthored=[${d.unauthored.join(",")}]`);
    for (const f of d.families.filter((f) => f.scale < 1 || f.modifierZeroed > 0)) {
      console.log(
        `  ${f.familyId}: rawMaxAbs=${f.rawMaxAbs} scale=${f.scale} modifierZeroed=${f.modifierZeroed} regions=${f.regionsTextured}`
      );
    }
  }
  console.log(`total texture entries: ${totalEntries}`);

  if (EMIT) {
    writeFileSync(OUT_PATH, serialize(texture));
    console.log(`wrote ${OUT_PATH}`);
  }
}

main();
