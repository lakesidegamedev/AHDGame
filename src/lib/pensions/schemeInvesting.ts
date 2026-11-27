import type { Db } from "mongodb";
import { runStampedPensionSchemeInvestments } from "./schemeInvestingStamped";
export { chooseSchemeFund } from "./rules/chooseSchemeFund";

export interface PensionInvestingResult {
  schemesInvesting: number;
  investedAnchor: number;
  errors: string[];
}

/** Every resilience stage uses frozen investment terms and resumes pending cash first. */
export async function runPensionSchemeInvestments(
  db: Db,
  currentTurn: number
): Promise<PensionInvestingResult> {
  return runStampedPensionSchemeInvestments(db, currentTurn);
}
