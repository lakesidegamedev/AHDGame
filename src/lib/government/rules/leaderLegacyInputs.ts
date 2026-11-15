/**
 * The Crisis v2 slice of a legacy: what the accountability ledger and scars say
 * about one leader's term. Plain data in, plain data out.
 */
import { judgeHolders } from "@/lib/crises/v2/blame";
import type { AccountabilityEntry, CrisisScar } from "@/lib/crises/v2/types";

export interface CrisisSliceForLegacy {
  startTurn: number;
  v2?: { ledger?: AccountabilityEntry[]; scars?: CrisisScar[] };
}

/**
 * Credit minus blame, in approval points, the ledger gives one holder across the
 * crises that reached the country during their term. Ledger rows before the
 * term began are ignored, so a predecessor's idle turns are not charged here.
 */
export function crisisPointsForLeader(
  crises: readonly CrisisSliceForLegacy[],
  holderId: string,
  startTurn: number
): number {
  let total = 0;
  for (const crisis of crises) {
    const rows = (crisis.v2?.ledger ?? []).filter((entry) => entry.turn >= startTurn);
    for (const verdict of judgeHolders(rows)) {
      if (verdict.holderId === holderId) total += verdict.approvalDelta;
    }
  }
  return total;
}

/**
 * Peak scar magnitude (fraction) from crises that began during the term. The
 * scar as laid down is used, not what has healed since: the legacy records what
 * the crisis cost, and healing is the next leader's gain.
 */
export function scarMagnitudeForTerm(
  crises: readonly CrisisSliceForLegacy[],
  startTurn: number,
  endTurn: number
): number {
  let total = 0;
  for (const crisis of crises) {
    if (crisis.startTurn < startTurn || crisis.startTurn > endTurn) continue;
    for (const scar of crisis.v2?.scars ?? []) total += Math.max(0, scar.magnitude);
  }
  return total;
}
