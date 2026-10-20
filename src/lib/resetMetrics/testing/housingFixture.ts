import { householdFixture } from "./householdFixture";
import type { HousingPublicationSource } from "../rules/housingPublication";
import { HOUSING_REFERENCE_INPUTS } from "../rules/housingPublication";

/** Controlled source fixture only; never a production initialization fallback. */
export function housingFixture(country: "US" | "UK" | "JP" = "UK", turn = 2) {
  const fixture = householdFixture(country, turn);
  fixture.source.programRoles = [
    ...fixture.source.programRoles,
    { programId: "capital-law", familyId: "L22", effectiveTurn: 1, role: "capital" },
    { programId: "assistance-law", familyId: "L23", effectiveTurn: 1, role: "service" },
  ];
  const housing: HousingPublicationSource = {
    worldId: "test-world",
    countryId: country,
    currency: country,
    measurementTurn: turn,
    references: Object.fromEntries(
      HOUSING_REFERENCE_INPUTS.map((key) => [
        key,
        { basis: "reference", sourceId: `test-reference:${key}` },
      ])
    ),
    privateFinance: {
      sourceId: "test-private-finance",
      worldId: "test-world",
      countryId: country,
      currency: country,
      turn,
      amount: 0,
    },
    programRoles: [
      { programId: "cash-law", familyId: "L01", effectiveTurn: 1, role: "other" },
      {
        programId: "capital-law",
        familyId: "L22",
        effectiveTurn: 1,
        role: "construction",
        share: 1,
      },
      {
        programId: "assistance-law",
        familyId: "L23",
        effectiveTurn: 1,
        role: "landlord-assistance",
        share: 1,
      },
    ],
    regions: fixture.regions.map((b) => ({
      regionId: b.regionId!,
      openingState: {
        worldId: "test-world",
        countryId: country,
        regionId: b.regionId!,
        asOfTurn: turn - 1,
        usableDwellings: 100,
        occupiedDwellings: 95,
        unhousedPeople: 10,
        constructionCash: 0,
        pipeline: [{ id: "existing-build", dwellings: 10, earliestCompletionTurn: turn }],
      },
      flow: {
        turn,
        population: 400,
        constructionCashReceived: 100,
        costPerCompletedDwelling: 10,
        materialCapacity: 10,
        laborCapacity: 10,
        financeCapacity: 10,
        planningCapacity: 10,
        newProjects: [],
        dwellingsLost: 0,
        occupiedDwellingsLost: 0,
        displacedPeople: 0,
        vacatedDwellings: 0,
        otherNewOccupancies: 0,
        newlyUnhousedPeople: 0,
        rehousingHouseholds: 5,
        peoplePerRehousing: 2,
      },
      payments: [
        { groupId: "low", annualPayments: 80, annualLandlordAssistance: 48 },
        { groupId: "middle", annualPayments: 20, annualLandlordAssistance: 0 },
        { groupId: "high", annualPayments: 40, annualLandlordAssistance: 0 },
      ],
    })),
  };
  return {
    ...fixture,
    housing,
    national: { ...fixture.national, householdSource: fixture.source, housingSource: housing },
  };
}
