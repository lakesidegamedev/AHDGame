import {
  FAMILY_SLUGS,
  POLITICAL_METRIC_CATEGORIES,
  type PoliticalMetricCategoryId,
  type PoliticalMetricId,
  type PoliticalMetricsCountryId,
} from "../types";

type Rows = Record<PoliticalMetricCategoryId, readonly number[]>;
function board(rows: Rows): Record<PoliticalMetricId, number> {
  const result = {} as Record<PoliticalMetricId, number>;
  for (const category of POLITICAL_METRIC_CATEGORIES) {
    if (rows[category.id].length !== 7) throw new Error(`Incomplete 2027 ${category.id} row`);
    FAMILY_SLUGS[category.id].forEach((slug, index) => {
      result[`${category.id}.${slug}` as PoliticalMetricId] = rows[category.id][index];
    });
  }
  return result;
}

/**
 * 2027 modeled opening on the authored 1991 board's scale: policy capacity and
 * outcomes, not polling. Modeled from mid-2020s conditions; not a forecast.
 * US and UK: strong institutions, strained public finances and services.
 * RU: wartime autocracy with commodity strength. DE: strong institutions,
 * industrial stagnation, costly energy. JP: top health and schooling, very
 * high debt, ageing. CN: one-party state with infrastructure scale.
 * DD does not exist in 2027 and has no entry.
 */
export const NATIONAL_BASELINES_2027: Partial<
  Record<PoliticalMetricsCountryId, Record<PoliticalMetricId, number>>
> = {
  US: board({
    economy: [48, 52, 66, 58, 74, 36, 66],
    education: [66, 56, 60, 64, 82, 52, 72],
    health: [48, 60, 52, 48, 62, 70, 40],
    infrastructure: [40, 46, 74, 56, 72, 70, 62],
    order: [56, 46, 50, 58, 54, 66, 70],
    environment: [66, 52, 72, 86, 78, 68, 82],
    society: [56, 66, 50, 52, 52, 56, 60],
    governance: [70, 72, 76, 58, 60, 56, 64],
    defense: [70, 72, 70, 74, 88, 86, 90],
  }),
  UK: board({
    economy: [44, 48, 56, 52, 52, 38, 62],
    education: [72, 54, 58, 64, 74, 62, 60],
    health: [74, 58, 58, 64, 60, 50, 46],
    infrastructure: [48, 66, 72, 54, 60, 62, 52],
    order: [64, 44, 56, 62, 58, 50, 58],
    environment: [62, 70, 74, 56, 46, 40, 44],
    society: [60, 66, 50, 50, 54, 56, 54],
    governance: [70, 70, 48, 68, 62, 64, 64],
    defense: [72, 72, 74, 62, 66, 52, 62],
  }),
  RU: board({
    economy: [36, 34, 44, 40, 42, 52, 30],
    education: [64, 50, 56, 60, 48, 52, 30],
    health: [56, 46, 44, 44, 46, 36, 44],
    infrastructure: [46, 60, 62, 46, 42, 70, 46],
    order: [18, 24, 32, 52, 20, 82, 80],
    environment: [40, 30, 44, 88, 84, 74, 92],
    society: [36, 52, 34, 26, 18, 50, 72],
    governance: [14, 10, 18, 18, 44, 82, 90],
    defense: [26, 46, 18, 30, 74, 70, 64],
  }),
  DE: board({
    economy: [66, 56, 64, 50, 64, 66, 56],
    education: [70, 56, 62, 58, 74, 54, 50],
    health: [82, 74, 64, 68, 62, 64, 52],
    infrastructure: [62, 70, 80, 50, 70, 46, 50],
    order: [72, 66, 62, 70, 68, 58, 56],
    environment: [72, 72, 74, 46, 40, 34, 40],
    society: [52, 62, 54, 46, 58, 56, 52],
    governance: [76, 74, 76, 74, 58, 50, 54],
    defense: [70, 70, 72, 60, 58, 46, 40],
  }),
  JP: board({
    economy: [60, 52, 58, 62, 62, 30, 54],
    education: [84, 70, 76, 82, 70, 80, 50],
    health: [88, 76, 76, 88, 58, 74, 62],
    infrastructure: [48, 92, 84, 70, 74, 62, 54],
    order: [58, 50, 76, 88, 64, 62, 62],
    environment: [62, 62, 66, 42, 30, 46, 22],
    society: [38, 42, 56, 22, 62, 66, 72],
    governance: [60, 62, 48, 66, 76, 58, 62],
    defense: [66, 64, 72, 54, 54, 56, 30],
  }),
  CN: board({
    economy: [44, 46, 56, 54, 70, 48, 40],
    education: [70, 56, 54, 68, 76, 74, 24],
    health: [64, 54, 58, 66, 54, 40, 52],
    infrastructure: [48, 84, 74, 66, 82, 72, 72],
    order: [16, 20, 50, 78, 26, 82, 80],
    environment: [54, 58, 42, 66, 72, 60, 70],
    society: [34, 58, 48, 30, 14, 58, 52],
    governance: [10, 6, 20, 38, 66, 88, 94],
    defense: [56, 52, 46, 66, 82, 80, 58],
  }),
};
