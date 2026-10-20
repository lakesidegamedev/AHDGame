import { householdAdapterFixture } from "./householdAdapterFixture";
import type { HouseholdAdapterCountry } from "../rules/householdCountryAdapter";
import type {
  HouseholdCurrentState,
  HouseholdDecodedReference,
  HouseholdFiscalControls,
} from "../rules/householdSources";
import type { MetricLawProgram, MetricLawSettlement } from "../rules/lawDelivery";

/** Synthetic upstream owner records for tests/simulations only, never a reference seed. */
export function householdProducerFixture(country: HouseholdAdapterCountry = "UK", turn = 2) {
  const f = householdAdapterFixture(country, turn),
    extract = f.extract!,
    controls = f.coverage.reconciliation!;
  const reference: HouseholdDecodedReference = {
    version: 1,
    countryId: country,
    sourceId: "fixture-reference",
    incomeYear: 1991,
    currency: extract.currency as "USD" | "GBP" | "JPY",
    population: "all-household-residents",
    distribution: "joint-household-groups",
    gaps: [],
    cells: extract.rows.map((c) => ({
      ...c,
      cashTransfers: c.paidCashTransfers,
      grossIncome: c.marketIncome + c.paidCashTransfers,
    })),
  };
  const current: HouseholdCurrentState = {
    worldId: f.worldId,
    countryId: country,
    currency: extract.currency,
    turn,
    year: 1991,
    priceBaseYear: 1991,
    ownerId: "fixture-economic-owner",
    referenceSourceId: reference.sourceId,
    basketSourceId: "fixture-price-owner",
    regions: f.coverage.regions.map((r) => ({ ...r, consumerPriceIndex: 100 })),
    geography: extract.geography,
    cells: extract.rows.map(
      ({
        id,
        sourceArea,
        households,
        adults,
        children,
        marketIncome,
        directTaxes,
        employeeContributions,
      }) => ({
        id,
        sourceArea,
        households,
        adults,
        children,
        marketIncome,
        directTaxes,
        employeeContributions,
      })
    ),
    programRoles: f.programRoles.map((r) => ({
      ...r,
      recipients: extract.rows.map((c) => ({
        id: c.id,
        sourceArea: c.sourceArea,
        eligibility: c.id === "low" ? 1 : 0,
      })),
    })),
  };
  const fiscalControls: HouseholdFiscalControls = {
    sourceId: "fixture-independent-fiscal-owner",
    worldId: f.worldId,
    countryId: country,
    currency: extract.currency,
    turn,
    population: "all-household-residents",
    basis: "settled-household-flows",
    annualMarketIncome: controls.marketIncome,
    annualDirectTaxes: controls.directTaxes,
    annualEmployeeContributions: controls.employeeContributions,
  };
  const programs: MetricLawProgram[] = [
    {
      _id: "cash-law",
      country,
      scope: "national",
      familyId: "L01",
      fundingAccountId: "account",
      effectiveTurn: 1,
      primaryMetricEffects: [],
    },
  ];
  const settlements = new Map<string, MetricLawSettlement>([
    [
      "cash-law",
      { implementationFactor: 1, lastSettledTurn: turn, outlaid: 2, paymentKey: `payment-${turn}` },
    ],
  ]);
  return {
    ...f,
    reference,
    current,
    fiscalControls,
    programs,
    settlements,
    regionIds: f.coverage.regions.map((r) => r.regionId),
  };
}
