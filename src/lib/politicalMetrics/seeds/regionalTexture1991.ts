import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RegionalTexture } from "./regionalTextureSchema";

/**
 * Per-region deviation from the country mean for the 1991 opening. Generated
 * data in `src/data/political-metrics/regional-texture-1991.json` (regenerate
 * with `scripts/debug/derive-regional-texture-1991.ts --emit`).
 *
 * Read from disk on first use and cached. Server only.
 */
let cached: RegionalTexture | undefined;

export function getRegionalTexture1991(): RegionalTexture {
  cached ??= JSON.parse(
    readFileSync(
      join(process.cwd(), "src/data/political-metrics/regional-texture-1991.json"),
      "utf8"
    )
  ) as RegionalTexture;
  return cached;
}
