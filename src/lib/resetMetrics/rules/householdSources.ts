/**
 * Household references keep survey observations separate from current cash flows.
 * Source decoders retain missing fields and population restrictions; current
 * producers cannot promote a marginal table into a regional distribution.
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
}

export interface HouseholdCurrentState {
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

/** Separate fiscal-owner receipt; the economic producer must not manufacture it from its own rows. */
export interface HouseholdFiscalControls {
  sourceId: string;
  worldId: string;
  countryId: string;
  currency: string;
  turn: number;
  population: "all-household-residents" | "players-only";
  basis: "settled-household-flows" | "budget-forecast";
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
