/**
 * Compliance gate: how strongly an NPP responds to whips. Loyalty pulls it up,
 * stubbornness pulls it down. Pure, so docs and charts share the weights.
 */
export const COMPLIANCE_LOYALTY_WEIGHT = 0.7;
export const COMPLIANCE_PLIABILITY_WEIGHT = 0.3;

/** Compliance from loyalty and stubbornness, each on the 0 to 100 personality scale. */
export function complianceFromPersonality(loyalty: number, stubbornness: number): number {
  return (
    (loyalty / 100) * COMPLIANCE_LOYALTY_WEIGHT +
    (1 - stubbornness / 100) * COMPLIANCE_PLIABILITY_WEIGHT
  );
}
