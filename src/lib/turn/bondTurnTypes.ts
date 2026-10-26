import type { treasuryAnchorValuation } from "@/lib/budget/rules/treasuryAccrual";
import type { SovereignMaturityCashLeg } from "@/lib/bonds/sovereignMaturityPayoutTargets";
import type { PartialTxEntry } from "./bondTurnLedger";

/** Everything one sovereign maturity settles, built before any money moves. */
export interface SovereignMaturityPlan {
  treasuryValuation: NonNullable<ReturnType<typeof treasuryAnchorValuation>>;
  bankUnits: number;
  nonBankRepaymentLocal: number;
  holderLegs: SovereignMaturityCashLeg[];
  maturityEntries: PartialTxEntry[];
}

/** Counters and per-country flows one bond phase reports. */
export interface BondTurnResult {
  bondsProcessed: number;
  couponsPaid: number;
  bondsMatured: number;
  bondsDefaulted: number;
  totalCouponsPaid: number;
  bondHistorySnapshots: number;
  /** Bonds cured this turn by forced auto-restructuring (sector sale) of lingering defaults. */
  bondsAutoRestructured: number;
  /** Bonds cured this turn by auto-refinance (replacement bond, no sale) of lingering defaults. */
  bondsAutoRefinanced: number;
  /** Actual at-par issuance plus later placements, for the v2 cash shell. */
  sovereignCashProceedsByCountry?: Record<string, number>;
  /** New debt face, which can differ from actual placement consideration. */
  sovereignDebtFaceIssuedByCountry?: Record<string, number>;
  /** Actual sovereign coupon and maturity obligations already paid by this bond phase. */
  sovereignCouponPaidByCountry?: Record<string, number>;
  sovereignMaturityCashPaidByCountry?: Record<string, number>;
  sovereignDebtFaceRetiredByCountry?: Record<string, number>;
}
