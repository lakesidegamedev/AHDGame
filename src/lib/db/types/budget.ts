import type {
  CreditRating,
  CurrencyCode,
  FederalRevenue,
  FederalTaxRates,
  FederalTaxBases,
  EconomicGrowthFactors,
  FederalSpending,
  FederalDebt,
} from "@/lib/db/types/federalBudget";
export type {
  CreditRating,
  BudgetDocumentId,
  CurrencyCode,
  FederalRevenue,
  FederalTaxRates,
  FederalTaxBases,
  EconomicGrowthFactors,
  FederalSpending,
  FiscalConsolidationState,
  FiscalConsolidationRecord,
  FederalDebt,
  SovereignRiskAnchor,
  SovereignCrisisState,
  SovereignResolutionChoice,
  ImfBoardOverrideKind,
  TurnAndRealtime,
  DefenseAppropriation,
  IntelligenceAppropriation,
  DepartmentCapacityPool,
  DepartmentProgramState,
  DepartmentAccount,
  TreasuryAccrualReceipt,
  BankSovereignClaim,
  FederalBudget,
  FundedSovereignCouponClaim,
} from "@/lib/db/types/federalBudget";
import type { IncomeTaxBatchReceipt } from "./incomeTax";

import type { IncomeShares } from "@/lib/budget/rules/incomeTaxTiers";
import type { ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { JurisdictionMode } from "./legislation";

/** Frozen snapshot of a country's federal budget at a fiscal year boundary. */
export interface FederalBudgetSnapshot {
  /** Composite key: "${countryId}:FY${fiscalYear}" e.g. "US:FY2021" */
  _id: string;
  countryId: string;
  fiscalYear: number;
  /** Game turn when the snapshot was taken */
  turn: number;

  /** Complete frozen budget state */
  budget: {
    revenue: FederalRevenue;
    taxRates: FederalTaxRates;
    taxBases: FederalTaxBases;
    spending: FederalSpending;
    debt: FederalDebt;
    economicFactors: EconomicGrowthFactors;
    surplus: number;
    gdp: number;
    debtToGdpRatio: number;
    creditRating: CreditRating;
    /**
     * Currency at snapshot time. Mirrors `FederalBudget.currencyCode` so
     * historical viewers don't have to re-derive from `countryId` (which can
     * drift if a country's mapping ever changes). Added v0.2.6; earlier
     * snapshots may lack this field — consumers fall back to
     * `resolveCountryCurrencyCode(countryId)` in that case.
     */
    currencyCode?: CurrencyCode;
  };

  /** State grants breakdown at this FY */
  stateGrants: { stateId: string; stateName: string; amount: number }[];

  /** Enacted fiscal laws active at this FY */
  enactedLaws: {
    title: string;
    budgetCategory: string;
    /** Formatted cost: "$750/person", "2.5% of GDP", "$500M", etc. */
    costModel: string;
    enactedYear: number;
  }[];

  createdAt: Date;
}

export interface StateRevenue {
  incomeTax: number;
  salesTax: number;
  /** Tax collected from corps HQ'd in the same country as this state. */
  domesticCorporateTax: number;
  /** Tax collected from corps HQ'd outside this state's country. */
  foreignCorporateTax: number;
  propertyTax: number;
  /**
   * DE Gewerbesteuer revenue at the Land level: `domesticCorporateProfits × 0.035 × tradeTax / 100`,
   * where tradeTax is the Hebesatz and 0.035 is the federally-fixed Steuermesszahl.
   * Undefined or 0 for other countries.
   */
  tradeTax?: number;
  federalGrants: number;
  other: number;
  /**
   * Accumulated extraction-contract royalty revenue (contract-issuance feature).
   * A persistent, dedicated line so per-turn contractSettlement credits ($inc on
   * this field + revenue.total) survive the annual fiscal recompute:
   * calculateStateRevenue reads this back and folds it into `total`, exactly like
   * `other`. Absent = 0 for legacy budgets.
   */
  resourceRoyalties?: number;
  total: number;
}

export interface StateTaxRates {
  capitalGainsTaxLow?: number;
  capitalGainsTaxMiddle?: number;
  capitalGainsTaxHigh?: number;
  /** Legacy aggregate retained for old saves and historical readouts. */
  incomeTax: number;
  incomeTaxLow?: number;
  incomeTaxMiddle?: number;
  incomeTaxHigh?: number;
  salesTax: number;
  /** Rate applied to corps HQ'd in the same country as this state. */
  domesticCorporateTax: number;
  /** Rate applied to corps HQ'd outside this state's country. */
  foreignCorporateTax: number;
  propertyTax: number;
  /**
   * DE Gewerbesteuer-Hebesatz at the Land level (200-600 typical).
   * NOT the effective rate: the engine multiplies by 0.035 (Steuermesszahl).
   * Undefined or 0 for other countries.
   */
  tradeTax?: number;
}

/**
 * State tax bases - economic values that get taxed at state level.
 *
 * **Currency:** Post-v0.2.6, all fields are denominated in the state's country's
 * currency. See {@link FederalTaxBases} for the full invariant; the state path
 * follows the same corp-turn normalization (state GDP → country currency; the
 * 25% "actual corp" weight is multiplied by the country's FX rate before
 * blending into the base).
 */
export interface StateTaxBases {
  taxableIncome: number; // State taxable income
  taxableSales: number; // State taxable sales
  /** State corporate profits from corps HQ'd in the same country. */
  domesticCorporateProfits: number;
  /** State corporate profits from corps HQ'd outside this state's country. */
  foreignCorporateProfits: number;
  propertyValue: number; // Total assessed property value
}

export interface StateSpending {
  byCategory: Record<string, number>;
  /**
   * Accumulated geological-survey spend funded by a state government
   * (prospecting feature). A persistent, dedicated line — the symmetric spending
   * analogue of {@link StateRevenue.resourceRoyalties}. `spending.byCategory` is
   * REBUILT from enacted laws on every annual recompute (calculateStateSpending),
   * so a raw byCategory key would be clobbered; this dedicated field is read back
   * and re-folded into `total` by calculateStateSpending / normalizeStateSpending
   * so per-turn `$inc`s survive. Absent = 0 for legacy budgets.
   */
  resourceProspecting?: number;
  total: number;
}

export interface StateBudget {
  /** Monotonic tax-collection proof, reset with the owning world balance. */
  incomeTaxBatchReceipt?: IncomeTaxBatchReceipt | null;
  /** Income-weighted census shares; independent of the numeric tax-base vector. */
  incomeTaxShares?: IncomeShares;
  _id: string;
  stateId: string;
  /**
   * Country that owns this state budget. Required to disambiguate cross-country
   * state-ID collisions (e.g. CN HB vs DE HB) — without this the bare stateId
   * `_id` would silently route to the wrong country.
   *
   * Optional in the type to ease forward compatibility with legacy rows; all
   * new seeds set it. Lookups should always include it when known.
   */
  countryId?: CountryId;
  fiscalYear: number;
  revenue: StateRevenue;
  taxRates: StateTaxRates;
  taxBases: StateTaxBases;
  spending: StateSpending;
  /** Authorized law demand before cabinet-free regional funding settlement. */
  authorizedSpending?: StateSpending;
  regionalProgramSettlements?: Record<
    string,
    {
      programId: string;
      legislationTypeId: string;
      policyOptionId: string;
      authorizedCost: number;
      fundedAmount: number;
      unfundedAmount: number;
      implementationFactor: number;
      obligationPriority: number;
      lastSettledTurn: number;
      /** Inclusive turn through which this cadence-based settlement is current. */
      validThroughTurn?: number;
    }
  >;
  balance: number;
  surplus: number;
  stateGdp: number; // State GDP for reference
  updatedAt: Date;
}

export interface EnactedLaw {
  _id: ObjectId;
  billId: ObjectId;
  legislationTypeId: string;
  title: string;
  scope: "national" | "state";
  countryId?: string;
  stateId?: string;
  /** Delivery model derived from the enacted policy option. Absent legacy records use catalog defaults. */
  jurisdictionMode?: JurisdictionMode;
  /** @deprecated Legacy percentage-of-budget cost (0-100). Use annualCostUsd for new laws. */
  budgetCost: number;
  /** Fixed annual cost in the local currency. */
  annualCostUsd?: number;
  /** Annual cost that scales with current GDP: multiplier × GDP. */
  gdpPerCapitaMultiplier?: number;
  /** Annual cost that scales with current population: amount × population. */
  annualCostPerCapita?: number;
  /**
   * Era cost model (Spec B, flag-on only). Fraction of GDP for gdpFraction-class
   * types: cost = gdpCostFraction × GDP. Never read when eraSystemEnabled is off.
   */
  gdpCostFraction?: number;
  /**
   * Era cost model (Spec B, flag-on only). Fraction of per-capita income for
   * perCapita-class types: cost = incomeCostFraction × the GAME's live national
   * median income × population (macro-v1 Phase 1; falls back to a share-of-GDP
   * form when live income is unavailable). Never read when eraSystemEnabled is off.
   */
  incomeCostFraction?: number;
  /** Tax rate (%) for tax-rate legislation types. */
  rate?: number;
  /** Index of the enacted policy option within the legislation type's policyOptions array. */
  policyOptionIndex?: number;
  /**
   * Political-legislation v2 cost model (spec §5.1) — presence is the
   * generation discriminator; routing prices it through the new cost engine on
   * the rollup base. Legacy flat fraction fields above are never written on
   * new-generation records.
   */
  costModelV2?: {
    gdpCostFraction?: number;
    incomeCostFraction?: number;
    gdpRevenueFraction?: number;
  };
  /**
   * Annual law revenue (local currency) for new-generation laws. Summed from
   * scratch into `revenue.lawRevenue` on every budget sync (§5.1 idempotency
   * rule — never folded into `revenue.other`).
   */
  annualRevenueV2?: number;
  budgetCategory: string;
  enactedAt: Date;
  enactedYear: number;
  repealedAt?: Date;
  isGrant?: boolean;
  grantType?: "formula" | "discretionary";
  grantDistribution?: Record<string, number>;
  /**
   * Attribution for how this law came to be enacted. Absent/"legislature" for
   * ordinary bills. "scotus_ruling" marks a diverged Supreme Court case via the
   * same `onBillEnacted`/`recordEnactedLaw` pipeline real bills use.
   * "scotus_surprise_ruling" marks a procedurally-spawned surprise case, kept as
   * a DISTINCT value so financial/audit trails and the case-history UI can tell
   * curated historical rulings apart from background-probability flavor content.
   */
  source?:
    "legislature" | "scotus_ruling" | "scotus_surprise_ruling" | "uk_judicial_review_surprise";
}

export type GrantFormulaType = "population" | "poverty" | "matching" | "hybrid";

export interface FormulaGrant {
  programId: string;
  programName: string;
  poolPercentage: number;
  formulaType: GrantFormulaType;
  matchRate?: number;
  hybridWeights?: { population: number; poverty: number };
}

export interface DebtCeilingCrisis {
  _id: "debt_ceiling_crisis";
  active: boolean;
  triggeredAt?: Date;
  triggeredYear?: number;
  turnsElapsed: number;
  resolved?: boolean;
  resolvedAt?: Date;
}
