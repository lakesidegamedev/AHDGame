/**
 * Group balance sheet: what a parent controls through subsidiaries, not just
 * what its own corporation document says. READ-only; members keep their own
 * balance sheets and shareholders. Intra-group holdings are netted out so a
 * subsidiary's sectors aren't counted both as an asset and as production.
 */

import { ObjectId, type Db } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import {
  corpLiquidCapitalToAnchor,
  loadValuationFxRates,
  fxRateForCorpFromMap,
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { groupRegionFootprint } from "./rules/overview";
import { resolveFormalizedGroups } from "./groupMembership";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

export interface GroupMemberSummary {
  corporationId: string;
  name: string;
  tickerSymbol?: string;
  countryId: string;
  isRoot: boolean;
  liquidCapitalAnchor: number;
  revenueAnchor: number;
  sectorCount: number;
  regionCount: number;
}

export interface GroupBalanceSheet {
  rootCorporationId: string;
  rootName: string;
  memberCount: number;
  members: GroupMemberSummary[];
  /** Sum of every member's liquid capital, in ₳. */
  totalLiquidCapitalAnchor: number;
  /** Sum of every member's sector revenue, in ₳. */
  totalRevenueAnchor: number;
  totalSectorCount: number;
  totalRegionCount: number;
  /** Industries the group operates in anywhere, deduplicated. */
  industries: OperatingSectorType[];
  /** Countries the group has sectors in. */
  countries: string[];
}

/**
 * Build the consolidated view for the group containing `corporationId`. Returns
 * null when that corporation is not in a formalized group — a lone corporation
 * has no group sheet, and showing it one made of itself would be noise.
 */
export async function loadGroupBalanceSheet(
  db: Db,
  corporationId: ObjectId
): Promise<GroupBalanceSheet | null> {
  const membership = await resolveFormalizedGroups(db, { includeReserved: true });
  const rootId = membership.rootByCorpId.get(corporationId.toString());
  if (!rootId) return null;
  const memberIds = membership.membersByRootId.get(rootId);
  if (!memberIds || memberIds.length < 2) return null;

  const corps = await corporationsCollection(db)
    .find({ _id: { $in: memberIds.map((id) => new ObjectId(id)) } })
    .project<
      Pick<
        Corporation,
        "_id" | "name" | "tickerSymbol" | "countryId" | "liquidCapital" | "liquidCurrencyCode"
      >
    >({ name: 1, tickerSymbol: 1, countryId: 1, liquidCapital: 1, liquidCurrencyCode: 1 })
    .toArray();
  if (corps.length === 0) return null;

  const [sectors, fxByCurrency] = await Promise.all([
    corporateSectorsCollection(db)
      .find({ corporationId: { $in: corps.map((c) => c._id) } })
      .project<
        Pick<CorporateSector, "corporationId" | "sectorType" | "stateId" | "countryId" | "revenue">
      >({
        corporationId: 1,
        sectorType: 1,
        stateId: 1,
        countryId: 1,
        revenue: 1,
      })
      .toArray(),
    loadValuationFxRates(db),
  ]);

  const footprint = groupRegionFootprint(
    sectors.map((s) => ({
      corporationId: s.corporationId.toString(),
      countryId: s.countryId,
      stateId: s.stateId,
    }))
  );
  const revenueByCorp = new Map<string, number>();
  const sectorCountByCorp = new Map<string, number>();
  const industries = new Set<OperatingSectorType>();
  const corpById = new Map(corps.map((c) => [c._id.toString(), c]));

  for (const sector of sectors) {
    const key = sector.corporationId.toString();
    const owner = corpById.get(key);
    if (!owner) continue;
    // Sector revenue is stored in the HOST country's currency, not the owner's.
    const hostCode = resolveSectorHostCurrencyCode(sector, owner);
    const hostRate = fxRateForSectorHostFromMap(sector, owner, fxByCurrency);
    const anchor = readCorpEconomicAnchor(sector.revenue ?? 0, hostCode, hostRate);
    revenueByCorp.set(key, (revenueByCorp.get(key) ?? 0) + anchor);
    sectorCountByCorp.set(key, (sectorCountByCorp.get(key) ?? 0) + 1);
    industries.add(sector.sectorType);
  }

  const members: GroupMemberSummary[] = corps.map((corp) => {
    const key = corp._id.toString();
    const fxRate = fxRateForCorpFromMap(corp as Corporation, fxByCurrency);
    return {
      corporationId: key,
      name: corp.name,
      ...(corp.tickerSymbol ? { tickerSymbol: corp.tickerSymbol } : {}),
      countryId: corp.countryId,
      isRoot: key === rootId,
      liquidCapitalAnchor: Math.round(
        corpLiquidCapitalToAnchor(corp.liquidCapital ?? 0, corp as Corporation, fxRate)
      ),
      revenueAnchor: Math.round(revenueByCorp.get(key) ?? 0),
      sectorCount: sectorCountByCorp.get(key) ?? 0,
      regionCount: footprint.byMember.get(key) ?? 0,
    };
  });

  // Root first, then largest by revenue: the list should read as a structure,
  // not as whatever order the database returned.
  members.sort((a, b) => {
    if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
    return b.revenueAnchor - a.revenueAnchor;
  });

  const root = corpById.get(rootId);
  return {
    rootCorporationId: rootId,
    rootName: root?.name ?? members[0]?.name ?? "Group",
    memberCount: members.length,
    members,
    totalLiquidCapitalAnchor: members.reduce((sum, m) => sum + m.liquidCapitalAnchor, 0),
    totalRevenueAnchor: members.reduce((sum, m) => sum + m.revenueAnchor, 0),
    totalSectorCount: members.reduce((sum, m) => sum + m.sectorCount, 0),
    totalRegionCount: footprint.total,
    industries: [...industries].sort(),
    countries: [...new Set(members.map((m) => m.countryId))].sort(),
  };
}
