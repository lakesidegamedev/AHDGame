import type { ExtractableResource } from "@/lib/constants/commodities";

/**
 * Most a research breakthrough may grow a state's deposit for one resource,
 * as a multiple of the value the world was seeded with (headroom included).
 */
export const RD_DEPOSIT_SEED_CEILING_MULTIPLE = 3;

export interface RdDepositGrowthInput {
  /** The mine's extraction utilization (0..1); absent means unconstrained. */
  utilization: number | undefined;
  /** The resource that binds the mine's utilization, if any. */
  bindingResource: ExtractableResource | null | undefined;
  /** Extractable resources the mine's recipe produces. */
  recipeResources: readonly ExtractableResource[];
  /** The state's deposit for the binding resource, including growth already granted this turn. */
  currentDeposit: number;
  /** The state's seeded deposit for the binding resource; absent or 0 means no reference. */
  seedDeposit: number | undefined;
  /** Rolled growth fraction of the current deposit. */
  growthFraction: number;
}

/** Deposit growth one breakthrough grants, or null when it grants none. */
export interface RdDepositGrowth {
  resource: ExtractableResource;
  increase: number;
}

/** The highest deposit research can reach for a resource seeded at `seedDeposit`. */
export function rdDepositCeiling(seedDeposit: number | undefined): number {
  if (typeof seedDeposit !== "number" || !Number.isFinite(seedDeposit) || seedDeposit <= 0) {
    return 0;
  }
  return seedDeposit * RD_DEPOSIT_SEED_CEILING_MULTIPLE;
}

/**
 * Deposit growth from one extraction breakthrough.
 *
 * Research only proves up more of the resource that is actually holding the
 * mine back: the mine must be deposit-constrained (utilization below 1 with a
 * binding resource its recipe produces), and only that resource grows. Growth
 * is a fraction of the current deposit, clipped so the deposit never passes
 * RD_DEPOSIT_SEED_CEILING_MULTIPLE times its seed. A resource with no seed
 * reference never grows, so compounding cannot run past geology.
 */
export function rdDepositGrowth(input: RdDepositGrowthInput): RdDepositGrowth | null {
  const { utilization, bindingResource, recipeResources, currentDeposit, growthFraction } = input;
  if (typeof utilization !== "number" || !Number.isFinite(utilization) || utilization >= 1) {
    return null;
  }
  if (!bindingResource || !recipeResources.includes(bindingResource)) return null;
  if (!Number.isFinite(currentDeposit) || currentDeposit <= 0) return null;
  if (!Number.isFinite(growthFraction) || growthFraction <= 0) return null;

  const headroom = Math.floor(rdDepositCeiling(input.seedDeposit) - currentDeposit);
  if (headroom <= 0) return null;
  const increase = Math.min(Math.round(currentDeposit * growthFraction), headroom);
  return increase > 0 ? { resource: bindingResource, increase } : null;
}
