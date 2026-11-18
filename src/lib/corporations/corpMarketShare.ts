/**
 * Corporation-level market share, aggregated by industry (sector type) across
 * the corporation's home country. Powers the Charts → Market Share view on the
 * corporation page.
 *
 * Reuses the anchor/effective-market primitives in `./marketShare.ts` (the same
 * denominator the per-sector routes and the Discord `marketshare` command use)
 * so every surface agrees. All revenue is FX-normalized to ₳ before comparison.
 */

import type { Db } from "mongodb";
import type { Corporation, CorporateSector, State } from "@/lib/db/types";
import { CORPORATION_TYPE_LABELS } from "@/lib/constants/corporations";
import type { CorporationType } from "@/lib/constants/corporations";
import type { CountryId } from "@/lib/constants/countries";
import {
  loadValuationFxRates,
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { computeMarketSharePercent, loadSectorOwnerCurrencyInfo } from "./marketShare";
import { statesCollection } from "@/lib/db/repositories/states";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

/** The focal corporation's market position in one industry (home country). */
export interface CorpMarketSharePosition {
  sectorType: CorporationType;
  label: string;
  /** Focal corp's ₳-normalized revenue in this industry. */
  revenueAnchor: number;
  /** Focal corp's share of the addressable market, 0–100. */
  marketSharePercent: number;
  /** 1-based rank among corporations active in this industry. */
  rank: number;
  /** Number of corporations (incl. the focal corp) active in this industry. */
  competitors: number;
}

/** One industry's national rollup: every corp's basis plus the market total. */
export interface IndustryBasis {
  /** corpId → basis (capacity units under plants, else ₳ revenue). */
  basisByCorp: Map<string, number>;
  /** corpId → ₳ revenue, always, regardless of basis. */
  anchorByCorp: Map<string, number>;
  /** Denominator: the addressable national market on the same basis. */
  basisMarket: number;
}

/**
 * National per-industry rollup for one country. This is the SHARED denominator:
 * `computeCorpMarketShare` and the merger-review concentration test both read
 * it, so a combined post-merger share and a displayed single-corp share can
 * never be measured against different markets.
 */
export async function loadIndustryBasis(
  db: Db,
  countryId: CountryId,
  types: CorporationType[],
  // Retained for call-site compatibility; market share is revenue-basis in every
  // tier now, so the tier no longer selects a different basis.
  _plantsEnabled: boolean = false
): Promise<Map<CorporationType, IndustryBasis>> {
  const out = new Map<CorporationType, IndustryBasis>();
  if (types.length === 0) return out;

  const states = await statesCollection(db)
    .find({ countryId })
    .project<{ _id: string; countryId: CountryId }>({ _id: 1, countryId: 1 })
    .toArray();
  if (states.length === 0) return out;
  const stateIds = states.map((s) => s._id);

  const [sectorsInScope, fxByCurrency] = await Promise.all([
    corporateSectorsCollection(db)
      .find({ sectorType: { $in: types }, stateId: { $in: stateIds } })
      .project<Pick<CorporateSector, "corporationId" | "sectorType" | "stateId" | "revenue">>({
        corporationId: 1,
        sectorType: 1,
        stateId: 1,
        revenue: 1,
      })
      .toArray(),
    loadValuationFxRates(db),
  ]);

  // Every in-scope sector sits in `countryId`, but its stored currency follows
  // its owner: a domestic sector carries the owner's stamped home currency, a
  // cross-border one the host's era-blind code. Resolve per sector with the owner.
  const ownerById = await loadSectorOwnerCurrencyInfo(db, sectorsInScope);
  const anchorFor = (sec: Pick<CorporateSector, "corporationId" | "revenue">): number => {
    const owner = ownerById.get(sec.corporationId.toString()) ?? null;
    return readCorpEconomicAnchor(
      sec.revenue,
      resolveSectorHostCurrencyCode({ countryId }, owner),
      fxRateForSectorHostFromMap({ countryId }, owner, fxByCurrency)
    );
  };

  for (const sectorType of types) {
    const typeSectors = sectorsInScope.filter((s) => s.sectorType === sectorType);

    // The denominator is the revenue every producer actually earns across the country's states.
    const anchorByCorp = new Map<string, number>();
    let totalMarket = 0;
    for (const sec of typeSectors) {
      const anchor = anchorFor(sec);
      totalMarket += anchor;
      const id = sec.corporationId.toString();
      anchorByCorp.set(id, (anchorByCorp.get(id) ?? 0) + anchor);
    }

    out.set(sectorType, {
      basisByCorp: anchorByCorp,
      anchorByCorp,
      basisMarket: totalMarket,
    });
  }

  return out;
}

/**
 * Compute the focal corporation's market-share position for each industry it
 * operates in, scoped to its home country. Read-only aggregation; returns an
 * empty array when the corp has no sectors or its country has no states.
 */
export async function computeCorpMarketShare(
  db: Db,
  corporation: Pick<Corporation, "_id" | "countryId">,
  corpSectors: Pick<CorporateSector, "sectorType">[],
  /** @deprecated Ignored. Share is revenue-basis in every tier. */
  plantsEnabled: boolean = false
): Promise<CorpMarketSharePosition[]> {
  const focalId = corporation._id.toString();
  const types = [...new Set(corpSectors.map((s) => s.sectorType))] as CorporationType[];
  const byType = await loadIndustryBasis(db, corporation.countryId, types, plantsEnabled);

  const positions: CorpMarketSharePosition[] = [];
  for (const sectorType of types) {
    const basis = byType.get(sectorType);
    if (!basis) continue;
    const { basisByCorp, anchorByCorp, basisMarket } = basis;

    const ranked = [...basisByCorp.entries()].sort((a, b) => b[1] - a[1]);
    const rankIdx = ranked.findIndex(([id]) => id === focalId);
    const focalAnchor = anchorByCorp.get(focalId) ?? 0;
    const focalBasis = basisByCorp.get(focalId) ?? 0;

    positions.push({
      sectorType,
      label: CORPORATION_TYPE_LABELS[sectorType],
      revenueAnchor: Math.round(focalAnchor),
      marketSharePercent:
        Math.round(computeMarketSharePercent(focalBasis, basisMarket) * 100) / 100,
      rank: rankIdx >= 0 ? rankIdx + 1 : ranked.length + 1,
      competitors: ranked.length,
    });
  }

  positions.sort((a, b) => b.marketSharePercent - a.marketSharePercent);
  return positions;
}
