/**
 * Federal debt accounting — principal, interest, ceiling, ratings.
 *
 * **Currency (v0.2.6):** Every field used here — `debt.principal`,
 * `debt.interestRate`, `debt.ceiling`, `revenue.total`, `spending.total`, `gdp`
 * — is denominated in the owning country's currency. All math is intra-country
 * (principal accumulation, deficit accrual, ceiling comparison, debt-to-GDP),
 * so no FX conversion is needed here. Cross-currency flows (e.g. a JP sovereign
 * bondholder who holds the bond in JPY and lives in a USD-home country) settle
 * through `bonds/sovereign.ts`, which converts bond-currency proceeds/repayments
 * to the issuer's country currency before touching these fields.
 */
import type { Db } from "mongodb";
import type { CreditRating, FederalBudget, DebtCeilingCrisis } from "@/lib/db/types/budget";
import { effectiveBorrowingLimit } from "@/lib/budget/borrowingLimit";
import {
  sovereignStockAnnualService,
  type SovereignCouponBook,
} from "@/lib/budget/rules/sovereignDebtService";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { federalSurplus } from "@/lib/budget/federalSurplus";
import type { DebtTrajectory } from "@/lib/budget/rules/sovereignDebtSustainability";
import { explainSovereignRate } from "@/lib/budget/rules/sovereignRate";

export {
  DEBT_THRESHOLDS,
  EXTREME_DISTRESS_DEBT_TO_GDP,
  MAX_SOVEREIGN_RATE,
  calculateCreditRating,
  calculateInterestRate,
  getDebtThreshold,
  getSovereignConfidencePremium,
} from "@/lib/budget/rules/sovereignRate";

export async function processAnnualDebt(
  db: Db,
  federalBudget: FederalBudget,
  nationalGDP: number,
  /**
   * The country's outstanding sovereign coupon book. When supplied, interest is
   * the coupons the stock carries plus the marginal rate on unrepresented stock.
   * Omitted: legacy whole-stock pricing.
   */
  couponBook?: SovereignCouponBook | null
): Promise<{
  newPrincipal: number;
  interestPayment: number;
  debtToGdpRatio: number;
  creditRating: CreditRating;
  interestRate: number;
  /** Which way the debt ratio is moving, from this year's balance and rates. */
  debtTrajectory: DebtTrajectory;
  ceilingExceeded: boolean;
}> {
  // The bond ledger owns the debt stock (see bonds/sovereignPrincipal.ts):
  // issuance, maturity, and default mutations maintain `debt.principal`
  // incrementally. Do not re-derive it from the treasury balance.
  const newPrincipal = Math.max(0, federalBudget.debt?.principal ?? 0);
  const marginalRate = federalBudget.debt?.interestRate ?? 0;
  const interestPayment =
    couponBook === undefined
      ? newPrincipal * marginalRate
      : sovereignStockAnnualService({
          principal: newPrincipal,
          book: couponBook,
          marginalRate,
          imfBailoutActive: federalBudget.imfSovereignBailoutActive,
        });

  const debtToGdpRatio = newPrincipal / nationalGDP;
  // `spending.total` includes debt service, so adding the interest bill back
  // gives the PRIMARY balance the debt-dynamics identity wants; feeding it the
  // total balance would count interest twice and understate the premium. The
  // same composer attributes the rate on the budget page, so the explanation
  // and the charge cannot drift apart.
  const primaryBalance = federalSurplus(federalBudget) + interestPayment;
  const rate = explainSovereignRate({
    debtToGdpRatio,
    primaryBalanceToGdp: nationalGDP > 0 ? primaryBalance / nationalGDP : 0,
    realGrowthPct: federalBudget.economicFactors?.gdpGrowth,
    inflationPct: federalBudget.economicFactors?.inflationRate,
    investorConfidence: federalBudget.investorConfidence,
    imfBailoutActive: federalBudget.imfSovereignBailoutActive,
    sovereignRiskAnchor: federalBudget.sovereignRiskAnchor,
  });
  const creditRating = rate.ladderRating;
  const interestRate = rate.effectiveRate;
  const ceilingExceeded =
    newPrincipal >
    effectiveBorrowingLimit({
      countryId: federalBudget.countryId,
      gdp: federalBudget.gdpSmoothed ?? nationalGDP,
      storedCeiling: federalBudget.debt.ceiling,
    });

  return {
    newPrincipal,
    interestPayment,
    debtToGdpRatio,
    creditRating,
    interestRate,
    debtTrajectory: rate.path.trajectory,
    ceilingExceeded,
  };
}

export async function triggerDebtCeilingCrisis(db: Db, fiscalYear: number): Promise<void> {
  await gameStateCollection<DebtCeilingCrisis>(db).updateOne(
    { _id: "debt_ceiling_crisis" },
    {
      $set: {
        active: true,
        triggeredAt: new Date(),
        triggeredYear: fiscalYear,
        turnsElapsed: 0,
        resolved: false,
      },
    },
    { upsert: true }
  );
}

export async function resolveDebtCeilingCrisis(db: Db): Promise<void> {
  await gameStateCollection<DebtCeilingCrisis>(db).updateOne(
    { _id: "debt_ceiling_crisis" },
    {
      $set: {
        active: false,
        resolved: true,
        resolvedAt: new Date(),
      },
    }
  );
}

export async function checkDebtCeilingCrisis(db: Db): Promise<DebtCeilingCrisis | null> {
  return gameStateCollection<DebtCeilingCrisis>(db).findOne({
    _id: "debt_ceiling_crisis",
    active: true,
  });
}

export async function incrementCrisisTurns(db: Db): Promise<number> {
  const result = await gameStateCollection<DebtCeilingCrisis>(db).findOneAndUpdate(
    { _id: "debt_ceiling_crisis", active: true },
    { $inc: { turnsElapsed: 1 } },
    { returnDocument: "after" }
  );
  return result?.turnsElapsed || 0;
}
