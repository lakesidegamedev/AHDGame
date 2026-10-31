/**
 * County populations conserve their state's people. apportionPopulation assigns
 * integer people proportionally; advanceCountyPopulations applies demographic
 * changes to existing county stocks and rolls them up into the state total.
 */
export interface CountyPopulation {
  id: string;
  population: number;
}

function assertPopulation(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid county population");
}

function validateWeights(weights: readonly CountyPopulation[]): bigint {
  const ids = new Set<string>();
  for (const row of weights) {
    assertPopulation(row.population);
    if (typeof row.id !== "string" || !row.id || ids.has(row.id))
      throw new Error("Duplicate or invalid county ID");
    ids.add(row.id);
  }
  return weights.reduce((n, row) => n + BigInt(row.population), BigInt(0));
}

/** Validate whole county stocks and their safe integer rollup. */
export function countyPopulationTotal(counties: readonly CountyPopulation[]): number {
  const total = Number(validateWeights(counties));
  assertPopulation(total);
  return total;
}

/** Largest remainders, with FIPS tie breaks and exact integer arithmetic. */
export function apportionPopulation(
  weights: readonly CountyPopulation[],
  total: number
): CountyPopulation[] {
  assertPopulation(total);
  const sum = validateWeights(weights);
  if (sum === BigInt(0) && total !== 0)
    throw new Error("Cannot allocate population without county weights");
  const rows = weights.map((row) => {
    const product = BigInt(row.population) * BigInt(total);
    return {
      id: row.id,
      population: sum ? Number(product / sum) : 0,
      remainder: sum ? product % sum : BigInt(0),
    };
  });
  const remaining = total - rows.reduce((n, row) => n + row.population, 0);
  const ranked = [...rows].sort((a, b) =>
    a.remainder === b.remainder ? a.id.localeCompare(b.id) : a.remainder > b.remainder ? -1 : 1
  );
  for (let i = 0; i < remaining; i++) ranked[i].population++;
  return rows.map(({ id, population }) => ({ id, population }));
}

/** Allocate the net realized births, deaths and migration without changing state totals. */
export function advanceCountyPopulations(
  counties: readonly CountyPopulation[],
  totalAfter: number,
  initialWeights?: readonly CountyPopulation[]
): CountyPopulation[] {
  assertPopulation(totalAfter);
  const before = countyPopulationTotal(counties);
  if (before === 0 && totalAfter > 0 && initialWeights) {
    const allocations = apportionPopulation(initialWeights, totalAfter);
    const byId = new Map(allocations.map((c) => [c.id, c.population]));
    if (allocations.length !== counties.length || counties.some((c) => !byId.has(c.id)))
      throw new Error("Initial county weights do not match the county roster");
    return counties.map((c) => ({ id: c.id, population: byId.get(c.id)! }));
  }
  const change = totalAfter - before;
  const allocations = apportionPopulation(counties, Math.abs(change));
  return counties.map((row, i) => ({
    id: row.id,
    population: row.population + Math.sign(change) * allocations[i].population,
  }));
}
