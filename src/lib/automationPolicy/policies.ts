/**
 * Shell for the automation policy rules: reads the automation laws each
 * country has enacted and folds them into a policy per country. One batch read
 * per caller; everything else is in-memory.
 */
import type { Db } from "mongodb";
import type { StatePolicy } from "@/lib/db/types/statePolicy";
import { MODERN_ERA_LEGISLATURE_SPECS } from "@/lib/seeds/shared/modernEraLegislation";
import { legacyOptionLevel } from "@/lib/energyTransition/rules";
import { clampUnionLawBias } from "@/lib/labour/unionLaws";
import {
  AUTOMATION_LAW_SLUGS,
  NO_AUTOMATION_POLICY,
  automationCrewRetention,
  automationLevyInputPenalty,
  automationUnionBias,
  retainedLabourFactor,
  subsidisedWageMultiplier,
  type AutomationPolicy,
} from "./rules";

type PolicyKey = keyof AutomationPolicy;

interface LawRef {
  countryId: string;
  key: PolicyKey;
  legacy: boolean;
}

/** Every automation law id in both books, keyed to the country and policy it sets. */
function automationLawRefs(): Map<string, LawRef> {
  const refs = new Map<string, LawRef>();
  for (const key of Object.keys(AUTOMATION_LAW_SLUGS) as PolicyKey[]) {
    const slugs = AUTOMATION_LAW_SLUGS[key];
    for (const countryId of ["US", "UK"])
      refs.set(`${countryId.toLowerCase()}.sec.${slugs.modern}`, { countryId, key, legacy: false });
    if (!slugs.legacy) continue;
    for (const spec of MODERN_ERA_LEGISLATURE_SPECS)
      refs.set(`${spec.prefix}_${slugs.legacy}`, {
        countryId: spec.prefix.toUpperCase(),
        key,
        legacy: true,
      });
  }
  return refs;
}

const LAW_REFS = automationLawRefs();

/** Plain-data fold of national law records into a policy per country. */
export function foldAutomationPolicies(
  records: ReadonlyArray<Pick<StatePolicy, "legislationTypeId" | "policyOptionIndex" | "scope">>
): Map<string, AutomationPolicy> {
  const byCountry = new Map<string, AutomationPolicy>();
  for (const record of records) {
    if (record.scope === "state") continue;
    const ref = LAW_REFS.get(record.legislationTypeId);
    if (!ref) continue;
    const level = ref.legacy
      ? legacyOptionLevel(record.policyOptionIndex)
      : Math.max(0, Math.min(4, Math.round(record.policyOptionIndex ?? 0)));
    const policy = byCountry.get(ref.countryId) ?? { ...NO_AUTOMATION_POLICY };
    policy[ref.key] = level;
    byCountry.set(ref.countryId, policy);
  }
  return byCountry;
}

/** countryId -> enacted automation law levels. Countries with none are absent. */
export async function loadAutomationPolicies(db: Db): Promise<Map<string, AutomationPolicy>> {
  const records = await db
    .collection<StatePolicy>("statePolicies")
    .find(
      { legislationTypeId: { $in: [...LAW_REFS.keys()] }, scope: { $ne: "state" } },
      { projection: { _id: 0, legislationTypeId: 1, policyOptionIndex: 1, scope: 1 } }
    )
    .toArray();
  return foldAutomationPolicies(records);
}

/** The policy a country's laws set; neutral for a country with none. */
export function automationPolicyFor(
  policyByCountry: ReadonlyMap<string, AutomationPolicy> | undefined,
  countryId: string | null | undefined
): AutomationPolicy {
  return (countryId ? policyByCountry?.get(countryId) : undefined) ?? NO_AUTOMATION_POLICY;
}

/** Crew per unit of capacity after the country's automation laws keep part of the crew. */
export function lawAdjustedLabourFactor(
  factor: number,
  policyByCountry: ReadonlyMap<string, AutomationPolicy> | undefined,
  countryId: string | null | undefined
): number {
  if (!policyByCountry || factor >= 1) return factor;
  return retainedLabourFactor(
    factor,
    automationCrewRetention(automationPolicyFor(policyByCountry, countryId))
  );
}

/** Multiplier on a sector's wage bill from the country's hiring subsidy; 1 with none. */
export function lawWageCostMultiplier(
  policyByCountry: ReadonlyMap<string, AutomationPolicy> | undefined,
  countryId: string | null | undefined
): number {
  if (!policyByCountry) return 1;
  return subsidisedWageMultiplier(automationPolicyFor(policyByCountry, countryId).hiringSubsidy);
}

/**
 * Union law bias per country with the transition compacts added on top of the
 * bias the player-legislated union laws already set. Returns the input map
 * when no country has a compact.
 */
export function withAutomationUnionBias(
  biasByCountry: ReadonlyMap<string, number>,
  policyByCountry: ReadonlyMap<string, AutomationPolicy> | undefined
): Map<string, number> {
  const out = new Map(biasByCountry);
  if (!policyByCountry) return out;
  for (const [countryId, policy] of policyByCountry) {
    const extra = automationUnionBias(policy);
    if (extra === 0) continue;
    out.set(countryId, clampUnionLawBias((out.get(countryId) ?? 0) + extra));
  }
  return out;
}
