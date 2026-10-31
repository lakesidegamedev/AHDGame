/** Funded family policy moves the fertility input, not yesterday's realized births. */
import { POLICY_DRIFT_RATE_PER_TURN } from "./policyDrift";
import { birthRateIndexToTFR } from "@/lib/demographics/flows/fertility";
import { tfrToBirthRateIndex } from "./fertilityOpening";

/** Game calibration, not an empirical causal estimate. Negative pressure keeps its existing bound. */
export const FERTILITY_POLICY_MAX_BOOST = 0.4;
const FERTILITY_POLICY_MAX_REDUCTION = 0.24;
const MAX_POLICY_PRESSURE = 1.2;

export function fertilityPolicyIndex(
  opening: number,
  prior: number | undefined,
  pressure: number,
  replacementTfr = 2.06,
  maxBoost = FERTILITY_POLICY_MAX_BOOST
): number {
  if (
    ![opening, prior ?? opening, pressure, replacementTfr, maxBoost].every(Number.isFinite) ||
    maxBoost < 0 ||
    replacementTfr <= 0 ||
    opening < 0 ||
    opening > 100 ||
    (prior ?? opening) < 0 ||
    (prior ?? opening) > 100
  )
    throw new Error("Invalid fertility policy input");
  const targetTfr = Math.max(
    0.4 * replacementTfr,
    Math.min(
      3.4 * replacementTfr,
      birthRateIndexToTFR(opening, replacementTfr) +
        (Math.max(-MAX_POLICY_PRESSURE, Math.min(MAX_POLICY_PRESSURE, pressure)) /
          MAX_POLICY_PRESSURE) *
          (pressure < 0 ? FERTILITY_POLICY_MAX_REDUCTION : maxBoost)
    )
  );
  const target = tfrToBirthRateIndex(targetTfr, replacementTfr);
  return (prior ?? opening) + (target - (prior ?? opening)) * POLICY_DRIFT_RATE_PER_TURN;
}
