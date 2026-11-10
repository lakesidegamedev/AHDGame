import { z } from "zod";
import { FAMILY_SLUGS, type PoliticalMetricId } from "@/lib/politicalMetrics/types";

/**
 * Shape of the regional texture files in `src/data/political-metrics/`:
 * country, then region, then family, each a deviation from the country mean
 * bounded to plus or minus 12 points. Families a region does not deviate on are
 * absent. The seed contract validates both files against this schema.
 */
export const REGIONAL_TEXTURE_BOUND = 12;

const POLITICAL_METRIC_IDS = Object.entries(FAMILY_SLUGS).flatMap(([categoryId, slugs]) =>
  slugs.map((slug) => `${categoryId}.${slug}`)
) as [PoliticalMetricId, ...PoliticalMetricId[]];

const deviation = z.number().min(-REGIONAL_TEXTURE_BOUND).max(REGIONAL_TEXTURE_BOUND);

export const regionalTextureSchema = z.record(
  z.string(),
  z.record(z.string(), z.partialRecord(z.enum(POLITICAL_METRIC_IDS), deviation))
);

export type RegionalTexture = Record<
  string,
  Record<string, Partial<Record<PoliticalMetricId, number>>>
>;
