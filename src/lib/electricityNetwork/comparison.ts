import { performance } from "node:perf_hooks";
import { advanceProducerEconomy } from "@/lib/market/producerMarket/production";
import type {
  ProducerEconomyInput,
  ProducerEconomyResult,
} from "@/lib/market/producerMarket/productionTypes";
import { electricityReport } from "./rules/report";
/** A bounded, read-only counterfactual cannot alter authoritative settlement on failure. */
export function compareElectricity(
  input: ProducerEconomyInput,
  actual: ProducerEconomyResult,
  targets: Parameters<typeof electricityReport>[3],
  maximumPasses = input.maximumPlanningPasses
) {
  const network = input.electricityNetwork;
  if (!network || network.mode === "off") return undefined;
  const start = performance.now();
  try {
    const other = advanceProducerEconomy(
      {
        ...input,
        maximumPlanningPasses: maximumPasses,
        electricityNetwork: { ...network, mode: network.mode === "enforced" ? "off" : "enforced" },
      },
      {
        maximumElapsedMs: 8000,
        elapsedMs: () => performance.now() - start,
        checkBudget: () => {
          if (performance.now() - start > 10000)
            throw Error("Comparison exceeded its ten-second compute budget.");
        },
      }
    );
    return network.mode === "enforced"
      ? electricityReport(network, other, actual, targets)
      : electricityReport(network, actual, other, targets);
  } catch {
    // Only comparison telemetry is lost; authoritative cash and inventory keep
    // the successful actual result and can be retried from its frozen receipt.
    const report = electricityReport(
      network,
      actual,
      null,
      targets,
      "Comparison was not completed within its bounded compute budget or failed validation. Actual settlement is unchanged."
    );
    return {
      ...report,
      off: network.mode === "enforced" ? null : report.off,
      grid: network.mode === "enforced" ? report.off : null,
      companies: [],
      sites: [],
      routes: [],
      lines: actual.electricity,
    };
  }
}
