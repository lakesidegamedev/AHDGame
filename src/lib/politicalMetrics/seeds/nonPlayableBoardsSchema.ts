import { z } from "zod";
import { FAMILY_SLUGS, type PoliticalMetricId } from "@/lib/politicalMetrics/types";

/**
 * Shape of `src/data/political-metrics/non-playable-boards.json`: preset, then
 * country, then region, then all 63 families scored 0 to 100. The seed
 * contract validates the file against this schema.
 */

const POLITICAL_METRIC_IDS = Object.entries(FAMILY_SLUGS).flatMap(([categoryId, slugs]) =>
  slugs.map((slug) => `${categoryId}.${slug}`)
) as [PoliticalMetricId, ...PoliticalMetricId[]];

export const NON_PLAYABLE_BOARD_PRESET_IDS = [
  "1953-default",
  "1979-default",
  "1991-default",
  "2019-default",
] as const;

/** Every preset carries every one of these countries; playables seed from anchors instead. */
export const NON_PLAYABLE_BOARD_COUNTRY_IDS = [
  "AT",
  "BAL",
  "BG",
  "BLR",
  "BR",
  "CN",
  "CS",
  "ES",
  "FI",
  "FR",
  "GR",
  "HU",
  "IE",
  "IT",
  "NG",
  "PL",
  "RO",
  "SE",
  "TR",
  "UKR",
  "YU",
] as const;

const score = z.number().finite().min(0).max(100);

/** All 63 families, each 0 to 100; a missing or unknown family fails. */
export const politicalBoardSchema = z.record(z.enum(POLITICAL_METRIC_IDS), score);

const regionBoardsSchema = z
  .record(z.string().min(1), politicalBoardSchema)
  .refine((regions) => Object.keys(regions).length > 0, "a country needs at least one region");

export const nonPlayableBoardsSchema = z.record(
  z.enum(NON_PLAYABLE_BOARD_PRESET_IDS),
  z.record(z.enum(NON_PLAYABLE_BOARD_COUNTRY_IDS), regionBoardsSchema)
);

export type PoliticalBoard = z.infer<typeof politicalBoardSchema>;

/** Keyed loosely so callers can index by any preset or country string and get undefined. */
export type NonPlayableBoards = Record<string, Record<string, Record<string, PoliticalBoard>>>;
