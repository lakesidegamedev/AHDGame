/**
 * Countries keep their existing household calculations until reference inputs
 * and fiscal reconciliation cover every region. resolveHouseholdCountry never
 * initializes missing households or activates a country from a synthetic fixture.
 */
import { householdResourceOutcomes, type HouseholdResourceReading } from "./householdResources";

export const HOUSEHOLD_REFERENCE_INPUTS = [
  "composition",
  "marketIncomeAndTransfers",
  "directTaxes",
  "employeeContributions",
  "paidCashTransfers",
  "consumerBasket",
] as const;

export type HouseholdReferenceInput = (typeof HOUSEHOLD_REFERENCE_INPUTS)[number];

export interface HouseholdCountryCoverage {
  countryId: string;
  currency: string;
  priceBaseYear: number;
  measurementTurn: number;
  /** Household residents only. Institutional residents require separate coverage. */
  regions: readonly { regionId: string; householdResidents: number }[];
  /** Explicit reviewed adapter references, not an inference from an opening score. */
  references: Partial<
    Record<
      HouseholdReferenceInput,
      {
        basis: "reference" | "synthetic" | "public-calibrated-model";
        sourceId: string;
      }
    >
  >;
  /** Same-window local-currency control totals from the fiscal and income owners. */
  reconciliation?: {
    sourceId: string;
    countryId: string;
    currency: string;
    measurementTurn: number;
    marketIncome: number;
    paidCashTransfers: number;
    directTaxes: number;
    employeeContributions: number;
  };
}

export type HouseholdCoverageGap =
  | `missing-reference:${HouseholdReferenceInput}`
  | "invalid-roster"
  | "incomplete-regional-coverage"
  | "incompatible-measurement"
  | "unreconciled-resources";

/** Incomplete evidence selects the existing path; it never manufactures zero inputs. */
export function householdCoverageGaps(
  coverage: HouseholdCountryCoverage,
  readings: readonly HouseholdResourceReading[]
): HouseholdCoverageGap[] {
  const gaps = new Set<HouseholdCoverageGap>();
  for (const input of HOUSEHOLD_REFERENCE_INPUTS) {
    const evidence = coverage.references[input];
    if (
      !["reference", "public-calibrated-model"].includes(evidence?.basis ?? "") ||
      !evidence?.sourceId.trim()
    )
      gaps.add(`missing-reference:${input}`);
  }
  const roster = new Map(coverage.regions.map((region) => [region.regionId, region]));
  if (
    !coverage.countryId ||
    !coverage.currency ||
    !Number.isSafeInteger(coverage.priceBaseYear) ||
    coverage.priceBaseYear < 1 ||
    !Number.isSafeInteger(coverage.measurementTurn) ||
    coverage.measurementTurn < 1 ||
    !roster.size ||
    roster.size !== coverage.regions.length ||
    coverage.regions.some(
      (r) => !r.regionId || !Number.isFinite(r.householdResidents) || r.householdResidents <= 0
    )
  )
    gaps.add("invalid-roster");
  if (
    readings.length !== roster.size ||
    new Set(readings.map((r) => r.regionId)).size !== readings.length
  )
    gaps.add("incomplete-regional-coverage");
  for (const reading of readings) {
    const region = roster.get(reading.regionId);
    const people = reading.cells.reduce((sum, cell) => sum + cell.people, 0);
    if (
      !region ||
      !Number.isFinite(people) ||
      Math.abs(people - region.householdResidents) > Math.max(1, region.householdResidents) * 1e-9
    )
      gaps.add("incomplete-regional-coverage");
    if (
      reading.countryId !== coverage.countryId ||
      reading.currency !== coverage.currency ||
      reading.priceBaseYear !== coverage.priceBaseYear ||
      reading.measurementTurn !== coverage.measurementTurn ||
      reading.definitionVersion !== 2 ||
      reading.equivalenceScale !== "square-root-household-size"
    )
      gaps.add("incompatible-measurement");
  }
  const control = coverage.reconciliation;
  if (
    !control?.sourceId.trim() ||
    control.countryId !== coverage.countryId ||
    control.currency !== coverage.currency ||
    control.measurementTurn !== coverage.measurementTurn
  )
    gaps.add("unreconciled-resources");
  for (const key of [
    "marketIncome",
    "paidCashTransfers",
    "directTaxes",
    "employeeContributions",
  ] as const) {
    const expected = control?.[key];
    // Recompute from cells, not potentially stale/corrupt serialized totals.
    const total = readings.reduce(
      (sum, r) => sum + r.cells.reduce((subtotal, c) => subtotal + c.households * c[key], 0),
      0
    );
    if (
      expected === undefined ||
      !Number.isFinite(expected) ||
      expected < 0 ||
      !Number.isFinite(total) ||
      total < 0 ||
      Math.abs(expected - total) > Math.max(1, expected) * 1e-9
    )
      gaps.add("unreconciled-resources");
  }
  return [...gaps];
}

/** The existing value is returned unchanged, including its measurement dates. */
export function resolveHouseholdCountry<T>(input: {
  existing: T;
  coverage: HouseholdCountryCoverage;
  readings: readonly HouseholdResourceReading[];
}):
  | { path: "existing"; value: T; gaps: readonly HouseholdCoverageGap[] }
  | {
      path: "household-resources";
      value: ReturnType<typeof householdResourceOutcomes>;
      gaps: readonly [];
    } {
  const gaps = householdCoverageGaps(input.coverage, input.readings);
  if (gaps.length) return { path: "existing", value: input.existing, gaps };
  // Validated coverage is a necessary condition, not permission to suppress
  // corruption inside an otherwise complete owner reading.
  return {
    path: "household-resources",
    value: householdResourceOutcomes(input.readings),
    gaps: [],
  };
}
