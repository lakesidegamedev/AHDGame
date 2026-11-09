/**
 * A nationwide contest has no census row of its own. Its electorate is the
 * union of the regional census electorates, weighted by each region's eligible
 * population, so a national vote counts the same cells the regional contests do.
 *
 * Plain data in, plain data out: callers build one regional substrate per
 * region and this folds them together.
 */
import type { ElectorateUnit } from "./electorateUnit";
import type { StateDemographics } from "@/lib/db/types";
import type { EnrichedCandidate } from "@/lib/electionEngine/types";
import {
  GRANULAR_CATEGORY_ID,
  LEAN_QUANT,
  TURNOUT_QUANT,
  type GranularElectorateUnit,
  type GranularSubstrate,
} from "./granularElectorate";

export interface RegionalSubstratePart {
  regionId: string;
  /** Eligible electorate the regional substrate was built for. */
  electorate: number;
  substrate: GranularSubstrate;
}

interface Member {
  part: RegionalSubstratePart;
  unitId: string;
  share: number;
}

interface Merged {
  share: number;
  economic: number;
  social: number;
  turnout: number;
  bucketWeights: Record<string, number>;
  members: Member[];
}

const clampTurnout = (v: number) => Math.max(5, Math.min(95, v));

function liveUnitValues(part: RegionalSubstratePart, unit: GranularElectorateUnit) {
  const live = part.substrate.demographics.groups[unit.id];
  return {
    economic: live?.economicLean ?? unit.economicLean,
    social: live?.socialLean ?? unit.socialLean,
    turnout: part.substrate.liveTurnouts[unit.id] ?? unit.turnout,
  };
}

/** Share-weighted mean of a per-unit map over the merged unit's members (absent counts as 0). */
function meanOverMembers(
  members: Member[],
  share: number,
  valueOf: (member: Member) => number | undefined
): number {
  let sum = 0;
  for (const member of members) sum += member.share * (valueOf(member) ?? 0);
  return share > 0 ? sum / share : 0;
}

/**
 * Fold regional substrates into one national substrate. Regional units that
 * share quantized leans and turnout coalesce into one national unit, so the
 * unit count stays bounded however many regions the country has. Per-unit
 * candidate maps (bucket approvals, ad bonuses) and party favorability are
 * carried over as share-weighted means.
 */
export function mergeRegionalSubstrates(
  parts: RegionalSubstratePart[],
  nationalDemographics: StateDemographics
): GranularSubstrate | null {
  const totalElectorate = parts.reduce((sum, part) => sum + part.electorate, 0);
  if (parts.length === 0 || !(totalElectorate > 0)) return null;

  const byKey = new Map<string, Merged>();
  for (const part of parts) {
    const weight = part.electorate / totalElectorate;
    for (const unit of part.substrate.units) {
      const live = liveUnitValues(part, unit);
      const key = [
        Math.round(live.economic / LEAN_QUANT),
        Math.round(live.social / LEAN_QUANT),
        Math.round(live.turnout / TURNOUT_QUANT),
      ].join("|");
      const share = unit.share * weight;
      let acc = byKey.get(key);
      if (!acc) {
        acc = { share: 0, economic: 0, social: 0, turnout: 0, bucketWeights: {}, members: [] };
        byKey.set(key, acc);
      }
      acc.share += share;
      acc.economic += share * live.economic;
      acc.social += share * live.social;
      acc.turnout += share * live.turnout;
      for (const [bucket, w] of Object.entries(unit.bucketWeights)) {
        acc.bucketWeights[bucket] = (acc.bucketWeights[bucket] ?? 0) + share * w;
      }
      acc.members.push({ part, unitId: unit.id, share });
    }
  }

  const merged = [...byKey.values()]
    .filter((acc) => acc.share > 0)
    .sort((a, b) => b.share - a.share);
  if (merged.length === 0) return null;

  const units: GranularElectorateUnit[] = [];
  const electorate: ElectorateUnit[] = [];
  const groups: StateDemographics["groups"] = {};
  const liveTurnouts: Record<string, number> = {};
  const categoryGroups: GranularSubstrate["categories"][number]["groups"] = [];
  merged.forEach((acc, index) => {
    const id = `nat_${index}`;
    const economicLean = acc.economic / acc.share;
    const socialLean = acc.social / acc.share;
    const turnout = clampTurnout(acc.turnout / acc.share);
    const bucketWeights = Object.fromEntries(
      Object.entries(acc.bucketWeights).map(([bucket, w]) => [bucket, w / acc.share])
    );
    units.push({ id, share: acc.share, economicLean, socialLean, turnout, bucketWeights });
    groups[id] = { population: acc.share * 100, economicLean, socialLean, turnout };
    electorate.push({ id, populationPct: acc.share * 100, economicLean, socialLean, turnout });
    liveTurnouts[id] = turnout;
    categoryGroups.push({
      id,
      name: id,
      defaultEconomicLean: economicLean,
      defaultSocialLean: socialLean,
      defaultTurnout: turnout,
    });
  });

  const candidateCount = parts[0].substrate.enriched.length;
  const enriched: EnrichedCandidate[] = parts[0].substrate.enriched.map((base, index) => {
    const field = (name: "bucketApprovals" | "targetedAdBonuses") => {
      const carried = parts.some((part) => {
        const values = part.substrate.enriched[index]?.[name];
        return values && Object.keys(values).length > 0;
      });
      if (!carried) return undefined;
      const out: Record<string, number> = {};
      merged.forEach((acc, i) => {
        const value = meanOverMembers(
          acc.members,
          acc.share,
          (member) => member.part.substrate.enriched[index]?.[name]?.[member.unitId]
        );
        if (value !== 0) out[`nat_${i}`] = value;
      });
      return out;
    };
    const approvals = field("bucketApprovals");
    const bonuses = field("targetedAdBonuses");
    return {
      ...base,
      ...(approvals ? { bucketApprovals: approvals } : {}),
      ...(bonuses ? { targetedAdBonuses: bonuses } : {}),
    };
  });
  if (enriched.length !== candidateCount) return null;

  let partyGroupFavorabilityByKey: Map<string, number> | undefined;
  const favorabilityParties = new Set<string>();
  for (const part of parts) {
    for (const key of part.substrate.partyGroupFavorabilityByKey?.keys() ?? []) {
      const sep = key.indexOf(":");
      if (sep > 0) favorabilityParties.add(key.slice(0, sep));
    }
  }
  if (favorabilityParties.size > 0) {
    partyGroupFavorabilityByKey = new Map();
    merged.forEach((acc, i) => {
      for (const party of favorabilityParties) {
        const value = meanOverMembers(acc.members, acc.share, (member) =>
          member.part.substrate.partyGroupFavorabilityByKey?.get(`${party}:${member.unitId}`)
        );
        if (value !== 0) partyGroupFavorabilityByKey!.set(`${party}:nat_${i}`, value);
      }
    });
  }

  return {
    electorate,
    demographics: {
      ...nationalDemographics,
      categoryWeights: { [GRANULAR_CATEGORY_ID]: 100 },
      groups,
    },
    categories: [
      {
        _id: GRANULAR_CATEGORY_ID,
        name: "Granular Electorate",
        defaultWeight: 100,
        groups: categoryGroups,
      },
    ],
    liveTurnouts,
    totalPool: parts.reduce((sum, part) => sum + part.substrate.totalPool, 0),
    enriched,
    ...(partyGroupFavorabilityByKey ? { partyGroupFavorabilityByKey } : {}),
    units,
  };
}
