import { householdFixture } from "./householdFixture";
import {
  HOUSEHOLD_COUNTRY_PROFILES,
  type HouseholdAdapterCountry,
  type HouseholdCountryAdapterInput,
} from "../rules/householdCountryAdapter";

/** Synthetic boundary fixture only, not an acquired survey or production adapter input. */
export function householdAdapterFixture(
  country: HouseholdAdapterCountry = "UK",
  turn = 2
): HouseholdCountryAdapterInput {
  const f = householdFixture(country, turn);
  const currency = HOUSEHOLD_COUNTRY_PROFILES[country].currency;
  return {
    countryId: country,
    worldId: "test-world",
    turn,
    year: 1991,
    coverage: {
      ...f.source.coverage,
      currency,
      reconciliation: { ...f.source.coverage.reconciliation!, currency },
    },
    programRoles: f.source.programRoles,
    extract: {
      countryId: country,
      sourceId: "synthetic-test-only",
      incomeYear: 1991,
      priceBaseYear: 1991,
      currency,
      period: "annual",
      moneyUnit: "currency",
      weightDivisor: 1,
      population: "all-household-residents",
      distribution: "joint-household-groups",
      composition: "integer-counts",
      equivalisation: "unequivalised",
      currentOwner: { sourceId: "test-owner", worldId: "test-world", measurementTurn: turn },
      geography: f.source.inputs.map((r) => ({ sourceArea: r.regionId, regionId: r.regionId })),
      regions: f.source.inputs.map((r) => ({ sourceArea: r.regionId, consumerPriceIndex: 100 })),
      rows: f.source.inputs.flatMap((r) => r.groups.map((g) => ({ ...g, sourceArea: r.regionId }))),
    },
  };
}
