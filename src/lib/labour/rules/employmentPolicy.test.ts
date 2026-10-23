import { describe, expect, it } from "vitest";
import { resolveEmploymentPolicy, type EmploymentLaw } from "./employmentPolicy";

const law = (extra: Partial<EmploymentLaw> = {}): EmploymentLaw => ({
  id: "example_training",
  title: "Vocational Training",
  targets: ["education.workforceSkill"],
  strength: 1,
  delivery: 1,
  enactedTurn: 10,
  ...extra,
});

describe("existing legislative employment channels", () => {
  it("accounts for already-passed laws, enactment lag, funding and repeal", () => {
    expect(resolveEmploymentPolicy([law()], 9, 48).matching).toBe(0);
    expect(resolveEmploymentPolicy([law()], 10, 48).matching).toBe(0);
    expect(resolveEmploymentPolicy([law()], 24, 48).matching).toBe(1);
    expect(resolveEmploymentPolicy([law({ delivery: 0.75 })], 24, 48).matching).toBe(0.5);
    expect(resolveEmploymentPolicy([law({ strength: 0 })], 24, 48).matching).toBe(0);
  });

  it("recognizes either catalog and bounds repeated matching provisions", () => {
    const modern = law({
      id: "uk.education.adultSkills.primary",
      targets: ["education.adultSkills"],
    });
    const legacy = law({
      id: "jp_regional_skills",
      title: "Regional Skills and Vocational Training Act",
      targets: ["economic.unemploymentRate"],
    });
    expect(resolveEmploymentPolicy([modern, legacy, modern], 48, 48).matching).toBe(1);
  });

  it("does not award childcare participation twice when an existing effect already owns it", () => {
    const childcare = law({
      id: "childcare",
      title: "Childcare Support",
      targets: ["economic.laborParticipation"],
    });
    expect(resolveEmploymentPolicy([childcare], 48, 48).participationBonus).toBe(0);
    expect(
      resolveEmploymentPolicy([{ ...childcare, targets: ["society.familyStability"] }], 48, 48)
        .participationBonus
    ).toBe(2);
  });

  it("prices jobs guarantees from delivered payroll without multiplying the option cost twice", () => {
    const jobs = law({
      optionTitle: "Universal Jobs Guarantee",
      annualCost: 1_000_000,
      strength: 0.5,
      delivery: 0.5,
    });
    expect(resolveEmploymentPolicy([jobs], 48, 48).publicEmploymentAnnual).toBe(300_000);
    expect(
      resolveEmploymentPolicy([law({ ...jobs, delivery: 0 })], 48, 48).publicEmploymentAnnual
    ).toBe(0);
  });
});
