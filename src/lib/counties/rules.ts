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

/** Largest remainders, with FIPS tie breaks and exact integer arithmetic. */
export function apportionPopulation(
  weights: readonly CountyPopulation[],
  total: number
): CountyPopulation[] {
  assertPopulation(total);
  const ids = new Set<string>();
  for (const row of weights) {
    assertPopulation(row.population);
    if (!row.id || ids.has(row.id)) throw new Error("Duplicate or empty county ID");
    ids.add(row.id);
  }
  const sum = weights.reduce((n, row) => n + BigInt(row.population), BigInt(0));
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
  totalAfter: number
): CountyPopulation[] {
  assertPopulation(totalAfter);
  const before = counties.reduce((n, row) => n + row.population, 0);
  assertPopulation(before);
  const change = totalAfter - before;
  const allocations = apportionPopulation(counties, Math.abs(change));
  return counties.map((row, i) => ({
    id: row.id,
    population: row.population + Math.sign(change) * allocations[i].population,
  }));
}
