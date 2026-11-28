import { describe, expect, it } from "vitest";
import { redenominateFederalBudget, redenominateStateBudget } from "./redenominate";

describe("currency redenomination rules", () => {
  it("scales every federal money bucket but not debt rates", () => {
    const converted = redenominateFederalBudget(
      {
        revenue: { incomeTax: 10, total: 10 },
        taxBases: { taxableIncome: 100 },
        spending: { byCategory: { healthcare: 4 }, stateGrants: 2, total: 6 },
        debt: { principal: 50, ceiling: 80, interestRate: 3, ceilingLastRaisedYear: 2027 },
        treasuryBalance: -50,
        surplus: 4,
        gdp: 200,
        baselineSpendingByCategory: { healthcare: 4 },
        baselineStateGrants: 2,
        defenseAppropriation: {
          balance: 20,
          accruedThroughTurn: 17,
          arrearsRatio: 0.25,
          encumbered: 5,
        },
        intelligenceAppropriation: { balance: 8, accruedThroughTurn: 12 },
        militaryPriceBaselineGdp: 200,
      },
      0.1
    );
    expect(converted.revenue.total).toBe(1);
    expect(converted.spending.byCategory.healthcare).toBe(0.4);
    expect(converted.debt.principal).toBe(5);
    expect(converted.debt).toMatchObject({ interestRate: 3, ceilingLastRaisedYear: 2027 });
    expect(converted.defenseAppropriation).toEqual({
      balance: 2,
      accruedThroughTurn: 17,
      arrearsRatio: 0.25,
      encumbered: 0.5,
    });
    expect(converted.intelligenceAppropriation).toEqual({ balance: 0.8, accruedThroughTurn: 12 });
    expect(converted.militaryPriceBaselineGdp).toBe(20);
  });

  it("scales state fiscal money consistently", () => {
    const converted = redenominateStateBudget(
      {
        revenue: { total: 12 },
        taxBases: { taxableIncome: 60 },
        spending: { byCategory: { education: 8 }, total: 8 },
        balance: 4,
        surplus: 4,
        stateGdp: 100,
      },
      0.5
    );
    expect(converted).toMatchObject({ balance: 2, surplus: 2, stateGdp: 50 });
    expect(converted.revenue.total).toBe(6);
  });
});

it("converts funded Treasury and department money while preserving capacity, percentages and replay turns", () => {
  const department = {
    departmentId: "health",
    portfolioId: "health",
    balance: 420,
    encumbered: 84,
    arrears: 42,
    annualAuthority: 4200,
    operatingAuthority: 2100,
    capitalAuthority: 840,
    transferAuthority: 1260,
    accruedThroughTurn: 111,
    programAllocationPercents: { care: 60 },
    capacityPools: {
      care: {
        capacityType: "clinics",
        availableThroughput: 7,
        maintenanceDemand: 3,
        sourceBreakdown: { workforce: 1, facilities: 2, systems: 3, efficiency: 4 },
      },
    },
    programs: {
      care: {
        programId: "care",
        legislationTypeId: "health",
        policyOptionId: "coverage",
        status: "operating" as const,
        annualDemand: 4200,
        periodDemand: 420,
        authorityThisTurn: 210,
        obligated: 84,
        encumbered: 42,
        outlaid: 21,
        cumulativeOutlays: 2100,
        arrears: 4.2,
        fundingRatio: 0.5,
        capacityRatio: 0.7,
        coverageRatio: 0.8,
        rampFactor: 0.9,
        implementationFactor: 0.6,
        bindingConstraint: "funding" as const,
        lastSettledTurn: 111,
      },
    },
  };
  const doc = {
    revenue: { total: 420 },
    taxBases: {},
    spending: { byCategory: {}, total: 210 },
    debt: { principal: 420, interestRate: 5 },
    treasuryBalance: 420,
    treasuryCashLocal: 420,
    surplus: 210,
    gdp: 4200,
    baselineSpendingByCategory: {},
    baselineStateGrants: 0,
    departmentAccounts: { health: department },
    imfSovereignFacilityPrincipalOutstanding: 420,
  };
  const result = redenominateFederalBudget(doc, 0.2);
  expect(result.treasuryCashLocal).toBe(84);
  expect(result.imfSovereignFacilityPrincipalOutstanding).toBe(84);
  const account = result.departmentAccounts!.health;
  expect(account).toMatchObject({
    balance: 84,
    encumbered: 16.8,
    arrears: 8.4,
    accruedThroughTurn: 111,
    annualAuthority: 840,
    operatingAuthority: 420,
    capitalAuthority: 168,
    transferAuthority: 252,
  });
  expect(account.capacityPools).toEqual(department.capacityPools);
  expect(account.programAllocationPercents).toEqual({ care: 60 });
  expect(account.programs.care).toMatchObject({
    annualDemand: 840,
    periodDemand: 84,
    authorityThisTurn: 42,
    obligated: 16.8,
    outlaid: 4.2,
    cumulativeOutlays: 420,
    fundingRatio: 0.5,
    capacityRatio: 0.7,
    lastSettledTurn: 111,
  });
  expect(doc.departmentAccounts.health.balance).toBe(420);
});

it("converts regional financing money without changing interest rates or settlement turns", () => {
  const financing = {
    principal: 420,
    cash: 210,
    annualInterest: 21,
    interestRate: 0.05,
    lastSettledTurn: 111,
    borrowed: 84,
    repaid: 42,
    interestPaid: 4.2,
  };
  const result = redenominateStateBudget(
    {
      revenue: { total: 420 },
      taxBases: {},
      spending: { byCategory: {}, total: 210 },
      balance: 210,
      surplus: 210,
      stateGdp: 4200,
      financing,
    },
    0.2
  );
  expect(result.financing).toEqual({
    principal: 84,
    cash: 42,
    annualInterest: 4.2,
    interestRate: 0.05,
    lastSettledTurn: 111,
    borrowed: 16.8,
    repaid: 8.4,
    interestPaid: 0.8400000000000001,
  });
});
