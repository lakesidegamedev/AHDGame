/** Pure rules for cabinetInfra; the tables they read live in cabinetInfraTables. */
import type { CountryId } from "@/lib/constants/countries";
import type { InfraProject, BuildFundingLevel } from "@/lib/db/types/infraProject";
import {
  BUILD_FUNDING,
  INFRA_ARCHETYPES,
  INFRA_POSITION_BY_COUNTRY,
  type BuildFundingDef,
  type InfraAggregate,
  type InfraArchetype,
} from "@/lib/constants/cabinetInfraTables";

export function buildFundingDef(level: BuildFundingLevel): BuildFundingDef {
  return BUILD_FUNDING.find((f) => f.id === level) ?? BUILD_FUNDING[1];
}

export function getInfraArchetype(id: string): InfraArchetype | undefined {
  return INFRA_ARCHETYPES.find((a) => a.id === id);
}

/**
 * Archetypes buildable in a given calendar year. An archetype with an
 * `availableFrom` later than `year` is anachronistic and excluded (e.g.
 * broadband in a 1953 world). A null/undefined/non-finite year means legacy /
 * era-agnostic seeding — every archetype is available, so flag-off behavior is
 * unchanged.
 */
export function availableInfraArchetypes(year?: number | null): InfraArchetype[] {
  if (year == null || !Number.isFinite(year)) return INFRA_ARCHETYPES;
  return INFRA_ARCHETYPES.filter((a) => a.availableFrom == null || year >= a.availableFrom);
}

export function resolveInfraPosition(countryId: string, positionId: string): string | null {
  return INFRA_POSITION_BY_COUNTRY[countryId as CountryId] === positionId ? positionId : null;
}

export function effectiveOutput(project: Pick<InfraProject, "outputBase">): number {
  return project.outputBase;
}

export function turnsRemaining(
  project: Pick<InfraProject, "progress" | "buildDuration" | "fundingLevel">
): number {
  const speed = buildFundingDef(project.fundingLevel).speedMult;
  return Math.max(0, Math.ceil((project.buildDuration - project.progress) / speed));
}

export function progressPct(project: Pick<InfraProject, "progress" | "buildDuration">): number {
  if (project.buildDuration <= 0) return 100;
  return Math.min(100, Math.round((project.progress / project.buildDuration) * 100));
}

export function aggregateInfra(projects: InfraProject[]): InfraAggregate {
  const byRegion: Record<string, { building: number; operational: number }> = {};
  let building = 0;
  let operational = 0;
  let constructionSpend = 0;
  let operationalUpkeep = 0;
  for (const p of projects) {
    const site = (byRegion[p.regionId] ??= { building: 0, operational: 0 });
    if (p.status === "operational") {
      operational++;
      operationalUpkeep += p.upkeepBase;
      site.operational++;
    } else {
      building++;
      constructionSpend += +(
        p.constructionCostBase * buildFundingDef(p.fundingLevel).costMult
      ).toFixed(4);
      site.building++;
    }
  }
  return {
    building,
    operational,
    constructionSpend: +constructionSpend.toFixed(4),
    operationalUpkeep,
    committedSpend: +(constructionSpend + operationalUpkeep).toFixed(4),
    byRegion,
  };
}
