import { buildOpeningMetricSnapshots1991 } from "../seedOpening1991";
import { HOUSEHOLD_REFERENCE_INPUTS } from "../rules/householdReadiness";
import type { HouseholdPublicationSource } from "../rules/householdPublication";
import type { ResetCountry } from "@/lib/resetLegislation/fundingOwner";

/** Synthetic test evidence only. Never imported by the seed or turn producer. */
export function householdFixture(countryId: ResetCountry = "UK", turn = 2, paidPerRegion = 48) {
  const all = buildOpeningMetricSnapshots1991("test-world", 1);
  const regions = all
    .filter((b) => b.countryId === countryId && b.scope === "regional")
    .slice(0, 2);
  const national = all.find((b) => b.countryId === countryId && b.scope === "national")!;
  const inputs = regions.map((b) => ({
    countryId,
    regionId: b.regionId!,
    currency: countryId,
    measurementTurn: turn,
    priceBaseYear: 1991,
    consumerPriceIndex: 100,
    groups: [
      {
        id: "low",
        households: 1,
        adults: 1,
        children: 0,
        marketIncome: 20,
        paidCashTransfers: paidPerRegion,
        directTaxes: 0,
        employeeContributions: 0,
      },
      {
        id: "middle",
        households: 2,
        adults: 1,
        children: 0,
        marketIncome: 100,
        paidCashTransfers: 0,
        directTaxes: 0,
        employeeContributions: 0,
      },
      {
        id: "high",
        households: 1,
        adults: 1,
        children: 0,
        marketIncome: 200,
        paidCashTransfers: 0,
        directTaxes: 0,
        employeeContributions: 0,
      },
    ],
  }));
  const source: HouseholdPublicationSource = {
    worldId: "test-world",
    inputs,
    programRoles: [
      { programId: "cash-law", familyId: "L01", effectiveTurn: 1, role: "cash", cashShare: 1 },
    ],
    coverage: {
      countryId,
      currency: countryId,
      priceBaseYear: 1991,
      measurementTurn: turn,
      regions: regions.map((b) => ({ regionId: b.regionId!, householdResidents: 4 })),
      references: Object.fromEntries(
        HOUSEHOLD_REFERENCE_INPUTS.map((key) => [
          key,
          { basis: "reference", sourceId: `test-reference:${key}` },
        ])
      ),
      reconciliation: {
        sourceId: "test-fiscal-owner",
        countryId,
        currency: countryId,
        measurementTurn: turn,
        marketIncome: 840,
        paidCashTransfers: 2 * paidPerRegion,
        directTaxes: 0,
        employeeContributions: 0,
      },
    },
  };
  return { countryId, regions, national: { ...national, householdSource: source }, source };
}
