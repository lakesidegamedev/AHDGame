import { z } from "zod";

/**
 * Shape of `src/data/demographics/composition-weights.json`: country, then
 * archetype, then its Layer-1 bucket weights summing to 1. The seed contract
 * validates the file against this schema.
 */

/** Countries with a Layer-1 model, read from their seeds by the generator. */
export const COMPOSITION_SEEDED_COUNTRY_IDS = [
  "UK",
  "DE",
  "JP",
  "IE",
  "BR",
  "CN",
  "RU",
  "SE",
  "FR",
  "IT",
  "AT",
  "DD",
  "ES",
  "FI",
  "GR",
  "NG",
  "TR",
  "HU",
  "PL",
  "RO",
  "YU",
  "BG",
  "BLR",
  "UKR",
  "CS",
  "BAL",
] as const;

/**
 * Countries with no Layer-1 model that share another country's archetype ids.
 * Scotland and Wales use the UK's voter groups; without this they fall through
 * to the US table, which carries no UK ids, and every archetype-keyed effect
 * registers as an unmapped drop.
 */
export const COMPOSITION_ALIASES = { SCO: "UK", WAL: "UK" } as const;

const COMPOSITION_COUNTRY_IDS = [
  ...COMPOSITION_SEEDED_COUNTRY_IDS,
  ...(Object.keys(COMPOSITION_ALIASES) as (keyof typeof COMPOSITION_ALIASES)[]),
] as const;

const bucketWeightSchema = z.strictObject({
  dim: z.string().min(1),
  key: z.string().min(1),
  w: z.number().min(0).max(1),
});

const archetypeWeightsSchema = z
  .array(bucketWeightSchema)
  .min(1)
  .refine(
    (weights) => Math.abs(weights.reduce((sum, row) => sum + row.w, 0) - 1) < 1e-6,
    "weights must sum to 1"
  );

export const compositionWeightsSchema = z.record(
  z.enum(COMPOSITION_COUNTRY_IDS),
  z
    .record(z.string().min(1), archetypeWeightsSchema)
    .refine((table) => Object.keys(table).length > 0, "a country needs at least one archetype")
);

/** Keyed loosely so callers can look up any country code and get undefined. */
export type CompositionWeights = Record<
  string,
  Record<string, z.infer<typeof archetypeWeightsSchema>>
>;
