/**
 * Monopoly nationalization trigger (spec §8): a corp's highest (state, sectorType)
 * market share. Compared against MONOPOLY_SHARE_THRESHOLD by evaluateEligibility.
 * Reuses the canonical per-sector share computation so the number matches the
 * dominance penalties elsewhere.
 *
 * From `gameConfig.groupSizeCostsStage` 4 the share is the corporation's whole
 * control group's: members' shares in one cell add up, so splitting a business
 * into subsidiaries does not keep it under the threshold.
 */
import type { Db, ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import {
  fetchMarketSharePercentForSectors,
  fetchSectorMarketSharePercent,
} from "@/lib/corporations/marketShare";
import {
  controlGroupMemberIds,
  controlGroupRootByCorpId,
} from "@/lib/corporations/groups/controlGroups";

/** gameConfig.groupSizeCostsStage at which the monopoly trigger reads the control group. */
const GROUP_MONOPOLY_TRIGGER_STAGE = 4;

export interface GroupCellShareRow {
  /** Control-group root of the sector's owner. */
  root: string;
  stateId: string;
  sectorType: string;
  industryModel?: string | null;
  mediaDiscriminator?: string | null;
  /** The sector's share of its cell, percent 0-100. */
  sharePercent: number;
}

/**
 * Highest combined cell share per control group: members' shares in the same
 * (state, market) cell add up, then the group's top cell wins.
 */
export function topGroupCellSharePercent(rows: readonly GroupCellShareRow[]): Map<string, number> {
  const byCell = new Map<string, number>();
  for (const r of rows) {
    const key = [
      r.root,
      r.stateId,
      r.sectorType,
      r.industryModel ?? "",
      r.mediaDiscriminator ?? "",
    ];
    const k = key.join("::");
    byCell.set(k, (byCell.get(k) ?? 0) + r.sharePercent);
  }
  const top = new Map<string, number>();
  for (const [k, pct] of byCell) {
    const root = k.slice(0, k.indexOf("::"));
    if (pct > (top.get(root) ?? 0)) top.set(root, pct);
  }
  return top;
}

/**
 * Group-basis top market share for each requested corporation, or null while
 * the group stage is off (callers then keep the per-corporation figure).
 */
export async function loadGroupTopMarketShares(
  db: Db,
  corporationIds: readonly ObjectId[]
): Promise<Map<string, number> | null> {
  const cfg = await db
    .collection<{ groupSizeCostsStage?: number }>("gameConfig")
    .findOne({ _id: "default" as never }, { projection: { groupSizeCostsStage: 1 } });
  if ((cfg?.groupSizeCostsStage ?? 0) < GROUP_MONOPOLY_TRIGGER_STAGE) return null;
  const corps = await db
    .collection<Corporation>("corporations")
    .find({}, { projection: { shareholders: 1, totalShares: 1, superShareMultiplier: 1 } })
    .toArray();
  const rootByCorpId = controlGroupRootByCorpId(corps);
  const requestedRoots = new Set(
    corporationIds.map((id) => rootByCorpId.get(id.toString()) ?? id.toString())
  );
  const memberIds = new Set<string>();
  for (const root of requestedRoots)
    for (const id of controlGroupMemberIds(rootByCorpId, root)) memberIds.add(id);
  const memberObjectIds = corps.map((c) => c._id).filter((id) => memberIds.has(id.toString()));
  const sectors = await db
    .collection<CorporateSector>("corporateSectors")
    .find({ corporationId: { $in: memberObjectIds } })
    .toArray();
  const shareBySectorId = await fetchMarketSharePercentForSectors(db, sectors);
  const topByRoot = topGroupCellSharePercent(
    sectors.map((s) => ({
      root: rootByCorpId.get(s.corporationId.toString()) ?? s.corporationId.toString(),
      stateId: s.stateId,
      sectorType: s.sectorType,
      industryModel: s.industryModel,
      mediaDiscriminator: s.mediaDiscriminator,
      sharePercent: shareBySectorId.get(s._id.toString()) ?? 0,
    }))
  );
  const result = new Map<string, number>();
  for (const id of corporationIds) {
    const key = id.toString();
    result.set(key, topByRoot.get(rootByCorpId.get(key) ?? key) ?? 0);
  }
  return result;
}

export async function getTopMarketSharePercent(
  db: Db,
  corp: Corporation,
  sectors: CorporateSector[]
): Promise<number> {
  const group = await loadGroupTopMarketShares(db, [corp._id]);
  if (group) return group.get(corp._id.toString()) ?? 0;
  if (sectors.length === 0) return 0;
  let top = 0;
  for (const sector of sectors) {
    const pct = await fetchSectorMarketSharePercent(db, sector, corp);
    if (pct > top) top = pct;
  }
  return top;
}
