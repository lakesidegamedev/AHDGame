export type { SovereignMaturityPlan } from "@/lib/bonds/sovereignMaturityWave";

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
