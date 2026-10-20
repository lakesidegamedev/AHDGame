/**
 * Does this deal concentrate a national industry enough to be referred?
 *
 * Measured on the SHARED denominator (`loadIndustryBasis`), so the combined
 * post-merger share here and the share the corporation page displays are the
 * same number. The scope is the TARGET's home country: that is the state whose
 * market structure changes and whose authority reviews the deal.
 */

import { ObjectId, type Db } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CorporationType } from "@/lib/constants/corporations";
import type { MergerOverlapFinding } from "@/lib/db/types/mergerReview";
import { computeMarketSharePercent } from "../marketShare";
import { loadIndustryBasis } from "../corpMarketShare";
import { controlGroupMemberIds, controlGroupRootByCorpId } from "../groups/controlGroups";

/** gameConfig.groupSizeCostsStage at which merger concentration reads both sides' control groups. */
export const GROUP_MERGER_CONCENTRATION_STAGE = 5;

/**
 * Corporation ids on each side of the deal: the corporation alone while the
 * group stage is off, else its whole control group (the acquirer's group and
 * the target with everything it controls), so a deal cannot be sliced into
 * pieces that each look small.
 */
async function dealSides(
  db: Db,
  acquirer: Pick<Corporation, "_id">,
  target: Pick<Corporation, "_id">
): Promise<{ acquirerIds: string[]; targetIds: string[] }> {
  const alone = { acquirerIds: [acquirer._id.toString()], targetIds: [target._id.toString()] };
  const cfg = await db
    .collection<{ groupSizeCostsStage?: number }>("gameConfig")
    .findOne({ _id: "default" as never }, { projection: { groupSizeCostsStage: 1 } });
  if ((cfg?.groupSizeCostsStage ?? 0) < GROUP_MERGER_CONCENTRATION_STAGE) return alone;
  const corps = await db
    .collection<Corporation>("corporations")
    .find({}, { projection: { shareholders: 1, totalShares: 1, superShareMultiplier: 1 } })
    .toArray();
  const roots = controlGroupRootByCorpId(corps);
  const acquirerIds = controlGroupMemberIds(roots, alone.acquirerIds[0]);
  const inAcquirerGroup = new Set(acquirerIds);
  // Target-side members already in the acquirer's group are not a second holder.
  const targetIds = controlGroupMemberIds(roots, alone.targetIds[0]).filter(
    (id) => !inAcquirerGroup.has(id)
  );
  return { acquirerIds, targetIds: targetIds.length > 0 ? targetIds : alone.targetIds };
}

export interface MergerConcentration {
  /** Every industry where the combined firm would hold share, worst first. */
  overlaps: MergerOverlapFinding[];
  leadSectorType: CorporationType | null;
  combinedSharePercent: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Combined post-merger share per industry in the target's home country.
 *
 * Only sectors PHYSICALLY LOCATED in that country count, on both sides — a
 * British acquirer's American plants concentrate the American market and are
 * measured; its British plants do not and are not. That is why both sides are
 * measured out of the same `loadIndustryBasis` rollup rather than from each
 * corp's own home-country view.
 */
export async function computeMergerConcentration(
  db: Db,
  acquirer: Pick<Corporation, "_id">,
  target: Pick<Corporation, "_id" | "countryId">,
  plantsEnabled: boolean = false
): Promise<MergerConcentration> {
  const { acquirerIds, targetIds } = await dealSides(db, acquirer, target);

  // Industries either side operates in ANYWHERE — filtered to the reviewing
  // country by the rollup itself, which only reads that country's states.
  const sectors = await db
    .collection<CorporateSector>("corporateSectors")
    .find({ corporationId: { $in: [...acquirerIds, ...targetIds].map((id) => new ObjectId(id)) } })
    .project<Pick<CorporateSector, "sectorType">>({ sectorType: 1 })
    .toArray();
  const types = [...new Set(sectors.map((s) => s.sectorType))] as CorporationType[];
  if (types.length === 0) {
    return { overlaps: [], leadSectorType: null, combinedSharePercent: 0 };
  }

  const byType = await loadIndustryBasis(db, target.countryId, types, plantsEnabled);

  const overlaps: MergerOverlapFinding[] = [];
  for (const sectorType of types) {
    const basis = byType.get(sectorType);
    if (!basis || basis.basisMarket <= 0) continue;
    const sideBasis = (ids: readonly string[]) =>
      ids.reduce((sum, id) => sum + (basis.basisByCorp.get(id) ?? 0), 0);
    const acquirerBasis = sideBasis(acquirerIds);
    const targetBasis = sideBasis(targetIds);
    // ─── An overlap needs BOTH sides in the industry (#1163) ───────────────
    //
    // This used to record an industry whenever EITHER side held share, so a
    // deal was referred over the acquirer's own pre-existing dominance in an
    // industry the target does not operate in at all. The reporter's case: a
    // target holding only chemical sectors triggered an extraction warning,
    // because the acquirer already led extraction.
    //
    // A merger concentrates an industry only where the two firms were
    // previously separate holders of it. Single-sided industries are unchanged
    // by the deal — the acquirer's share there is identical before and after,
    // and the target's share simply changes owner — so referring on them
    // reports a state of the world that the merger did not create.
    if (acquirerBasis <= 0 || targetBasis <= 0) continue;
    overlaps.push({
      sectorType,
      acquirerSharePercent: round2(computeMarketSharePercent(acquirerBasis, basis.basisMarket)),
      targetSharePercent: round2(computeMarketSharePercent(targetBasis, basis.basisMarket)),
      combinedSharePercent: round2(
        computeMarketSharePercent(acquirerBasis + targetBasis, basis.basisMarket)
      ),
    });
  }

  overlaps.sort((a, b) => b.combinedSharePercent - a.combinedSharePercent);
  const lead = overlaps[0];
  return {
    overlaps,
    leadSectorType: lead?.sectorType ?? null,
    combinedSharePercent: lead?.combinedSharePercent ?? 0,
  };
}
