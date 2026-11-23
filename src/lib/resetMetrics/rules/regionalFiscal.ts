/**
 * Fiscal approval conditions belong to the government that owns the budget.
 * The fiscal balance and debt burden are national treasury ledger readings, so
 * a regional board never carries them. A governor is judged on the region's own
 * budget; the national treasury's readings apply to national approval only.
 */
import { primaryMetrics } from "../catalog";
import type { OpeningMetricObservation } from "./openingObservation";

/** Treasury-owned metrics published only at national scope (fiscal balance, debt). */
export const LEDGER_FISCAL_METRIC_IDS: readonly string[] = primaryMetrics
  .filter((metric) => metric.owner === "ledger" && metric.aggregation === "national")
  .map((metric) => metric.id);

const BALANCE_PATH = "governance.budgetBalance";
const DEBT_PATH = "governance.debtToGdp";

export interface RegionalFiscalPosition {
  /** Annual revenue minus annual spending, in the region's currency. */
  surplus?: number | null;
  /** Outstanding regional borrowing, in the region's currency. */
  principal?: number | null;
  /** Regional output, in the same currency units as surplus and principal. */
  gdp?: number | null;
}

function observation(path: string, value: number): OpeningMetricObservation {
  const metric = primaryMetrics.find((m) => m.path === path)!;
  return {
    metricId: metric.id,
    path,
    value: Math.round(value * 100) / 100,
    status: "derived",
    source: "regional budget",
    owner: metric.owner,
    note: "Regional budget position",
  };
}

/**
 * The region's own fiscal balance and debt burden as percentages of its output.
 * Returns nothing when the region has no budget or no output to measure against,
 * so no fiscal condition fires on a guess.
 */
export function regionalFiscalObservations(
  position: RegionalFiscalPosition | undefined
): Record<string, OpeningMetricObservation> {
  const gdp = position?.gdp;
  if (gdp == null || !Number.isFinite(gdp) || gdp <= 0) return {};
  const result: Record<string, OpeningMetricObservation> = {};
  const surplus = position?.surplus;
  if (surplus != null && Number.isFinite(surplus)) {
    const reading = observation(BALANCE_PATH, (surplus / gdp) * 100);
    result[reading.metricId] = reading;
  }
  const principal = position?.principal ?? 0;
  if (Number.isFinite(principal)) {
    const reading = observation(DEBT_PATH, (Math.max(0, principal) / gdp) * 100);
    result[reading.metricId] = reading;
  }
  return result;
}

/** National readings without the treasury's fiscal balance and debt. */
export function withoutLedgerFiscal(
  observations: Readonly<Record<string, OpeningMetricObservation>>
): Record<string, OpeningMetricObservation> {
  return Object.fromEntries(
    Object.entries(observations).filter(([id]) => !LEDGER_FISCAL_METRIC_IDS.includes(id))
  );
}

/** Only the treasury's fiscal balance and debt, for national approval. */
export function onlyLedgerFiscal(
  observations: Readonly<Record<string, OpeningMetricObservation>>
): Record<string, OpeningMetricObservation> {
  return Object.fromEntries(
    Object.entries(observations).filter(([id]) => LEDGER_FISCAL_METRIC_IDS.includes(id))
  );
}
