/**
 * Control-group capacity for the NPP build toll. One pass per turn: every
 * corporation resolved to its control group, every sector converted to a
 * dominance sector, then looked up per corporation. Only built once
 * `gameConfig.groupSizeCostsStage` reaches the group toll stage.
 */
import type { Db } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import {
  GROUP_DOMINANCE_TOLL_STAGE,
  FIRM_SECTOR_PROJECTION,
  toDominanceSector,
  type FirmSectorRow,
} from "@/lib/corporations/commodityDominanceContext";
import type { CommodityDominanceSector } from "@/lib/corporations/rules/commodityDominance";
import { controlGroupRootByCorpId } from "@/lib/corporations/groups/controlGroups";

export async function loadGroupDominanceSectorResolver(
  db: Db,
  turn: number
): Promise<((corporationId: string) => CommodityDominanceSector[]) | null> {
  const cfg = await db
    .collection<{ groupSizeCostsStage?: number }>("gameConfig")
    .findOne({ _id: "default" as never }, { projection: { groupSizeCostsStage: 1 } });
  if ((cfg?.groupSizeCostsStage ?? 0) < GROUP_DOMINANCE_TOLL_STAGE) return null;
  const [corps, sectors] = await Promise.all([
    db
      .collection<Corporation>("corporations")
      .find({}, { projection: { shareholders: 1, totalShares: 1, superShareMultiplier: 1 } })
      .toArray(),
    db
      .collection<CorporateSector>("corporateSectors")
      .find({}, { projection: { ...FIRM_SECTOR_PROJECTION, corporationId: 1 } })
      .toArray(),
  ]);
  const rootByCorpId = controlGroupRootByCorpId(corps);
  const bySector = new Map<string, CommodityDominanceSector[]>();
  for (const row of sectors) {
    const corpId = row.corporationId.toString();
    const root = rootByCorpId.get(corpId) ?? corpId;
    const list = bySector.get(root) ?? [];
    list.push(toDominanceSector(row as FirmSectorRow, turn));
    bySector.set(root, list);
  }
  return (corporationId) => bySector.get(rootByCorpId.get(corporationId) ?? corporationId) ?? [];
}
