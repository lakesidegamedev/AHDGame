/**
 * Lean pull of enacted regional reset-law programs (bills passed through the
 * newer legislation system). A program moves its region's economic OR social
 * lean, whichever axis the family routes to, toward the enacted far-left to
 * far-right choice. They become synthetic state policies plus a synthetic law
 * type per family, so computeShiftsByTarget keeps its formula unchanged.
 * National programs are not handled here.
 */
import type { DemographicEffect, LegislationType } from "@/lib/db/types/legislation";
import type { ActivePolicy } from "@/lib/policyEffects";
import type { ResetLawProgramDocument } from "./program";
import { V2_POLITICAL_ROUTES, v2VotePosition } from "./rules/politicalPositions";
import { leanAudience, REGIONAL_MAGNITUDE } from "@/lib/countries/jp/data/jpLeanEffects";

/**
 * Route domain to the nearest existing audience table key: welfare uses the
 * "social" economic audience, technology the education one, criminal justice
 * the law_justice social one. Healthcare, education, economic, infrastructure,
 * environment and agriculture match directly; immigration, governance and
 * media fall back to the axis default.
 */
const AUDIENCE_DOMAIN: Readonly<Record<string, string>> = {
  welfare: "social",
  technology: "education",
  criminal_justice: "law_justice",
};

/** Route positions run -5..5; policy scores run -3..3. */
const POSITION_TO_SCORE = 3 / 5;

export function familyLeanTypeId(familyId: string): string {
  return `family:${familyId}`;
}

function leanEffectsForFamily(familyId: string): DemographicEffect[] {
  const route = V2_POLITICAL_ROUTES[familyId];
  if (!route) return [];
  const domain = AUDIENCE_DOMAIN[route.domain] ?? route.domain;
  return leanAudience(route.axis, domain).map(([dim, bucket, direction]) => ({
    dim,
    bucket,
    direction,
    magnitude: REGIONAL_MAGNITUDE,
    target: route.axis === "economic" ? "economicLean" : "socialLean",
    ...(route.axis === "social" ? { strengthAxis: "social" as const } : {}),
  }));
}

export type RegionalLeanProgram = Pick<
  ResetLawProgramDocument,
  "scope" | "regionId" | "familyId" | "choice"
>;

/** Synthetic policies by region id, and the synthetic law types they point at. */
export function regionalFamilyLeanPolicies(programs: readonly RegionalLeanProgram[]): {
  policiesByRegion: Map<string, ActivePolicy[]>;
  types: Map<string, LegislationType>;
} {
  const policiesByRegion = new Map<string, ActivePolicy[]>();
  const types = new Map<string, LegislationType>();
  for (const program of programs) {
    const route = V2_POLITICAL_ROUTES[program.familyId];
    const position = v2VotePosition(program);
    const score = (position?.[route?.axis ?? "economic"] ?? 0) * POSITION_TO_SCORE;
    if (program.scope !== "regional" || !program.regionId || !route || score === 0) continue;
    const typeId = familyLeanTypeId(program.familyId);
    if (!types.has(typeId)) {
      types.set(typeId, {
        _id: typeId,
        demographicEffects: leanEffectsForFamily(program.familyId),
      } as LegislationType);
    }
    const policy = {
      stateId: program.regionId,
      legislationTypeId: typeId,
      policyOptionId: program.choice,
      economic: route.axis === "economic" ? score : 0,
      social: route.axis === "social" ? score : 0,
      effectDirection: Math.sign(score),
      scopeMultiplier: 1,
    } as ActivePolicy;
    const list = policiesByRegion.get(program.regionId) ?? [];
    list.push(policy);
    policiesByRegion.set(program.regionId, list);
  }
  return { policiesByRegion, types };
}
