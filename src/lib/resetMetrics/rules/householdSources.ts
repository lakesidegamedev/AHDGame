/**
 * Household references keep survey observations separate from current cash flows.
 * Source decoders retain missing fields and population restrictions; current
 * producers do not promote marginal tables into measured distributions.
 * Explicitly labeled public-calibrated cohorts are a separate model path.
 */
import type { HouseholdAdapterCountry } from "./householdCountryAdapter";
import type { HouseholdPublicationSource } from "./householdPublication";

export interface HouseholdReferenceCell {
  id: string;
  sourceArea: string;
  households: number | null;
  adults: number | null;
  children: number | null;
  marketIncome: number | null;
  /** Annual earned income subject to the game's payroll levy; never total capital income. */
  labourIncome?: number;
  /** Explicit reviewed non-income direct taxes. The first income model requires zero. */
  otherDirectTaxes?: number;
  /** Explicit taxable housing-value proxy for a calibrated model, not observed assets. */
  propertyTaxBase?: number;
  cashTransfers: number | null;
  directTaxes: number | null;
  employeeContributions: number | null;
  grossIncome: number | null;
  sampleHouseholds?: number;
  meanHouseholdSize?: number;
  /** Uncollapsed survey categories, retained for source reconciliation, not current fiscal receipts. */
  reportedIncomeComponents?: Readonly<Record<string, number>>;
}
export interface HouseholdDecodedReference {
  version: 1;
  countryId: HouseholdAdapterCountry;
  sourceId: string;
  incomeYear: number;
  currency: "USD" | "GBP" | "JPY";
  population: "all-household-residents" | "multi-person-only" | "workers-only";
  distribution: "joint-household-groups" | "marginal-means";
  /** Reasons from source semantics, not a flag that a seed may silently clear. */
  gaps: readonly string[];
  cells: readonly HouseholdReferenceCell[];
  calibration?: HouseholdCohortCalibration;
}

export interface HouseholdCohortCalibration {
  kind: "public-data-calibrated-cohorts";
  version: 1;
  assumptions: readonly string[];
  sourceUrls: readonly string[];
}

export function isPublicHouseholdCalibration(
  value: HouseholdCohortCalibration | undefined
): boolean {
  return (
    !!value &&
    value.kind === "public-data-calibrated-cohorts" &&
    value.version === 1 &&
    Array.isArray(value.assumptions) &&
    value.assumptions.length > 0 &&
    value.assumptions.every((a) => typeof a === "string" && a.trim().length > 0) &&
    Array.isArray(value.sourceUrls) &&
    value.sourceUrls.length > 0 &&
    value.sourceUrls.every((url) => typeof url === "string" && url.startsWith("https://"))
  );
}

export interface HouseholdCurrentState {
  incomeBasis?: "modeled-economic-income";
  calibration?: HouseholdCohortCalibration;
  worldId: string;
  countryId: HouseholdAdapterCountry;
  currency: string;
  turn: number;
  year: number;
  priceBaseYear: number;
  /** A current economic/demographic owner, not a historical survey date. */
  ownerId: string;
  referenceSourceId: string;
  basketSourceId: string;
  regions: readonly {
    regionId: string;
    householdResidents: number;
    consumerPriceIndex: number;
  }[];
  geography: readonly { sourceArea: string; regionId: string }[];
  cells: readonly {
    id: string;
    sourceArea: string;
    households: number;
    adults: number;
    children: number;
    /** Annual per-household local currency, excluding government cash and services. */
    marketIncome: number;
    directTaxes: number;
    employeeContributions: number;
  }[];
  programRoles: readonly (HouseholdPublicationSource["programRoles"][number] & {
    /** Current reviewed eligibility for this enacted option. No historical-benefit-share inference. */
    recipients?: readonly { id: string; sourceArea: string; eligibility: number }[];
  })[];
}

/** Settled controls are independent receipts. Modeled controls are labeled model accounting totals, never evidence of cash settlement. */
export interface HouseholdFiscalControls {
  sourceId: string;
  worldId: string;
  countryId: string;
  currency: string;
  turn: number;
  population: "all-household-residents" | "players-only";
  basis: "settled-household-flows" | "modeled-household-flows" | "budget-forecast";
  annualMarketIncome: number;
  annualDirectTaxes: number;
  annualEmployeeContributions: number;
}

export interface HouseholdSourceProduction {
  evaluatedAtTurn: number;
  path: "legacy" | "produced";
  gaps: readonly string[];
  source?: HouseholdPublicationSource;
}
export type HouseholdProductionStatus = Omit<HouseholdSourceProduction, "source">;

/** Reviewed reference-year calibration, not a current income frame. */
export interface HouseholdIncomeModel {
  /** Reviewed employee incidence of the payroll instrument, between zero and one. */
  employeePayrollShare: number;
  worldId: string;
  countryId: HouseholdAdapterCountry;
  referenceSourceId: string;
  sourceId: string;
  preset: string;
  year: number;
  regions: readonly {
    regionId: string;
    sourceAreas: readonly string[];
    /** Same authored GDP denomination as State.gdp; only within-region ratios are used. */
    output: number;
    population: number;
    costOfLiving: number;
  }[];
  programRoles: readonly (HouseholdCurrentState["programRoles"][number] & {
    /** Bound to the exact enacted option; fixed groups are explicit, never inferred from survey cash. */
    eligibilityModel?:
      | { kind: "fixed-reference-groups" }
      | {
          kind: "maximum-modeled-market-income";
          annualPerAssessmentUnit: number;
          indexedToPrices: boolean;
        };
  })[];
}

/** Historical modeled tax estimates are not current receipts and are not used by the new tax model. */
export function householdReferenceGaps(reference: HouseholdDecodedReference, modeled: boolean) {
  return reference.gaps.filter(
    (g) =>
      !modeled ||
      !["estimated-tax-liabilities-not-cash", "tax-credits-and-filing-units-not-resolved"].includes(
        g
      )
  );
}
