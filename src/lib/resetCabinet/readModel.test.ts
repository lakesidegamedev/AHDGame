import { describe, expect, it } from "vitest";
import { DEPARTMENT_DEFINITIONS } from "@/lib/governmentFinance/departmentCatalog";
import type { ResetDepartmentAccountSnapshot } from "@/lib/resetFinance/rules/liveDepartmentAccount";
import { buildResetDepartmentFinanceReadModel } from "./readModel";

const definition = DEPARTMENT_DEFINITIONS.find((entry) => entry.id === "us_health_department")!;
const account = {
  _id: "US:us_health_department",
  countryId: "US",
  departmentId: definition.id,
  annualAuthority: 300,
  balance: 20,
  encumbered: 5,
  arrears: 0,
  unpaidAuthority: 35,
  lastAuthorityPaid: 10,
  externallySettled: false,
  familyAnnualDemand: { L18: 100, L19: 200 },
  programAllocationPercents: { L18: 50, L19: 150 },
  lastProgramDelivery: { L18: { requested: 2, outlaid: 1, implementationFactor: 0.5 } },
  accruedThroughTurn: 12,
  lastAllocationChangedTurn: 12,
} as unknown as ResetDepartmentAccountSnapshot;

describe("v2 Cabinet finance read model", () => {
  it("shows reconciled authority and independent family requests", () => {
    const model = buildResetDepartmentFinanceReadModel({
      definition,
      departmentName: "Health and Human Services",
      account,
    });
    expect(model).toMatchObject({
      allocationMode: "demand",
      annualAuthority: 300,
      availableBalance: 15,
      lastAllocationChangedTurn: 12,
      unpaidAuthority: 35,
      lastAuthorityPaid: 10,
    });
    expect(model.programs.map((program) => program.allocationPercent)).toEqual([50, 150]);
    expect(model.programs[0]).toMatchObject({ outlaid: 1, lastSettledTurn: 12 });
    expect(model.programs[1]?.outlaid).toBeUndefined();
    expect(
      model.programs.every((program) => program.explanation.includes("does not change enacted law"))
    ).toBe(true);
  });

  it("does not offer ordinary requests for a specialized account", () => {
    const model = buildResetDepartmentFinanceReadModel({
      definition,
      departmentName: "Health and Human Services",
      account: { ...account, externallySettled: true },
    });
    expect(model.programs).toEqual([]);
    expect(model.unpaidAuthority).toBeUndefined();
  });

  it("points an unfunded intelligence account at its funding law instead of a row of zeros", () => {
    const model = buildResetDepartmentFinanceReadModel({
      definition: { ...definition, kind: "security_agency", accountPolicyId: "intelligence" },
      departmentName: "Security Intelligence Service",
      account: {
        ...account,
        externallySettled: true,
        annualAuthority: 0,
        balance: 0,
        encumbered: 0,
        arrears: 0,
      },
    });
    expect(model.explanation).toContain("intelligence funding law");
    expect(model.explanation).toContain("Intelligence tab");
    expect(model.balance).toBeUndefined();
    expect(model.annualAuthority).toBeUndefined();
  });

  it("names Canada's intelligence law and the category to file it under", () => {
    const model = buildResetDepartmentFinanceReadModel({
      definition: {
        ...definition,
        countryId: "CA",
        kind: "security_agency",
        accountPolicyId: "intelligence",
      },
      departmentName: "Security Intelligence Service",
      account: { ...account, externallySettled: true, annualAuthority: 0, balance: 0 },
    });
    expect(model.explanation).toContain("National Security Intelligence Fund Act");
    expect(model.explanation).toContain("Defense category");
  });

  it("keeps the defence opening claim visible with a plain explanation", () => {
    const model = buildResetDepartmentFinanceReadModel({
      definition: { ...definition, accountPolicyId: "defense" },
      departmentName: "National Defence",
      account: { ...account, externallySettled: true, annualAuthority: 500, balance: 0 },
    });
    expect(model.explanation).toContain("defence budget");
    expect(model.annualAuthority).toBe(500);
    expect(model.balance).toBe(0);
  });

  it("shows opening families that have legal programs but no separate appropriation", () => {
    const model = buildResetDepartmentFinanceReadModel({
      definition,
      departmentName: "Health and Human Services",
      account: {
        ...account,
        familyAnnualDemand: { L16: 0, L18: 100, L19: 0 },
      },
    });

    expect(model.programs.map((program) => program.programId)).toEqual(["L16", "L18", "L19"]);
    expect(model.programs.map((program) => program.annualDemand)).toEqual([0, 100, 0]);
    expect(model.programs.map((program) => program.fundingControl)).toEqual([
      "no_separate_allocation",
      "adjustable",
      "no_separate_allocation",
    ]);
  });

  it("presents audited opening obligations as fixed at 100%", () => {
    const model = buildResetDepartmentFinanceReadModel({
      definition,
      departmentName: "Health and Human Services",
      account: {
        ...account,
        familyAnnualDemand: { L16: 100, L18: 200 },
        programAllocationPercents: { L16: 25, L18: 150 },
      },
    });

    expect(model.programs[0]).toMatchObject({
      programId: "L16",
      fundingControl: "required",
      allocationPercent: 100,
    });
    expect(model.programs[1]).toMatchObject({
      programId: "L18",
      fundingControl: "adjustable",
      allocationPercent: 150,
    });
  });

  it("keeps unfunded opening programs and omits one after its law moves away", () => {
    const model = buildResetDepartmentFinanceReadModel({
      definition,
      departmentName: "Health and Human Services",
      account: {
        ...account,
        annualAuthority: 200,
        familyAnnualDemand: { L18: 0, L19: 200 },
      },
      currentPrograms: [
        {
          country: "US",
          scope: "national",
          familyId: "L18",
          choice: "leave_to_states",
          fundingAccountId: account._id,
        },
      ],
    });

    expect(model.programs.map((program) => program.programId)).toEqual(["L19"]);
  });

  it("still flags a missing account for a department that owns laws", () => {
    const model = buildResetDepartmentFinanceReadModel({
      definition,
      departmentName: "Health and Human Services",
    });
    expect(model.explanation).toContain("no verified v2 account");
  });
});
