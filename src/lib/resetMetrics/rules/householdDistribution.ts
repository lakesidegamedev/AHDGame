/**
 * National purchasing power and inequality pool modeled household distributions.
 * householdDistributionRollup includes between-region income differences instead
 * of averaging medians or Ginis. It is a discrete lognormal estimate, not a survey.
 */
export interface HouseholdRegion {
  weight: number;
  median: number;
  gini: number;
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const tail =
    (Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)) *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - tail : tail;
}

function quantile(p: number): number {
  let lo = -8,
    hi = 8;
  for (let i = 0; i < 45; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const QUANTILES = Array.from({ length: 64 }, (_, i) => quantile((i + 0.5) / 64));

function giniOfSorted(cells: readonly { value: number; weight: number }[]): number {
  let count = 0,
    income = 0,
    difference = 0;
  for (const cell of cells) {
    difference += cell.weight * (cell.value * count - income);
    count += cell.weight;
    income += cell.value * cell.weight;
  }
  return income > 0 ? (100 * difference) / (count * income) : 0;
}

/** Fit the discretized distribution itself, avoiding an unpriced truncated tail. */
function cellsFor(region: HouseholdRegion) {
  let lo = 0,
    hi = 20;
  for (let i = 0; i < 45; i++) {
    const mid = (lo + hi) / 2;
    const gini = giniOfSorted(QUANTILES.map((z) => ({ value: Math.exp(mid * z), weight: 1 })));
    if (gini < region.gini) lo = mid;
    else hi = mid;
  }
  const sigma = (lo + hi) / 2;
  // Even quantiles: normalize the two central cells so their median is the supplied median.
  const midpoint = (Math.exp(sigma * QUANTILES[31]!) + Math.exp(sigma * QUANTILES[32]!)) / 2;
  return QUANTILES.map((z) => ({
    value: (region.median * Math.exp(sigma * z)) / midpoint,
    weight: region.weight / 64,
  }));
}

export function householdDistributionRollup(
  regions: readonly HouseholdRegion[]
): { median: number; gini: number } | null {
  if (
    !regions.length ||
    regions.some(
      (r) =>
        ![r.weight, r.median, r.gini].every(Number.isFinite) ||
        r.weight <= 0 ||
        r.median <= 0 ||
        r.gini < 0 ||
        r.gini > 95
    )
  )
    return null;
  const cells = regions.flatMap(cellsFor).sort((a, b) => a.value - b.value);
  const half = regions.reduce((n, r) => n + r.weight, 0) / 2;
  let weight = 0,
    median = cells.at(-1)!.value;
  for (let i = 0; i < cells.length; i++) {
    weight += cells[i]!.weight;
    if (weight >= half - half * 1e-12) {
      median =
        Math.abs(weight - half) < half * 1e-12 && i + 1 < cells.length
          ? (cells[i]!.value + cells[i + 1]!.value) / 2
          : cells[i]!.value;
      break;
    }
  }
  return { median, gini: giniOfSorted(cells) };
}
