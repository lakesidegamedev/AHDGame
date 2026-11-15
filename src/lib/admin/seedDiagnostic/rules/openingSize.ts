import { nppOpeningUnits } from "@/lib/admin/seed/rules/nppOpeningSize";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";

export interface OpeningSectorRow {
  lane: OperatingSectorType;
  capacityUnits: number;
}

/**
 * Lanes whose opening private sectors differ from the standard opening size.
 * Plain data in, plain data out; the caller selects the rows that were opened
 * on the standard strategy.
 */
export function openingSizeDeviations(
  rows: readonly OpeningSectorRow[],
  tolerance = 1e-6
): Array<{ lane: OperatingSectorType; expected: number; actual: number }> {
  const out: Array<{ lane: OperatingSectorType; expected: number; actual: number }> = [];
  for (const row of rows) {
    const expected = nppOpeningUnits(row.lane);
    if (Math.abs(row.capacityUnits - expected) > tolerance * Math.max(1, expected)) {
      out.push({ lane: row.lane, expected, actual: row.capacityUnits });
    }
  }
  return out;
}
