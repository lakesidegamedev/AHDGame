/**
 * Player-facing view of a state's shared labour pool.
 *
 * Every corporate sector in a state hires from one civilian labour force. When
 * the sectors there collectively want more workers than the state has, each
 * one fills a share of its jobs set by its pay relative to the other employers
 * in the state (`staffingFactorFromTightness`). Pay moves that share; it does
 * not add workers. This module turns the persisted state readings into the
 * numbers a sector page shows so a player can see the size of the pool their
 * shortfall comes from.
 *
 * Pure: plain readings in, plain data out.
 */
import { relativeWageBid, staffingFactorFromTightness } from "@/lib/labour/labourMarket";

export interface StateLabourPoolInput {
  /** `economic.laborForce.value`: civilian labour force in the state. */
  laborForce: number | null | undefined;
  /** `economic.labourDemand.value`: workers every sector in the state wants. */
  labourDemand: number | null | undefined;
  /** `economic.labourTightness.value`: demand over labour force. */
  coverageTightness: number | null | undefined;
  /**
   * Corporate demand over corporate workers actually hired, from the employment
   * allocation. Staffing uses the larger of this and the coverage reading.
   */
  allocatedTightness: number | null | undefined;
  /** Corporate workers the employment allocation has placed so far. */
  corporateEmployed: number | null | undefined;
  /** `economic.labourDemandWageIndex.value`: desired-worker-weighted pay. */
  demandWageIndex: number | null | undefined;
  /** Whether the wage system is on. When off, pay plays no part in the share. */
  wagesEnabled: boolean;
  /** This sector's pay lever, already clamped to the legal range. */
  sectorWageLevel: number | null | undefined;
}

export interface StateLabourPoolView {
  /** Workers available in the state. */
  labourForce: number;
  /** Workers every employer in the state wants to hire. */
  labourDemand: number;
  /**
   * Corporate workers hired so far, only when hiring lag rather than the size
   * of the pool is what keeps jobs open. Null otherwise.
   */
  corporateEmployed: number | null;
  /** The tightness staffing actually uses. Null when unknown (no rationing). */
  tightness: number | null;
  /** Desired-worker-weighted pay across the state, when wages are on. */
  stateWageIndex: number | null;
  /** This sector's pay over the state figure, clamped as staffing clamps it. Null when wages are off. */
  sectorRelativeBid: number | null;
  /** Share of its jobs this sector moves toward at its current pay, 0 to 1. */
  targetStaffingFactor: number;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * The effective staffing tightness, combined exactly as the corporation turn
 * combines it: the employment allocation's reading when it is known, never
 * below the coverage reading.
 */
export function effectiveStaffingTightness(
  coverageTightness: number | null | undefined,
  allocatedTightness: number | null | undefined
): number | null {
  const coverage = finiteNonNegative(coverageTightness);
  const allocated = finiteNonNegative(allocatedTightness);
  if (allocated === null) return coverage;
  return Math.max(coverage ?? 0, allocated);
}

/** Build the pool view, or null when the state has no usable readings. */
export function buildStateLabourPoolView(input: StateLabourPoolInput): StateLabourPoolView | null {
  const labourForce = finiteNonNegative(input.laborForce);
  const labourDemand = finiteNonNegative(input.labourDemand);
  if (labourForce === null || labourForce <= 0 || labourDemand === null) return null;

  const tightness = effectiveStaffingTightness(input.coverageTightness, input.allocatedTightness);
  const coverage = finiteNonNegative(input.coverageTightness) ?? labourDemand / labourForce;
  const allocated = finiteNonNegative(input.allocatedTightness);
  const hiringLagBinds = allocated !== null && allocated > 1 && allocated > coverage;
  const employed = finiteNonNegative(input.corporateEmployed);

  const wageIndex = input.wagesEnabled ? finiteNonNegative(input.demandWageIndex) : null;
  const stateWageIndex = wageIndex !== null && wageIndex > 0 ? wageIndex : null;
  const sectorWage = finiteNonNegative(input.sectorWageLevel) ?? 1;
  const sectorRelativeBid = input.wagesEnabled
    ? relativeWageBid(sectorWage, stateWageIndex ?? 1)
    : null;

  return {
    labourForce: Math.round(labourForce),
    labourDemand: Math.round(labourDemand),
    corporateEmployed: hiringLagBinds && employed !== null ? Math.round(employed) : null,
    tightness,
    stateWageIndex,
    sectorRelativeBid,
    targetStaffingFactor: input.wagesEnabled
      ? staffingFactorFromTightness(tightness, sectorWage, stateWageIndex ?? 1)
      : staffingFactorFromTightness(tightness),
  };
}
