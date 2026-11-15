/**
 * Restart probe for an idle plant (gameConfig.producerZombieRestartStage).
 *
 * A company with capacity, no cash and no recent sales can never restart on
 * its own: no cash means no run, no run means no sales, and the sales advance
 * borrows only against last turn's sales. A probe runs a small share of
 * capacity as intra-turn credit against that output's book value at today's
 * market price, repaid from the probe's own sales. Anything not covered stays
 * owed as an ordinary producer payable, so no money is created.
 *
 * A plant probes only when the probe pays for itself at market prices (inputs
 * at expectedInputUnitPrice) and some other buyer has funded demand for its
 * output. A plant whose probes keep failing stops after
 * RESTART_PROBE_MAX_FAILURES turns in a row.
 *
 * Pure: plain data in, plain data out. Anchor units throughout.
 */
import { expectedInputUnitPrice, SALES_ADVANCE_REVENUE_SHARE } from "./salesAdvanceRules";

/** Share of a plant's full physical run a probe makes. */
export const RESTART_PROBE_RUN_SHARE = 0.05;
/** Largest probe share a caller may ask for; a probe is never a full restart. */
export const RESTART_PROBE_MAX_RUN_SHARE = 0.1;
/** Consecutive probe turns that did not pay for themselves before the plant stops probing. */
export const RESTART_PROBE_MAX_FAILURES = 3;

export interface RestartProbePlant {
  /** Full physical run this turn: capacity x active fraction x output multiplier. */
  fullUnits: number;
  /** Wages at a full run. */
  labourCost: number;
  /** The running part of the site bill at a full run (cold upkeep excluded). */
  runningSiteCost: number;
  inputs: readonly {
    unitsPerOutput: number;
    /** Bid ceiling. */
    maximumUnitPrice: number;
    /** Last turn's clearing price on the input's lane, if it traded. */
    clearingUnitPrice?: number;
    /** Units already held. */
    stockUnits: number;
  }[];
  outputs: readonly {
    unitsPerOutput: number;
    /** Last turn's clearing price on the output's own lane, if it traded. */
    marketUnitPrice?: number;
    /** Another buyer has funded demand on this lane at or above the market price. */
    fundedBuyers: boolean;
  }[];
  /** Consecutive failed probes before this turn. */
  priorFailures?: number;
}

export interface RestartProbe {
  /** Share of the full run the probe makes. */
  runShare: number;
  /** Probe revenue at market price after the margin for a weaker market. */
  expectedRevenue: number;
  /** Probe running cost with inputs at their expected price. */
  expectedCost: number;
  /** Intra-turn credit the probe may draw: its ceiling-priced cost, capped by its expected revenue. */
  advance: number;
}

const positive = (x: number | undefined) =>
  typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;

/**
 * The probe this plant may run, or null when it may not: it has stopped after
 * repeated failures, it has no physical run, no output with a market price and
 * funded buyers, or the probe would not pay for itself at market prices.
 */
export function restartProbe(
  plant: RestartProbePlant,
  options: { runShare?: number; revenueShare?: number } = {}
): RestartProbe | null {
  if ((plant.priorFailures ?? 0) >= RESTART_PROBE_MAX_FAILURES) return null;
  const share = Math.min(
    RESTART_PROBE_MAX_RUN_SHARE,
    positive(options.runShare ?? RESTART_PROBE_RUN_SHARE)
  );
  const units = positive(plant.fullUnits) * share;
  if (!(units > 0)) return null;
  let unitRevenue = 0;
  for (const output of plant.outputs)
    if (output.fundedBuyers)
      unitRevenue += positive(output.unitsPerOutput) * positive(output.marketUnitPrice);
  if (!(unitRevenue > 0)) return null;
  const haircut = Math.min(1, Math.max(0, options.revenueShare ?? SALES_ADVANCE_REVENUE_SHARE));
  const expectedRevenue = units * unitRevenue * haircut;
  const running = share * (positive(plant.labourCost) + positive(plant.runningSiteCost));
  let expectedCost = running,
    ceilingCost = running;
  for (const input of plant.inputs) {
    const bought = Math.max(0, units * positive(input.unitsPerOutput) - positive(input.stockUnits));
    const ceiling = positive(input.maximumUnitPrice);
    expectedCost += bought * expectedInputUnitPrice(ceiling, input.clearingUnitPrice);
    ceilingCost += bought * ceiling;
  }
  if (!Number.isFinite(expectedRevenue) || !Number.isFinite(ceilingCost)) return null;
  if (expectedRevenue < expectedCost) return null;
  return {
    runShare: share,
    expectedRevenue,
    expectedCost,
    advance: Math.min(ceilingCost, expectedRevenue),
  };
}

/**
 * A run pays for itself when it sold something and its revenue covered its
 * running cost (everything but the cold upkeep owed with no run at all).
 */
export function probePaidForItself(result: {
  revenue: number;
  profit: number;
  idleOperatingCost?: number;
}): boolean {
  return result.revenue > 0 && result.profit + positive(result.idleOperatingCost) >= -1e-9;
}

/**
 * Consecutive failed probes through this turn. A probe that paid, or a normal
 * run that paid, clears the count; a failed probe adds one; a normal run that
 * did not pay leaves it where it was.
 */
export function nextProbeFailures(input: {
  priorFailures?: number;
  probed: boolean;
  paid: boolean;
}): number {
  const prior = Math.max(0, Math.floor(positive(input.priorFailures)));
  if (input.paid) return 0;
  return input.probed ? prior + 1 : prior;
}
