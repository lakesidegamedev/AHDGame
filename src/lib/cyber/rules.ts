/**
 * Cyber resilience: how well a country's essential services hold up under attack, as a
 * single 0..1 score.
 *
 * Three inputs, all plain data:
 * - the cyber resilience mandate option in force (the law that books the cyber agency's
 *   cost to the security budget line, so the mandate IS the cyber spending line);
 * - technology readiness, from research and development intensity (percent of GDP);
 * - the state of the utilities, from the political board's utilities score (0..100).
 *
 * Pure: the turn shell loads the documents and passes the numbers in.
 */

/**
 * Score bonus per mandate option, by ladder index. Index 3 is "No Mandate", the seeded
 * neutral. The left side imposes duties and costs money; the right side withdraws duties
 * and leaves operators exposed.
 */
export const CYBER_MANDATE_BONUS: readonly number[] = [0.3, 0.2, 0.1, 0, 0.03, -0.04, -0.08];

/** Ladder index of the neutral "No Mandate" option. */
export const CYBER_MANDATE_NEUTRAL_INDEX = 3;

/** R&D intensity (percent of GDP) at which technology readiness tops out. */
export const RD_INTENSITY_FOR_FULL_READINESS = 4;

/** Score a country starts from before any input. */
const BASE_SCORE = 0.15;
/** Weight of technology readiness (0..1). */
const TECH_WEIGHT = 0.35;
/** Weight of the utilities board score (0..1). */
const UTILITIES_WEIGHT = 0.25;
/** Readiness assumed when a country records no R&D intensity. */
const DEFAULT_READINESS = 0.4;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Bonus for a mandate option; an unknown or missing index reads as no mandate. */
export function cyberMandateBonus(optionIndex: number | null | undefined): number {
  if (optionIndex == null || !Number.isInteger(optionIndex)) return 0;
  return CYBER_MANDATE_BONUS[optionIndex] ?? 0;
}

/** Technology readiness 0..1 from R&D intensity in percent of GDP. */
export function technologyReadiness(rdIntensity: number | null | undefined): number {
  if (rdIntensity == null || !Number.isFinite(rdIntensity)) return DEFAULT_READINESS;
  return clamp01(rdIntensity / RD_INTENSITY_FOR_FULL_READINESS);
}

export interface CyberResilienceInput {
  /** Mean regional utilities board score, 0..100; null when the country has no board. */
  utilities: number | null;
  /** Mean regional R&D intensity, percent of GDP; null when unrecorded. */
  rdIntensity: number | null;
  /** Ladder index of the cyber resilience mandate in force; null when the law is absent. */
  mandateOptionIndex: number | null;
}

/**
 * Cyber resilience 0..1, or null for a country with no regional board (a background
 * country the per-country systems do not model).
 */
export function cyberResilienceScore(input: CyberResilienceInput): number | null {
  if (input.utilities == null || !Number.isFinite(input.utilities)) return null;
  const utilities = clamp01(input.utilities / 100);
  return clamp01(
    BASE_SCORE +
      TECH_WEIGHT * technologyReadiness(input.rdIntensity) +
      UTILITIES_WEIGHT * utilities +
      cyberMandateBonus(input.mandateOptionIndex)
  );
}
