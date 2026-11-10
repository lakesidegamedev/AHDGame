import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoliticalMetricsCountryId } from "@/lib/politicalMetrics/types";
import type { RegionalTexture } from "./regionalTextureSchema";

/**
 * Per-region deviation from the country mean for the four 1953 playable
 * countries, applied on top of the authored national baselines. Generated data
 * in `src/data/political-metrics/regional-texture-1953.json` (regenerate with
 * `scripts/debug/derive-playable-region-texture-1953.ts --emit`).
 *
 * Read from disk on first use and cached. Server only.
 */
let cached: Record<PoliticalMetricsCountryId, RegionalTexture[string]> | undefined;

export function getRegionalTexture1953(): Record<
  PoliticalMetricsCountryId,
  RegionalTexture[string]
> {
  cached ??= JSON.parse(
    readFileSync(
      join(process.cwd(), "src/data/political-metrics/regional-texture-1953.json"),
      "utf8"
    )
  ) as Record<PoliticalMetricsCountryId, RegionalTexture[string]>;
  return cached;
}
