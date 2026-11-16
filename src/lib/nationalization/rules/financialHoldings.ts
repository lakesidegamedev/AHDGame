/** Weighted ownership books retain their recorded basis without inventing missing costs. */
export interface RecordedPosition {
  units: number;
  unitCost?: number;
  anchorBasis?: boolean;
  superUnits?: number;
}

export function consolidatePositions(rows: readonly RecordedPosition[], localPerAnchor: number) {
  if (!(localPerAnchor > 0) || !Number.isFinite(localPerAnchor))
    throw new Error("Invalid holdings exchange rate");
  let units = 0,
    basis = 0,
    superUnits = 0,
    known = false,
    unknown = false;
  for (const row of rows) {
    if (!Number.isFinite(row.units) || row.units < 0) throw new Error("Invalid holdings quantity");
    if (!row.units) continue;
    units += row.units;
    if (row.unitCost === undefined) unknown = true;
    else {
      if (!Number.isFinite(row.unitCost) || row.unitCost < 0)
        throw new Error("Invalid holdings cost");
      known = true;
      basis += (row.units * row.unitCost) / (row.anchorBasis ? 1 : localPerAnchor);
    }
    const rights = row.superUnits ?? 0;
    if (!Number.isFinite(rights) || rights < 0) throw new Error("Invalid holdings voting rights");
    superUnits += Math.min(row.units, rights);
  }
  if (known && unknown)
    throw new Error(
      "Tracked and untracked holdings costs must be reconciled before combining positions"
    );
  if (!Number.isFinite(units) || !Number.isFinite(basis))
    throw new Error("Holdings value overflow");
  return { units, ...(known && units > 0 ? { unitCost: basis / units } : {}), superUnits };
}

export function combineLiabilityBooks(
  a: Readonly<Record<string, number | undefined>> | undefined,
  b: Readonly<Record<string, number | undefined>> | undefined
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const book of [a, b])
    for (const [key, value] of Object.entries(book ?? {})) {
      if (value === undefined) continue;
      if (!Number.isFinite(value) || value < 0 || !Number.isFinite((result[key] ?? 0) + value))
        throw new Error("Invalid liability book");
      result[key] = (result[key] ?? 0) + value;
    }
  return result;
}
