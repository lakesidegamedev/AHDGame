/**
 * Per-turn record of a bank's branch network: deposits, the deposit ceiling,
 * the CEO's branch share and the share of financial capacity branches took.
 *
 * Branches take `branchCapacityShare x min(1, deposits / ceiling)` of a
 * deposit-taking bank's financial capacity, and that share comes straight off
 * its financial-services output. Only the charter's current values are stored,
 * so a one-turn swing in output could not be explained afterwards. The
 * corporation history row now carries this snapshot each turn.
 *
 * Pure: charter in, snapshot out.
 */
import type { BankCharter } from "@/lib/db/types/bank";
import { charterMay } from "@/lib/banking/rules/capabilities";
import {
  getBranchCapacityShare,
  getEffectiveBranchCapacityShare,
} from "@/lib/banking/rules/capacity";

export interface BankBranchSnapshot {
  /** Home-currency face deposits on the charter this turn. */
  totalDeposits: number;
  /** Deposit ceiling the charter carried this turn (home currency). */
  depositCeiling: number;
  /** The CEO's branch share, 0 to 1. */
  branchCapacityShare: number;
  /** Deposits over the ceiling, capped at 1; 0 when either is missing. */
  depositFill: number;
  /** Share of financial capacity branches took: branchCapacityShare x depositFill. */
  takenShare: number;
}

const finite = (x: unknown): number =>
  typeof x === "number" && Number.isFinite(x) ? Math.max(0, x) : 0;

const round = (x: number, places: number) => {
  const f = 10 ** places;
  return Math.round(x * f) / f;
};

/**
 * Snapshot for an active charter that runs a branch network, else undefined.
 * Investment-only and inactive charters give no capacity to branches, so they
 * record nothing.
 */
export function bankBranchSnapshot(
  charter: BankCharter | null | undefined
): BankBranchSnapshot | undefined {
  if (!charter || charter.status !== "active") return undefined;
  if (!charterMay(charter, "branchNetwork")) return undefined;
  const totalDeposits = finite(charter.totalDeposits);
  const depositCeiling = finite(charter.depositCeiling);
  const depositFill =
    totalDeposits > 0 && depositCeiling > 0 ? Math.min(1, totalDeposits / depositCeiling) : 0;
  return {
    totalDeposits: Math.round(totalDeposits),
    depositCeiling: Math.round(depositCeiling),
    branchCapacityShare: round(getBranchCapacityShare(charter), 4),
    depositFill: round(depositFill, 4),
    takenShare: round(getEffectiveBranchCapacityShare(charter), 4),
  };
}
