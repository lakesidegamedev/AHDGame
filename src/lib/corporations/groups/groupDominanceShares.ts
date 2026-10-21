/**
 * Control-group market shares for the running dominance cost. A group's share
 * of a market is the sum of its members' shares there, so a business split into
 * subsidiaries is measured as one. Pure: shares in, shares out.
 */
import type { CorporateSector } from "@/lib/db/types";

type ShareSector = Pick<
  CorporateSector,
  "_id" | "corporationId" | "stateId" | "sectorType" | "industryModel" | "mediaDiscriminator"
> & { countryId?: string | null };

export interface GroupDominanceShares {
  /** sectorId -> the owning group's combined share of the sector's (state, market) cell, percent. */
  local: Map<string, number>;
  /** sectorId -> the owning group's combined share of the sector's (country, sectorType), percent. */
  national: Map<string, number>;
}

const cap = (n: number) => Math.min(100, n);

export function buildGroupDominanceShares(args: {
  sectors: readonly ShareSector[];
  rootByCorpId: ReadonlyMap<string, string>;
  localShareBySectorId: ReadonlyMap<string, number>;
  /** Each corporation's own aggregate national share, read per sector. */
  nationalShareBySectorId: ReadonlyMap<string, number>;
  countryOf: (sector: ShareSector) => string;
}): GroupDominanceShares {
  const rootOf = (s: ShareSector): string => {
    const corpId = s.corporationId.toString();
    return args.rootByCorpId.get(corpId) ?? corpId;
  };
  const localKey = (s: ShareSector) =>
    [rootOf(s), s.stateId, s.sectorType, s.industryModel ?? "", s.mediaDiscriminator ?? ""].join(
      "|"
    );
  const nationalKey = (s: ShareSector) =>
    [
      rootOf(s),
      args.countryOf(s),
      s.sectorType,
      s.industryModel ?? "",
      s.mediaDiscriminator ?? "",
    ].join("|");

  const localByCell = new Map<string, number>();
  const nationalByKey = new Map<string, number>();
  const seenCorpInKey = new Set<string>();
  for (const s of args.sectors) {
    const id = s._id.toString();
    const lk = localKey(s);
    localByCell.set(lk, (localByCell.get(lk) ?? 0) + (args.localShareBySectorId.get(id) ?? 0));
    // A corporation's national share is the same on each of its sectors in the
    // market, so count it once per (group, market).
    const nk = nationalKey(s);
    const once = `${nk}|${s.corporationId.toString()}`;
    if (!seenCorpInKey.has(once)) {
      seenCorpInKey.add(once);
      nationalByKey.set(
        nk,
        (nationalByKey.get(nk) ?? 0) + (args.nationalShareBySectorId.get(id) ?? 0)
      );
    }
  }
  const local = new Map<string, number>();
  const national = new Map<string, number>();
  for (const s of args.sectors) {
    const id = s._id.toString();
    local.set(id, cap(localByCell.get(localKey(s)) ?? 0));
    national.set(id, cap(nationalByKey.get(nationalKey(s)) ?? 0));
  }
  return { local, national };
}
