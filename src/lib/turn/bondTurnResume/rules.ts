/**
 * Rebuild bondTurn's sovereign cash flows after the phase died mid-run.
 *
 * resetTreasuryCash needs the five sovereign maps bondTurn returns. When the
 * phase is interrupted (a crash, a lost Mongo connection, a timeout) its
 * result is gone, and before this the turn stopped until someone rebuilt the
 * maps by hand (turn 372). The maps can be rebuilt exactly from what the phase
 * committed, because on the funded Treasury path:
 *
 * - sovereign coupons are paid by TreasuryTurn, so bondTurn's coupon map is
 *   always empty (bondTurn skips sovereign bonds in its coupon loop);
 * - every due sovereign bond settles through the funded maturity path, which
 *   never fills the maturity cash or face retired maps;
 * - issuance proceeds are the at-par snapshot bondTurn checkpoints right after
 *   scheduled issuance, plus each primary placement receipt the journal
 *   applied this turn.
 *
 * Anything the evidence cannot settle exactly is refused, and the turn keeps
 * failing closed as it did before.
 */
import { sovereignIssuanceFlowsByCountry } from "@/lib/resetFinance/rules/sovereignProceeds";

export interface PrimaryReceiptEvidence {
  /** Money-move key: `sovereign-primary:<scheduled|placement>:<id>:<turn>`. */
  key: string;
  status: string;
  /** True when any cash leg or projection of the receipt has been applied. */
  anyApplied: boolean;
  /** Country the receipt's issuer cash row names. */
  countryId: string | null;
  /** Cash credited to the issuing Treasury. */
  cashPaid: number | null;
  /** Debt face booked to the issuing budget. */
  face: number | null;
}

export interface BondTurnResumeEvidence {
  turn: number;
  treasuryCashLedgerEnabled: boolean;
  /** bondTurn's at-par snapshot, or null when the phase died before writing it. */
  checkpoint: { atParIssues: readonly { countryId: string; face: number }[] } | null;
  /** Sovereign non-reconcile bonds issued this turn. Read only without a checkpoint. */
  issuedThisTurn: readonly { countryId: string | null; face: number }[];
  scheduledReceipts: readonly PrimaryReceiptEvidence[];
  placementReceipts: readonly PrimaryReceiptEvidence[];
}

export interface RebuiltBondTurnFlows {
  bondsProcessed: 0;
  couponsPaid: 0;
  bondsMatured: 0;
  bondsDefaulted: 0;
  totalCouponsPaid: 0;
  bondHistorySnapshots: 0;
  bondsAutoRestructured: 0;
  bondsAutoRefinanced: 0;
  sovereignCashProceedsByCountry: Record<string, number>;
  sovereignDebtFaceIssuedByCountry: Record<string, number>;
  sovereignCouponPaidByCountry: Record<string, number>;
  sovereignMaturityCashPaidByCountry: Record<string, number>;
  sovereignDebtFaceRetiredByCountry: Record<string, number>;
}

export type BondTurnFlowRebuild =
  | { ok: true; source: "checkpoint" | "issuance"; result: RebuiltBondTurnFlows }
  | { ok: false; reason: string };

const refuse = (reason: string): BondTurnFlowRebuild => ({ ok: false, reason });

function scheduledCountry(key: string, turn: number): string | null {
  const parts = key.split(":");
  return parts.length === 4 &&
    parts[0] === "sovereign-primary" &&
    parts[1] === "scheduled" &&
    parts[3] === String(turn)
    ? parts[2]
    : null;
}

/** The sovereign flows bondTurn would have returned for what it committed. */
export function rebuildInterruptedBondTurnFlows(
  evidence: BondTurnResumeEvidence
): BondTurnFlowRebuild {
  if (!evidence.treasuryCashLedgerEnabled) {
    return refuse(
      "the funded Treasury cash ledger is off, so coupon and maturity flows are not provable"
    );
  }
  for (const receipt of [...evidence.scheduledReceipts, ...evidence.placementReceipts]) {
    if (receipt.status === "applied") continue;
    if (receipt.status === "rejected" && !receipt.anyApplied) continue;
    return refuse(`primary receipt ${receipt.key} is ${receipt.status} with cash already moved`);
  }

  const placements: { countryId: string; face: number; cashPaid: number }[] = [];
  for (const receipt of evidence.placementReceipts) {
    if (receipt.status !== "applied") continue;
    if (
      !receipt.countryId ||
      receipt.cashPaid === null ||
      !Number.isFinite(receipt.cashPaid) ||
      receipt.cashPaid <= 0 ||
      receipt.face === null ||
      !Number.isSafeInteger(receipt.face) ||
      receipt.face <= 0
    ) {
      return refuse(`placement receipt ${receipt.key} is unreadable`);
    }
    placements.push({
      countryId: receipt.countryId,
      face: receipt.face,
      cashPaid: receipt.cashPaid,
    });
  }

  let atParIssues: { countryId: string; face: number }[];
  let source: "checkpoint" | "issuance";
  if (evidence.checkpoint) {
    atParIssues = [...evidence.checkpoint.atParIssues];
    source = "checkpoint";
  } else {
    // The checkpoint is written before the placement sweep, so placements
    // without one mean the snapshot cannot be recovered.
    if (placements.length > 0) return refuse("placements landed but no at-par checkpoint exists");
    // The phase died during or right after scheduled issuance. Nothing has
    // touched this turn's issues since, so they are the at-par snapshot, but
    // only if every issue is backed by an applied scheduled receipt.
    atParIssues = [];
    source = "issuance";
    for (const issue of evidence.issuedThisTurn) {
      if (!issue.countryId || !Number.isSafeInteger(issue.face) || issue.face < 0) {
        return refuse("an at-par issue is unreadable");
      }
      atParIssues.push({ countryId: issue.countryId, face: issue.face });
    }
    const receiptCountries = new Set<string>();
    for (const receipt of evidence.scheduledReceipts) {
      if (receipt.status !== "applied") continue;
      const countryId = scheduledCountry(receipt.key, evidence.turn);
      if (!countryId) return refuse(`scheduled receipt ${receipt.key} is unreadable`);
      receiptCountries.add(countryId);
    }
    const issueCountries = new Set(atParIssues.map((issue) => issue.countryId));
    const same =
      receiptCountries.size === issueCountries.size &&
      [...receiptCountries].every((countryId) => issueCountries.has(countryId));
    if (!same) return refuse("this turn's issues do not match its applied scheduled receipts");
  }

  let flows: Record<string, { cash: number; face: number }>;
  try {
    flows = sovereignIssuanceFlowsByCountry({ atParIssues, placements });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error));
  }
  return {
    ok: true,
    source,
    result: {
      bondsProcessed: 0,
      couponsPaid: 0,
      bondsMatured: 0,
      bondsDefaulted: 0,
      totalCouponsPaid: 0,
      bondHistorySnapshots: 0,
      bondsAutoRestructured: 0,
      bondsAutoRefinanced: 0,
      sovereignCashProceedsByCountry: Object.fromEntries(
        Object.entries(flows).map(([countryId, flow]) => [countryId, flow.cash])
      ),
      sovereignDebtFaceIssuedByCountry: Object.fromEntries(
        Object.entries(flows).map(([countryId, flow]) => [countryId, flow.face])
      ),
      sovereignCouponPaidByCountry: {},
      sovereignMaturityCashPaidByCountry: {},
      sovereignDebtFaceRetiredByCountry: {},
    },
  };
}
