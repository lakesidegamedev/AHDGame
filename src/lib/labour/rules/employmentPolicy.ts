/**
 * Employment policy reuses enacted training, transport, childcare and job programs.
 * resolveEmploymentPolicy applies actual delivery and an enactment ramp to
 * existing law levels, with bounded support rather than stacking free jobs.
 */
import { EMPTY_EMPLOYMENT_POLICY, type EmploymentPolicy } from "./employment";

export interface EmploymentLaw {
  id: string;
  title: string;
  /** Full paths, either political families or legacy metric targets. */
  targets: readonly string[];
  strength: number;
  baselineStrength?: number;
  weights?: { matching?: number; transport?: number };
  delivery: number;
  enactedTurn?: number;
  optionTitle?: string;
  annualCost?: number;
}

const bounded = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function employmentOptionStrength(index: number, count: number, ascending: boolean): number {
  if (!Number.isInteger(index) || count < 2 || index < 0 || index >= count) return 0;
  return ascending ? index / (count - 1) : 1 - index / (count - 1);
}

export function employmentProgramShare(
  population: number | undefined,
  countryPopulation: number
): number {
  return population !== undefined && Number.isFinite(population) && countryPopulation > 0
    ? bounded(population / countryPopulation)
    : 0;
}

export function employmentLawChannels(
  law: Pick<EmploymentLaw, "id" | "title" | "targets" | "optionTitle">
): {
  matching: boolean;
  transport: boolean;
  childcare: boolean;
  publicEmployment: boolean;
} {
  const text = `${law.id} ${law.title}`.toLowerCase();
  return {
    matching:
      law.targets.some((path) =>
        /education\.(adultSkills|workforceSkill|apprenticeshipRate)$/.test(path)
      ) || /workforce|vocational|retraining|employment.service|job.?matching/.test(text),
    transport: law.targets.some((path) =>
      /infrastructure\.(mobility|transportEfficiency|publicTransitCoverage|publicTransit|transit|highways)$/.test(
        path
      )
    ),
    childcare: /childcare|child.care|nursery/.test(text),
    publicEmployment: /jobs? guarantee|guaranteed employment|public employment/.test(
      `${text} ${law.optionTitle?.toLowerCase() ?? ""}`
    ),
  };
}

export function resolveEmploymentPolicy(
  laws: readonly EmploymentLaw[],
  turn: number,
  turnsPerYear: number
): EmploymentPolicy {
  const out = { ...EMPTY_EMPLOYMENT_POLICY };
  // The caller supplies the latest record for each jurisdiction/law, so a
  // national program is never multiplied by the number of recipient regions.
  for (const law of laws) {
    if (law.enactedTurn !== undefined && law.enactedTurn > turn) continue;
    const ramp =
      law.enactedTurn === undefined
        ? 1
        : bounded((turn - law.enactedTurn + 1) / Math.max(1, turnsPerYear / 4));
    const delivered = bounded(law.strength) * bounded(law.delivery) * ramp;
    // Structural unemployment already includes ordinary institutions. Count
    // improvements above moderate provision rather than awarding that baseline
    // support again when an existing world enables this employment model.
    const reference = bounded(law.baselineStrength ?? 0.5);
    const strength = reference < 1 ? bounded((delivered - reference) / (1 - reference)) : 0;
    const channels = employmentLawChannels(law);
    if (channels.matching)
      out.matching = Math.max(out.matching, strength * bounded(law.weights?.matching ?? 1));
    if (channels.transport)
      out.transport = Math.max(out.transport, strength * bounded(law.weights?.transport ?? 1));
    if (channels.childcare) out.childcare = Math.max(out.childcare, strength);
    if (channels.childcare && !law.targets.includes("economic.laborParticipation")) {
      out.participationBonus = Math.max(out.participationBonus, 2 * strength);
    }
    if (channels.publicEmployment && law.strength > 0 && Number.isFinite(law.annualCost)) {
      // The enacted cost already prices the selected level. Do not scale that
      // appropriation by its option strength a second time. Reserve 40% for
      // administration, materials and support rather than assuming all buys jobs.
      out.publicEmploymentAnnual +=
        Math.max(0, law.annualCost ?? 0) * bounded(law.delivery) * ramp * 0.6;
    }
  }
  return out;
}
