/**
 * Supply-chain planning finishes when sites stop changing, within the host's
 * time budget and a pass limit. Unfinished sites remain visible in the receipt.
 */
export interface ProducerPlanningSiteChange {
  producerId: string;
  previousUnits: number;
  plannedUnits: number;
  relativeChange: number;
  referenceValueChange: number;
}

export interface ProducerPlanningDiagnostics {
  passes: number;
  maximumPasses: number;
  converged: boolean;
  stopReason: "converged" | "pass_limit" | "runtime_limit";
  /** Only sites still changing materially in the final planning pass. */
  siteChanges: ProducerPlanningSiteChange[];
}

export function producerPlanningSiteChange(
  producerId: string,
  previousUnits: number,
  plannedUnits: number,
  referenceUnitValue: number
): ProducerPlanningSiteChange | undefined {
  const difference = Math.abs(plannedUnits - previousUnits);
  // Retain the existing convergence tolerance rather than changing the balance.
  if (difference <= Math.max(1e-9, previousUnits * 1e-4)) return undefined;
  return {
    producerId,
    previousUnits,
    plannedUnits,
    relativeChange: difference / Math.max(1e-9, previousUnits),
    referenceValueChange: difference * referenceUnitValue,
  };
}

export function producerPlanningStop(input: {
  changed: boolean;
  passes: number;
  maximumPasses: number;
  deadlineReached: boolean;
}): ProducerPlanningDiagnostics["stopReason"] | undefined {
  if (!input.changed) return "converged";
  if (input.deadlineReached) return "runtime_limit";
  if (input.passes >= input.maximumPasses) return "pass_limit";
  return undefined;
}

export function producerPlanningWarnings(planning?: ProducerPlanningDiagnostics): string[] {
  if (!planning || planning.converged) return [];
  const largest = [...planning.siteChanges]
    .sort(
      (a, b) =>
        b.referenceValueChange - a.referenceValueChange ||
        (a.producerId < b.producerId ? -1 : a.producerId > b.producerId ? 1 : 0)
    )
    .slice(0, 5)
    .map((site) => `${site.producerId} (${(site.relativeChange * 100).toFixed(2)}% change)`);
  return [
    `Producer market planning reached its ${planning.stopReason === "runtime_limit" ? "runtime" : "pass"} limit after ${planning.passes} passes; ${planning.siteChanges.length} sites still changing. Final clearing completed. Largest reference-value changes: ${largest.join(", ") || "credit allocation only"}.`,
  ];
}
