import type { OrgMemberId } from "@/lib/db/types/internationalOrganization";
import { ROSTER_BY_KEY } from "@/lib/constants/alignmentRoster";
import type { OrgSummary } from "../orgTypes";

/** Index every org under each of its member countries (insertion order preserved). */
export function orgMembersByCountry(orgs: OrgSummary[]): Map<OrgMemberId, OrgSummary[]> {
  // Keyed by entity: any nation in the game may belong to an organisation.
  const byCountry = new Map<OrgMemberId, OrgSummary[]>();
  for (const org of orgs) {
    for (const m of org.members) {
      const list = byCountry.get(m.countryId) ?? [];
      list.push(org);
      byCountry.set(m.countryId, list);
    }
  }
  return byCountry;
}

/**
 * The entities an organisation's colour covers: its members, and only its
 * members.
 *
 * Dependencies are deliberately NOT included. Shading them made the map assert
 * something false: the legend reads "Members of NATO" while 75 colonies and
 * protectorates were painted alongside the 14 signatories, implying they had
 * joined. The North Atlantic Treaty is explicit: Article 6 draws a treaty area
 * covering the Algerian departments of France and the North Atlantic islands,
 * and excludes the members' other possessions.
 *
 * Constituent territory still shades, because it is not a dependency question:
 * Byelorussia and the Baltics fall inside the Soviet Union's own geometry, so
 * the soviet-union shard draws them as part of RU rather than beside it.
 *
 * This is also the key the map's overlay blobs are matched on, since a blob is
 * identified by the country that owns its regions rather than by an ISO code.
 */
export function memberEntityIds(org: OrgSummary | null): Set<string> {
  const ids = new Set<string>();
  if (!org) return ids;
  for (const m of org.members) ids.add(String(m.countryId));
  return ids;
}

/**
 * Map feature ids to shade for an org's members.
 *
 * Keyed on roster entity, not CountryId: membership is entity-wide, and some
 * members (Canada, Benelux) are background entities without a CountryId.
 * Present-day footprints only; territory differences are drawn as an overlay
 * blob and covered base features are dropped before this set is consulted.
 */
export function memberFeatureIds(org: OrgSummary | null): Set<string> {
  const ids = new Set<string>();
  if (!org) return ids;
  for (const key of memberEntityIds(org)) {
    for (const iso of ROSTER_BY_KEY[key as keyof typeof ROSTER_BY_KEY]?.iso ?? []) ids.add(iso);
  }
  return ids;
}
