/** Funded family policy moves the fertility input, not yesterday's realized births. */
import { POLICY_DRIFT_RATE_PER_TURN } from "./policyDrift";
import { birthRateIndexToTFR } from "@/lib/demographics/flows/fertility";
import { tfrToBirthRateIndex } from "./fertilityOpening";

/** Conservative game calibration, not an empirical causal estimate: max +/-0.24 children at capped pressure. */
const FERTILITY_CHILDREN_PER_PRESSURE = 0.2;

export function fertilityPolicyIndex(
  opening: number,
  prior: number | undefined,
  pressure: number,
  replacementTfr = 2.06
): number {
  if (
    ![opening, prior ?? opening, pressure, replacementTfr].every(Number.isFinite) ||
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
        Math.max(-1.2, Math.min(1.2, pressure)) * FERTILITY_CHILDREN_PER_PRESSURE
    )
  );
  const target = tfrToBirthRateIndex(targetTfr, replacementTfr);
  return (prior ?? opening) + (target - (prior ?? opening)) * POLICY_DRIFT_RATE_PER_TURN;
}
