import type { Db } from "mongodb";
import { REDISTRICT_AUTHORITY_LAW } from "./caps";
import { statePoliciesCollection } from "@/lib/db/repositories/statePolicies";

/** Independent-commission authority option index (auto-neutralizes at census). */
const INDEPENDENT_COMMISSION_INDEX = 0;

export async function getAutoNeutralizeStateIds(db: Db, _countryId: string): Promise<string[]> {
  const policies = (await statePoliciesCollection<{ stateId: string; policyOptionIndex?: number }>(
    db
  )
    .find({ legislationTypeId: REDISTRICT_AUTHORITY_LAW })
    .toArray()) as { stateId: string; policyOptionIndex?: number }[];
  return policies
    .filter((p) => (p.policyOptionIndex ?? 1) === INDEPENDENT_COMMISSION_INDEX)
    .map((p) => p.stateId);
}
