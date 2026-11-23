export type FormationType = "majority" | "coalition" | "minority" | "admin" | null | undefined;

export interface GovernmentStandingInput {
  formationType: FormationType;
  seatsSupporting: number;
  threshold: number;
  coalitionPartnerCount?: number;
}

/**
 * A government is a minority government only when the seats behind it fall short
 * of a majority of the full chamber. The formation type records how it was
 * assembled, and can still read "minority" after later support grew past the line.
 */
export function isMinorityGovernment(input: GovernmentStandingInput): boolean {
  return input.seatsSupporting < input.threshold;
}

export function formedGovernmentLabel(input: GovernmentStandingInput): string {
  if (input.formationType === "admin") return "Formed via Admin";
  if (isMinorityGovernment(input)) return "Formed as a minority government";
  const partners = input.coalitionPartnerCount ?? 0;
  if (input.formationType === "coalition" || partners > 1) return "Formed via Coalition";
  return "Formed with a majority";
}
