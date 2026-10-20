/**
 * Household country adapters preserve source units, geography and population.
 * adaptHouseholdCountry converts reviewed current inputs to the shared owner;
 * incomplete or historical-only extracts keep the country on legacy calculations.
 */
import { householdCoverageGaps, type HouseholdCountryCoverage } from "./householdReadiness";
import { resolveHouseholdResources, type HouseholdResourceGroup } from "./householdResources";
import type { HouseholdPublicationSource } from "./householdPublication";

export const HOUSEHOLD_COUNTRY_PROFILES = {
  US: {
    currency: "USD",
    sourceId: "cps-asec-1992-income-1991",
    sourceYear: 1991,
    url: "https://data.nber.org/cps/cpsmar92.zip",
    limitations: ["signed-income-and-tax-unit-review", "current-owner-reconciliation"],
  },
  UK: {
    currency: "GBP",
    sourceId: "ons-effects-taxes-benefits-1991",
    sourceYear: 1991,
    url: "https://www.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/incomeandwealth/datasets/theeffectsoftaxesandbenefitsonhouseholdincomehistoricaldatasets",
    limitations: ["national-marginals-not-regional-joint-distribution", "modified-oecd-scale"],
  },
  JP: {
    currency: "JPY",
    sourceId: "nsfie-1989-regional-tenure",
    sourceYear: 1989,
    url: "https://www.e-stat.go.jp/dbview?sid=0000110274",
    limitations: ["population-and-cross-table-reconciliation", "current-owner-reconciliation"],
  },
} as const;

export type HouseholdAdapterCountry = keyof typeof HOUSEHOLD_COUNTRY_PROFILES;
type ResourceFlow = "marketIncome" | "paidCashTransfers" | "directTaxes" | "employeeContributions";
interface MoneyScale {
  period: "annual" | "monthly";
  moneyUnit: "currency" | "thousands";
}

export interface HouseholdAdapterExtract {
  countryId: HouseholdAdapterCountry;
  sourceId: string;
  /** Survey vintage is not the date of a current model measurement. */
  incomeYear: number;
  priceBaseYear: number;
  currency: string;
  period: "annual" | "monthly";
  moneyUnit: "currency" | "thousands";
  /** Public Japanese tables mix annual thousand-yen income with monthly yen items. */
  flowUnits?: Partial<Record<ResourceFlow, MoneyScale>>;
  weightDivisor: number;
  population: "all-household-residents" | "workers-only" | "multi-person-only";
  distribution: "joint-household-groups" | "marginal-means";
  composition: "integer-counts" | "group-averages";
  equivalisation: "unequivalised" | "modified-oecd";
  /** Historical reference records cannot masquerade as this turn's paid resources. */
  currentOwner?: { sourceId: string; worldId: string; measurementTurn: number };
  /** A source area may belong to exactly one game region; no proportional splitting. */
  geography: readonly { sourceArea: string; regionId: string }[];
  regions: readonly { sourceArea: string; consumerPriceIndex: number }[];
  rows: readonly (HouseholdResourceGroup & { sourceArea: string })[];
}

export type HouseholdAdapterGap =
  | "unsupported-country"
  | "invalid-source"
  | "future-vintage"
  | "currency-mismatch"
  | "incomplete-population"
  | "marginal-distribution"
  | "averaged-composition"
  | "incompatible-equivalisation"
  | "historical-only"
  | "incomplete-geography"
  | "invalid-units"
  | "invalid-resource-record"
  | "incomplete-reference-or-controls";

export interface HouseholdCountryAdapterInput {
  countryId: string;
  worldId: string;
  turn: number;
  year: number;
  extract: HouseholdAdapterExtract | undefined;
  /** Independent roster and fiscal controls, not totals manufactured from these rows. */
  coverage: HouseholdCountryCoverage;
  programRoles: HouseholdPublicationSource["programRoles"];
}

export type HouseholdCountryAdapterResult =
  | { path: "legacy"; gaps: HouseholdAdapterGap[] }
  | { path: "prepared"; gaps: []; source: HouseholdPublicationSource };

