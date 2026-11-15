/**
 * Plausibility ranges for national figures in a freshly seeded world.
 *
 * These are authored plausibility ranges, not sourced data. They come from
 * general knowledge of each economy and are deliberately wide: they exist to
 * catch a seed that is off by a unit, a currency or an order of magnitude, not
 * to adjudicate a forecast. Nothing here is a citation.
 *
 * `gdpPerHeadUsd` is national GDP divided by population and by the seeded
 * exchange rate (local currency per US dollar). `debtToGdp` is a ratio, so
 * 1.2 means debt of 120 percent of GDP. Rates and inflation are percent.
 */

export type Range = readonly [min: number, max: number];

export interface ReferenceRow {
  gdpPerHeadUsd: Range;
  primeRate: Range;
  inflation: Range;
  debtToGdp: Range;
}

const EURO_PRIME: Range = [0.5, 4.5];

export const REFERENCE_FIGURES: Record<string, Record<string, ReferenceRow>> = {
  "2027-default": {
    US: {
      gdpPerHeadUsd: [60_000, 110_000],
      primeRate: [2, 6.5],
      inflation: [0.5, 5],
      debtToGdp: [0.8, 1.5],
    },
    CA: {
      gdpPerHeadUsd: [45_000, 90_000],
      primeRate: [1, 5],
      inflation: [0.5, 5],
      debtToGdp: [0.4, 1.1],
    },
    UK: {
      gdpPerHeadUsd: [40_000, 75_000],
      primeRate: [1.5, 6],
      inflation: [0.5, 6],
      debtToGdp: [0.7, 1.4],
    },
    DE: {
      gdpPerHeadUsd: [40_000, 75_000],
      primeRate: EURO_PRIME,
      inflation: [0.5, 5],
      debtToGdp: [0.4, 1.0],
    },
    JP: {
      gdpPerHeadUsd: [25_000, 50_000],
      primeRate: [0, 2.5],
      inflation: [0, 4.5],
      debtToGdp: [1.5, 2.8],
    },
    CN: {
      gdpPerHeadUsd: [9_000, 22_000],
      primeRate: [1.5, 5],
      inflation: [-1, 4],
      debtToGdp: [0.5, 1.5],
    },
    IE: {
      gdpPerHeadUsd: [70_000, 150_000],
      primeRate: EURO_PRIME,
      inflation: [0.5, 5],
      debtToGdp: [0.15, 0.8],
    },
    BR: {
      gdpPerHeadUsd: [7_000, 18_000],
      primeRate: [5, 17],
      inflation: [2, 9],
      debtToGdp: [0.5, 1.3],
    },
    NG: {
      gdpPerHeadUsd: [500, 4_000],
      primeRate: [8, 30],
      inflation: [8, 35],
      debtToGdp: [0.15, 0.8],
    },
    RU: {
      gdpPerHeadUsd: [8_000, 25_000],
      primeRate: [7, 25],
      inflation: [2, 12],
      debtToGdp: [0.1, 0.6],
    },
    PL: {
      gdpPerHeadUsd: [15_000, 35_000],
      primeRate: [2, 7.5],
      inflation: [1, 8],
      debtToGdp: [0.3, 0.9],
    },
    HU: {
      gdpPerHeadUsd: [15_000, 35_000],
      primeRate: [2, 10],
      inflation: [1.5, 9],
      debtToGdp: [0.4, 1.0],
    },
    RO: {
      gdpPerHeadUsd: [11_000, 28_000],
      primeRate: [3, 10],
      inflation: [1.5, 9],
      debtToGdp: [0.3, 0.9],
    },
    BG: {
      gdpPerHeadUsd: [11_000, 28_000],
      primeRate: EURO_PRIME,
      inflation: [1, 8],
      debtToGdp: [0.15, 0.7],
    },
    FR: {
      gdpPerHeadUsd: [35_000, 65_000],
      primeRate: EURO_PRIME,
      inflation: [0.5, 5],
      debtToGdp: [0.8, 1.6],
    },
    IT: {
      gdpPerHeadUsd: [30_000, 55_000],
      primeRate: EURO_PRIME,
      inflation: [0.5, 5],
      debtToGdp: [1.0, 1.9],
    },
    ES: {
      gdpPerHeadUsd: [28_000, 50_000],
      primeRate: EURO_PRIME,
      inflation: [0.5, 5],
      debtToGdp: [0.8, 1.5],
    },
    SE: {
      gdpPerHeadUsd: [45_000, 85_000],
      primeRate: [0, 4.5],
      inflation: [0.5, 5],
      debtToGdp: [0.2, 0.7],
    },
    TR: {
      gdpPerHeadUsd: [8_000, 30_000],
      primeRate: [8, 55],
      inflation: [8, 60],
      debtToGdp: [0.1, 0.6],
    },
    AT: {
      gdpPerHeadUsd: [45_000, 80_000],
      primeRate: EURO_PRIME,
      inflation: [0.5, 5],
      debtToGdp: [0.5, 1.2],
    },
    FI: {
      gdpPerHeadUsd: [40_000, 75_000],
      primeRate: EURO_PRIME,
      inflation: [0.3, 5],
      debtToGdp: [0.5, 1.3],
    },
    GR: {
      gdpPerHeadUsd: [18_000, 40_000],
      primeRate: EURO_PRIME,
      inflation: [0.5, 6],
      debtToGdp: [0.9, 2.0],
    },
  },
};
