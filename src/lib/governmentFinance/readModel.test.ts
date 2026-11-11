import { describe, expect, it } from "vitest";
import { createEmptyUsHealthDepartmentAccount } from "./departments";
import { getProjectedPoliticalLegislationTypes } from "@/lib/admin/seed/seedPoliticalLegislation";
import { DEPARTMENT_DEFINITIONS } from "./departmentCatalog";
import { buildDepartmentFinanceReadModel } from "./readModel";

describe("buildDepartmentFinanceReadModel", () => {
  it("explains an institution-owned account and all settled programs", () => {
    const account = createEmptyUsHealthDepartmentAccount();
    account.balance = 120;
    account.encumbered = 20;
    account.arrears = 5;
    account.programs.us_public_health_workforce = {
      programId: "us_public_health_workforce",
      legislationTypeId: "us.health.prevention.primary",
      policyOptionId: "l4",
      status: "operating",
      annualDemand: 9_300,
      periodDemand: 194,
      authorityThisTurn: 146,
      obligated: 100,
      encumbered: 20,
      outlaid: 80,
      cumulativeOutlays: 800,
      arrears: 0,
      fundingRatio: 0.75,
      capacityRatio: 0.8,
      coverageRatio: 1,
      rampFactor: 0.5,
      implementationFactor: 0.3,
      bindingConstraint: "ramp",
      lastSettledTurn: 4,
    };
    const definition = DEPARTMENT_DEFINITIONS.find(
      (candidate) => candidate.id === "us_health_department"
    )!;
    const model = buildDepartmentFinanceReadModel({
      enabled: true,
      definition,
      departmentName: definition.canonicalName,
      account,
      legislationTypes: getProjectedPoliticalLegislationTypes(),
    });
    expect(model).toMatchObject({
      departmentId: "us_health_department",
      balance: 120,
      availableBalance: 100,
      encumbered: 20,
      arrears: 5,
      programs: [
        {
          programName: "Total Prevention System",
          ratios: { funding: 0.75, capacity: 0.8, implementation: 0.3 },
          outcome: { label: "Public Health Preparedness", deliveredShare: 0.3 },
        },
      ],
    });
  });

  it("shows capacity authored through the generalized capacity-demand map", () => {
    const account = createEmptyUsHealthDepartmentAccount();
    account.capacityPools.generalized_capacity = {
      capacityType: "generalized_capacity",
      availableThroughput: 80,
      maintenanceDemand: 5,
      sourceBreakdown: { workforce: 40, facilities: 20, systems: 15, efficiency: 5 },
    };
    account.programs.generalized_program = {
      programId: "generalized_program",
      legislationTypeId: "generalized_law",
      policyOptionId: "generalized_option",
      status: "operating",
      annualDemand: 100,
      periodDemand: 2,
      authorityThisTurn: 2,
      obligated: 2,
      outlaid: 2,
      arrears: 0,
      fundingRatio: 1,
      capacityRatio: 0.8,
      coverageRatio: 1,
      rampFactor: 1,
      implementationFactor: 0.8,
      bindingConstraint: "capacity",
      lastSettledTurn: 4,
    };
    const definition = DEPARTMENT_DEFINITIONS.find(
      (candidate) => candidate.id === "us_health_department"
    )!;
    const model = buildDepartmentFinanceReadModel({
      enabled: true,
      definition,
      departmentName: definition.canonicalName,
      account,
      legislationTypes: [
        {
          _id: "generalized_law",
          name: "Generalized law",
          description: "Fixture",
          policyDomain: "healthcare",
          subCategory: "Fixture",
          positions: [],
          policyOptions: [
            {
              id: "generalized_option",
              name: "Generalized option",
              stance: "center",
              effectDirection: 0,
              economic: 0,
              social: 0,
              implementation: {
                programId: "generalized_program",
                fundingSemantics: "appropriation_included",
                appropriationClass: "operating",
                obligationPriority: 5,
                capacityDemand: { generalized_capacity: 100 },
              },
            },
          ],
        },
      ],
    });

    expect(model.programs[0]?.capacity).toMatchObject({
      availableThroughput: 80,
      maintenanceDemand: 5,
    });
  });
});