/** Preparation does not activate publication or pay cash; law settlements are checked by the owner. */
export function adaptHouseholdCountry(
  input: HouseholdCountryAdapterInput
): HouseholdCountryAdapterResult {
  const gaps = new Set<HouseholdAdapterGap>();
  if (!Object.hasOwn(HOUSEHOLD_COUNTRY_PROFILES, input.countryId))
    return { path: "legacy", gaps: ["unsupported-country"] };
  const profile = HOUSEHOLD_COUNTRY_PROFILES[input.countryId as HouseholdAdapterCountry];
  const extract = input.extract;
  if (!extract) return { path: "legacy", gaps: ["invalid-source"] };
  if (
    extract.countryId !== input.countryId ||
    !extract.sourceId.trim() ||
    !input.worldId.trim() ||
    !Number.isSafeInteger(input.turn) ||
    input.turn < 1 ||
    !Number.isSafeInteger(input.year) ||
    !Number.isSafeInteger(extract.incomeYear) ||
    extract.incomeYear < 1
  )
    gaps.add("invalid-source");
  if (extract.incomeYear > input.year) gaps.add("future-vintage");
  if (extract.currency !== profile.currency || input.coverage.currency !== profile.currency)
    gaps.add("currency-mismatch");
  if (extract.population !== "all-household-residents") gaps.add("incomplete-population");
  if (extract.distribution !== "joint-household-groups") gaps.add("marginal-distribution");
  if (extract.composition !== "integer-counts") gaps.add("averaged-composition");
  if (extract.equivalisation !== "unequivalised") gaps.add("incompatible-equivalisation");
  if (
    !extract.currentOwner?.sourceId.trim() ||
    extract.currentOwner.worldId !== input.worldId ||
    extract.currentOwner.measurementTurn !== input.turn
  )
    gaps.add("historical-only");
  if (
    !Number.isFinite(extract.weightDivisor) ||
    extract.weightDivisor <= 0 ||
    !["annual", "monthly"].includes(extract.period) ||
    !["currency", "thousands"].includes(extract.moneyUnit) ||
    Object.values(extract.flowUnits ?? {}).some(
      (scale) =>
        !scale ||
        !["annual", "monthly"].includes(scale.period) ||
        !["currency", "thousands"].includes(scale.moneyUnit)
    )
  )
    gaps.add("invalid-units");
  const geography = new Map(extract.geography.map((g) => [g.sourceArea, g.regionId]));
  const prices = new Map(extract.regions.map((r) => [r.sourceArea, r.consumerPriceIndex]));
  const roster = new Set(input.coverage.regions.map((r) => r.regionId));
  if (
    !geography.size ||
    geography.size !== extract.geography.length ||
    prices.size !== extract.regions.length ||
    prices.size !== geography.size ||
    [...geography].some(([area, region]) => !area || !roster.has(region) || !prices.has(area)) ||
    new Set(geography.values()).size !== roster.size ||
    extract.rows.some((r) => !geography.has(r.sourceArea)) ||
    [...geography.keys()].some((area) => !extract.rows.some((r) => r.sourceArea === area))
  )
    gaps.add("incomplete-geography");
  if (
    input.coverage.countryId !== input.countryId ||
    input.coverage.measurementTurn !== input.turn ||
    extract.priceBaseYear !== input.coverage.priceBaseYear
  )
    gaps.add("incomplete-reference-or-controls");
  if (gaps.size) return { path: "legacy", gaps: [...gaps] };

  const annualFactor = (key: ResourceFlow) => {
    const scale = extract.flowUnits?.[key] ?? extract;
    return (scale.period === "monthly" ? 12 : 1) * (scale.moneyUnit === "thousands" ? 1000 : 1);
  };
  const inputs: HouseholdPublicationSource["inputs"][number][] = [];
  // Multiple whole source areas may pool into one game region, but cannot split.
  for (const region of input.coverage.regions) {
    const areas = [...geography].filter(([, id]) => id === region.regionId).map(([area]) => area);
    const basket = prices.get(areas[0]!)!;
    if (areas.some((area) => prices.get(area) !== basket))
      return { path: "legacy", gaps: ["incomplete-reference-or-controls"] };
    const groups = extract.rows
      .filter((r) => areas.includes(r.sourceArea))
      .map((row) => ({
        // JSON tuple avoids collisions in area/id concatenation. Do not copy
        // unrelated extract columns into the publication source.
        id: JSON.stringify([row.sourceArea, row.id]),
        adults: row.adults,
        children: row.children,
        households: row.households / extract.weightDivisor,
        marketIncome: row.marketIncome * annualFactor("marketIncome"),
        paidCashTransfers: row.paidCashTransfers * annualFactor("paidCashTransfers"),
        directTaxes: row.directTaxes * annualFactor("directTaxes"),
        employeeContributions: row.employeeContributions * annualFactor("employeeContributions"),
      }));
    inputs.push({
      countryId: input.countryId,
      regionId: region.regionId,
      currency: profile.currency,
      priceBaseYear: input.coverage.priceBaseYear,
      measurementTurn: input.turn,
      consumerPriceIndex: basket,
      groups,
    });
  }
  // Invalid financial values are not missing zeroes. Never drop or clamp a record.
  let readings;
  try {
    readings = inputs.map(resolveHouseholdResources);
  } catch {
    return { path: "legacy", gaps: ["invalid-resource-record"] };
  }
  if (householdCoverageGaps(input.coverage, readings).length)
    return { path: "legacy", gaps: ["incomplete-reference-or-controls"] };
  return {
    path: "prepared",
    gaps: [],
    source: {
      worldId: input.worldId,
      coverage: input.coverage,
      programRoles: input.programRoles,
      inputs,
    },
  };
}
