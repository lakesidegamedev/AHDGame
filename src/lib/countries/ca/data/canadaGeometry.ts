/**
 * Canada's thirteen provinces and territories, keyed by region code (= the
 * game's `states._id`). The shard `public/ca-regions.json` tags each feature
 * with `properties.regionCode`.
 *
 * Source: the `canada.geojson` boundaries of codeforgermany/click_that_hood
 * (MIT), commit fb1c363b3624a256d42f00788fca96d9faf43a45, simplified with a
 * 0.06 degree tolerance, islands under 0.1 square degrees dropped (each
 * region keeps its largest polygon) and coordinates rounded to 3 decimals.
 */
export const CANADA_GEO_URL = "/ca-regions.json";

export const CA_REGION_CODES = [
  "CA_AB",
  "CA_BC",
  "CA_MB",
  "CA_NB",
  "CA_NL",
  "CA_NS",
  "CA_NT",
  "CA_NU",
  "CA_ON",
  "CA_PE",
  "CA_QC",
  "CA_SK",
  "CA_YT",
] as const;
