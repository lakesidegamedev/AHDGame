/**
 * Branch-capacity arithmetic: how much deposit base a bank's financial sector
 * can carry. The shell (`banking/capacityAllocation.ts`) loads the sectors and
 * converts revenue to capacity units.
 */

import type { BankCharter } from "@/lib/db/types/bank";

/**
 * Default share of financial-sector capacity allocated to the branch network
 * (vs commodity `financial_services` output) when the CEO has not set one.
 * Provisional - flagged for user review.
 */
export const DEFAULT_BRANCH_CAPACITY_SHARE = 0.5;

/**
 * Home-currency face deposits supported per unit of branch capacity.
 *
 * Derivation (modern unit scale = 1, financial `standard` strategy):
 *   k = supply_rate / basePrice = 0.5 / 2000 = 0.00025 units per anchor of daily revenue
 *   A typical single financial sector at DEFAULT_SECTOR_STARTING_REVENUE (1M/day)
 *     => capacity units = 1_000_000 x 0.00025 = 250
 *   Target deposits at 50% branch share ~ 10-20x charter capital = 100M-200M
 *     => DEPOSIT_CEILING_PER_CAPACITY_UNIT = target / (units x 0.5)
 *       in [800_000, 1_600_000]; midpoint 1_200_000 gives
 *       250 x 0.5 x 1_200_000 = 150M = 15x charter capital.
 *
 * Provisional - worldsim / playtest may retune.
 */
export const DEPOSIT_CEILING_PER_CAPACITY_UNIT = 1_200_000;

/** Inclusive CEO-set bounds for branchCapacityShare. */
export const MIN_BRANCH_CAPACITY_SHARE = 0.1;
export const MAX_BRANCH_CAPACITY_SHARE = 0.9;

/**
 * Resolved branch-capacity share on a charter. Unset / non-finite -> default.
 * Does not clamp to the CEO slider band; callers that persist must validate.
 */
export function getBranchCapacityShare(
  charter: Pick<BankCharter, "branchCapacityShare"> | null | undefined
): number {
  const raw = charter?.branchCapacityShare;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return DEFAULT_BRANCH_CAPACITY_SHARE;
}

/**
 * Share of branch capacity actually taken, given how full the bank's deposit
 * room is. A new or converting bank takes nothing until deposits arrive, and
 * the cost tops out at the CEO's set share once the room is full. Reads the
 * charter's cached depositCeiling (written each banking turn), so this stays a
 * pure function over the charter record with no extra query.
 */
export function getEffectiveBranchCapacityShare(
  charter:
    Pick<BankCharter, "branchCapacityShare" | "totalDeposits" | "depositCeiling"> | null | undefined
): number {
  const share = getBranchCapacityShare(charter);
  const deposits =
    typeof charter?.totalDeposits === "number" && Number.isFinite(charter.totalDeposits)
      ? Math.max(0, charter.totalDeposits)
      : 0;
  const ceiling =
    typeof charter?.depositCeiling === "number" && Number.isFinite(charter.depositCeiling)
      ? Math.max(0, charter.depositCeiling)
      : 0;
  if (!(deposits > 0) || !(ceiling > 0)) return 0;
  return share * Math.min(1, deposits / ceiling);
}

/**
 * Deposit ceiling from financial-sector capacity allocated to branches:
 *   ceiling = financialSectorCapacity x branchShare x DEPOSIT_CEILING_PER_CAPACITY_UNIT
 */
export function computeDepositCeiling(
  financialSectorCapacity: number,
  branchShare: number
): number {
  const capacity =
    typeof financialSectorCapacity === "number" && Number.isFinite(financialSectorCapacity)
      ? Math.max(0, financialSectorCapacity)
      : 0;
  const share =
    typeof branchShare === "number" && Number.isFinite(branchShare) ? Math.max(0, branchShare) : 0;
  return capacity * share * DEPOSIT_CEILING_PER_CAPACITY_UNIT;
}
