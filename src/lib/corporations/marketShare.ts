/**
 * Per-sector market share helpers.
 *
 * Market share = sector_revenue ÷ owned_market_revenue × 100, where the market
 * is the revenue every producer in the bucket actually earns. All inputs are anchor-denominated (₳); the
 * caller is responsible for converting per-corp local revenue to ₳ before
 * passing it in. See sectorCalculations.ts and economy routes for the same
 * normalization pattern.
 */

import type { Db, Filter } from "mongodb";
import type { Corporation, CorporateSector, State } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
  type CorpCapitalCurrencyInfo,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { type CountryId } from "@/lib/constants/countries";
import { statesCollection } from "@/lib/db/repositories/states";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

/**
 * Revenue that counts toward market share. A sector with no delivered capacity
 * yet (a founding sector inside its build window) carries a nameplate revenue
 * figure that nothing has earned, so it must not claim share. Sectors whose
 * capacity fields are absent (legacy rows, narrow projections) count as before.
 */
export function shareRevenueLocal(sector: {
  revenue?: number;
  capitalStock?: number;
  plantCount?: number;
}): number | undefined {
  if (sector.capitalStock === 0 && !((sector.plantCount ?? 0) > 0)) return 0;
  return sector.revenue;
}

/** Bounded market share percentage (0–100) given anchor-denominated inputs. */
export function computeMarketSharePercent(
  sectorRevenueAnchor: number,
  effectiveMarketAnchor: number
): number {
  if (effectiveMarketAnchor <= 0) return 0;
  const pct = (sectorRevenueAnchor / effectiveMarketAnchor) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

/** Stable key for a corporation's share of one national sector market. */
export function corporationNationalSectorShareKey(
  corporationId: { toString(): string },
  countryId: CountryId,
  sectorType: CorporateSector["sectorType"]
): string {
  return `${corporationId.toString()}::${countryId}::${sectorType}`;
}

/**
 * Pure national revenue-share lookup for shells that already hold a sector
 * snapshot. All rows within one country use the same host currency, so the FX
 * factor cancels in the ratio.
 */
export function buildCorporationNationalRevenueShareByMarket(
  sectors: ReadonlyArray<
    Pick<
      CorporateSector,
      | "corporationId"
      | "countryId"
      | "stateId"
      | "sectorType"
      | "revenue"
      | "capitalStock"
      | "plantCount"
    >
  >,
  countryByStateId: ReadonlyMap<string, CountryId> = new Map()
): Map<string, number> {
  // A legacy row may lack its denormalized countryId even though another row
  // in the same state has it. Learn that mapping from the snapshot before
  // resolving rows, then fall back to the caller's authoritative state map.
  const resolvedCountryByStateId = new Map(countryByStateId);
  for (const sector of sectors) {
    if (sector.countryId) {
      resolvedCountryByStateId.set(sector.stateId, sector.countryId as CountryId);
    }
  }
  const marketRevenueByKey = new Map<string, number>();
  const corporationRevenueByKey = new Map<string, number>();
  const marketKey = (countryId: CountryId, sectorType: CorporateSector["sectorType"]) =>
    `${countryId}::${sectorType}`;

  for (const sector of sectors) {
    const countryId =
      (sector.countryId as CountryId | undefined) ?? resolvedCountryByStateId.get(sector.stateId);
    if (!countryId) continue;
    const revenue =
      typeof shareRevenueLocal(sector) === "number" && Number.isFinite(shareRevenueLocal(sector))
        ? Math.max(0, shareRevenueLocal(sector)!)
        : 0;
    const nationalMarketKey = marketKey(countryId, sector.sectorType);
    const corporationKey = corporationNationalSectorShareKey(
      sector.corporationId,
      countryId,
      sector.sectorType
    );
    marketRevenueByKey.set(
      nationalMarketKey,
      (marketRevenueByKey.get(nationalMarketKey) ?? 0) + revenue
    );
    corporationRevenueByKey.set(
      corporationKey,
      (corporationRevenueByKey.get(corporationKey) ?? 0) + revenue
    );
  }

  const shareByKey = new Map<string, number>();
  for (const [corporationKey, corporationRevenue] of corporationRevenueByKey) {
    const [, countryId, sectorType] = corporationKey.split("::");
    shareByKey.set(
      corporationKey,
      computeMarketSharePercent(
        corporationRevenue,
        marketRevenueByKey.get(
          marketKey(countryId as CountryId, sectorType as CorporateSector["sectorType"])
        ) ?? 0
      )
    );
  }
  return shareByKey;
}

interface BuildSectorMarketShareInputs {
  sectors: CorporateSector[];
  /**
   * @deprecated No longer used. Sector revenue is denominated in its host-state
   * currency, resolved from the sector/state country — not the owning corp — so
   * per-owner FX resolution is unnecessary. Still accepted for call-site
   * compatibility; may be removed once all callers drop it.
   */
  corpById?: ReadonlyMap<string, CorpCapitalCurrencyInfo>;
  /** stateId → state document (gdp + countryId). */
  stateById: ReadonlyMap<string, Pick<State, "_id" | "gdp" | "countryId">>;
  /** FX rates so per-corp local revenue normalizes to ₳. */
  exchangeRatesByCurrency: ReadonlyMap<CurrencyCode, number>;
  /**
   * @deprecated Ignored. Kept so callers compile until the field is removed.
   */
  preset?: string;
  /**
   * @deprecated Ignored. Share is revenue-basis in every tier.
   */
  plantsEnabled?: boolean;
}

/**
 * One sector's anchor-denominated revenue and its host country. Both share
 * builders read exactly these two facts; resolving them once per sector in a
 * shared pass keeps the FX lookup, the country fallback and the id string off
 * the per-bucket path.
 */
interface SectorAnchorIndex {
  /** ₳ revenue per sector, in `sectors` order. */
  anchors: number[];
  /** Host country per sector (absent when neither the row nor its state names one). */
  countries: (CountryId | undefined)[];
}

function sectorAnchorIndex(
  sectors: readonly CorporateSector[],
  stateById: ReadonlyMap<string, Pick<State, "_id" | "gdp" | "countryId">>,
  exchangeRatesByCurrency: ReadonlyMap<CurrencyCode, number>
): SectorAnchorIndex {
  const anchors = new Array<number>(sectors.length);
  const countries = new Array<CountryId | undefined>(sectors.length);
  for (let i = 0; i < sectors.length; i++) {
    const sector = sectors[i]!;
    const hostCountryId =
      (sector.countryId as CountryId | undefined) ??
      (stateById.get(sector.stateId)?.countryId as CountryId | undefined);
    countries[i] = hostCountryId;
    const hostCode = resolveSectorHostCurrencyCode({ countryId: hostCountryId }, null);
    const hostRate = fxRateForSectorHostFromMap(
      { countryId: hostCountryId },
      null,
      exchangeRatesByCurrency
    );
    anchors[i] = readCorpEconomicAnchor(shareRevenueLocal(sector), hostCode, hostRate);
  }
  return { anchors, countries };
}

/** One string per sector: the (state, operating lane) cell its revenue belongs to. */
function localBucketKeys(sectors: readonly CorporateSector[]): string[] {
  const keys = new Array<string>(sectors.length);
  for (let i = 0; i < sectors.length; i++) {
    const sector = sectors[i]!;
    keys[i] = `${sector.stateId}::${sector.sectorType}`;
  }
  return keys;
}

function localShareFromIndex(
  sectors: readonly CorporateSector[],
  index: SectorAnchorIndex
): Map<string, number> {
  // Market share is a sector's revenue over the TOTAL real revenue produced in
  // its (state, sectorType) cell — its slice of the actual market, not of an
  // "unowned pool" of demand nobody earns. Cell revenue sums
  // across every producer (player AND NPP), so shares in a cell add to 100%.
  const bucketKeyBySector = localBucketKeys(sectors);
  const ownedRevenueByBucket = new Map<string, number>();
  for (let i = 0; i < sectors.length; i++) {
    const key = bucketKeyBySector[i]!;
    ownedRevenueByBucket.set(key, (ownedRevenueByBucket.get(key) ?? 0) + index.anchors[i]!);
  }
  const marketShareBySectorId = new Map<string, number>();
  for (let i = 0; i < sectors.length; i++) {
    const market = ownedRevenueByBucket.get(bucketKeyBySector[i]!) ?? 0;
    marketShareBySectorId.set(
      sectors[i]!._id.toString(),
      computeMarketSharePercent(index.anchors[i]!, market)
    );
  }
  return marketShareBySectorId;
}

/**
 * Build a sectorId → marketSharePercent map across every sector. Used by the
 * turn processor so per-sector growth-cost dominance penalties can be applied
 * consistently with what the player-facing routes display.
 */
export function buildMarketShareBySectorId(
  inputs: BuildSectorMarketShareInputs
): Map<string, number> {
  const { sectors, stateById, exchangeRatesByCurrency } = inputs;
  return localShareFromIndex(
    sectors,
    sectorAnchorIndex(sectors, stateById, exchangeRatesByCurrency)
  );
}

/**
 * Per-sector NATIONAL dominance share: the owning corp's aggregate share of
 * the whole (countryId, sectorType) market, summed across every state.
 *
 * The local map lets a national champion spread thin and dodge antitrust; this
 * feeds a parallel toll so the turn engine charges on `max(local, national)`.
 *
 * Revenue-basis on purpose: share is a ratio so era units cancel, and
 * antitrust cares about economic weight. Denominator is the sum of each state's
 * owned revenue, matching the local market definition.
 *
 * SOE exemption is applied by the caller.
 */
export function buildNationalDominanceShareBySectorId(
  inputs: BuildSectorMarketShareInputs
): Map<string, number> {
  const { sectors, stateById, exchangeRatesByCurrency } = inputs;
  return nationalShareFromIndex(
    sectors,
    sectorAnchorIndex(sectors, stateById, exchangeRatesByCurrency),
    stateById
  );
}

function nationalShareFromIndex(
  sectors: readonly CorporateSector[],
  index: SectorAnchorIndex,
  stateById: ReadonlyMap<string, Pick<State, "_id" | "gdp" | "countryId">>
): Map<string, number> {
  // National market = Σ over the country's states of each (state, sectorType)
  // cell's TOTAL real revenue. Same definition as the local
  // builder: the denominator is what every producer actually earns, not an
  // unowned pool of unclaimed demand. A national champion's share is its revenue
  // over the sum of real revenue in that sector across the country.
  const nationalMarketByKey = new Map<string, number>();
  for (let i = 0; i < sectors.length; i++) {
    const sector = sectors[i]!;
    if (!stateById.has(sector.stateId)) continue;
    const countryId = index.countries[i];
    if (!countryId) continue;
    const key = `${countryId}::${sector.sectorType}`;
    nationalMarketByKey.set(key, (nationalMarketByKey.get(key) ?? 0) + index.anchors[i]!);
  }

  // Corp's national revenue per (corp, country, sectorType).
  const corpNatRevByKey = new Map<string, number>();
  for (let i = 0; i < sectors.length; i++) {
    const sector = sectors[i]!;
    const corpId = sector.corporationId?.toString();
    if (!corpId) continue;
    const countryId = index.countries[i];
    if (!countryId) continue;
    const key = `${corpId}::${countryId}::${sector.sectorType}`;
    corpNatRevByKey.set(key, (corpNatRevByKey.get(key) ?? 0) + index.anchors[i]!);
  }

  const nationalShareBySectorId = new Map<string, number>();
  for (let i = 0; i < sectors.length; i++) {
    const sector = sectors[i]!;
    const sectorId = sector._id.toString();
    const corpId = sector.corporationId?.toString();
    const countryId = index.countries[i];
    if (!corpId || !countryId) {
      nationalShareBySectorId.set(sectorId, 0);
      continue;
    }
    const corpRev = corpNatRevByKey.get(`${corpId}::${countryId}::${sector.sectorType}`) ?? 0;
    const market = nationalMarketByKey.get(`${countryId}::${sector.sectorType}`) ?? 0;
    nationalShareBySectorId.set(sectorId, computeMarketSharePercent(corpRev, market));
  }
  return nationalShareBySectorId;
}

/**
 * Both share maps from one sector pass. The turn needs the local and national
 * share together and they read the same per-sector anchor and host country, so
 * building them separately resolved the FX rate, the id string and the bucket
 * key twice over every sector.
 */
export function buildSectorShareMaps(inputs: BuildSectorMarketShareInputs): {
  marketShareBySectorId: Map<string, number>;
  nationalDominanceShareBySectorId: Map<string, number>;
} {
  const { sectors, stateById, exchangeRatesByCurrency } = inputs;
  const index = sectorAnchorIndex(sectors, stateById, exchangeRatesByCurrency);
  return {
    marketShareBySectorId: localShareFromIndex(sectors, index),
    nationalDominanceShareBySectorId: nationalShareFromIndex(sectors, index, stateById),
  };
}

/**
 * Compute market share for a single sector by querying the DB for siblings in
 * the same (state, sectorType). Used by one-off API routes (growth /
 * adjust-growth) where building the global lookup would be wasteful.
 *
 * Returns 0 when the state cannot be found — the caller's growth-cost preview
 * then matches the legacy formula instead of incorrectly penalizing.
 */
export async function fetchSectorMarketSharePercent(
  db: Db,
  sector: Pick<
    CorporateSector,
    | "_id"
    | "stateId"
    | "sectorType"
    | "revenue"
    | "countryId"
    | "capitalStock"
    | "plantCount"
    | "strategyId"
  >,
  // Retained for call-site compatibility; sector revenue is now denominated in
  // its host-state currency, so the owning corp's FX context is no longer used.
  _owningCorp: CorpCapitalCurrencyInfo,
  /**
   * Share basis override. Leave undefined and the tier is resolved from the db
   * handle this function already holds.
   *
   * A default no caller overrides would be a silent wrong answer (plants worlds
   * would compute every share on the legacy revenue basis), so the function
   * resolves it itself.
   */
  // Retained for call-site compatibility. Market share is revenue-basis in every
  // tier now, so the tier does not select a basis.
  _plantsEnabledOverride?: boolean
): Promise<number> {
  const { loadFxRatesByCurrency } = await import("@/lib/currency/corporationCapital");

  const [state, siblingSectors, fxByCurrency] = await Promise.all([
    statesCollection(db).findOne(
      { _id: sector.stateId },
      { projection: { _id: 1, gdp: 1, countryId: 1 } }
    ),
    corporateSectorsCollection(db)
      .find(
        { stateId: sector.stateId, sectorType: sector.sectorType },
        {
          projection: {
            _id: 1,
            revenue: 1,
            capitalStock: 1,
            plantCount: 1,
            corporationId: 1,
            sectorType: 1,
          },
        }
      )
      .toArray(),
    loadFxRatesByCurrency(db),
  ]);

  if (!state) return 0;
  const countryId = (sector.countryId as CountryId | undefined) ?? (state.countryId as CountryId);

  // Every sibling sector is in the same state (same host country), so they all
  // share one host-state functional currency — the currency their revenue is
  // stored in regardless of owner. Resolve the ₳ rate once from the host country.
  const hostCode = resolveSectorHostCurrencyCode({ countryId }, null);
  const hostRate = fxRateForSectorHostFromMap({ countryId }, null, fxByCurrency);

  // Market share = this sector's revenue over the TOTAL real revenue in its
  // (state, sectorType) cell. No unowned pool, no GDP floor, no
  // capacity-units twin — the denominator is what every producer actually earns.
  // Matches buildMarketShareBySectorId exactly.
  let cellRevenue = 0;
  let thisSectorAnchor = 0;
  for (const s of siblingSectors) {
    const anchor = readCorpEconomicAnchor(shareRevenueLocal(s), hostCode, hostRate);
    cellRevenue += anchor;
    if (s._id.toString() === sector._id.toString()) {
      thisSectorAnchor = anchor;
    }
  }
  // Fallback: if the focal sector wasn't in the siblings query result (race),
  // normalize it directly at the same host rate and include it in the cell total.
  if (thisSectorAnchor === 0) {
    thisSectorAnchor = readCorpEconomicAnchor(shareRevenueLocal(sector), hostCode, hostRate);
    cellRevenue += thisSectorAnchor;
  }

  return computeMarketSharePercent(thisSectorAnchor, cellRevenue);
}

/**
 * Compute one corporation's aggregate revenue share in each requested
 * (country, sectorType) market. This is the API-route twin of
 * {@link buildNationalDominanceShareBySectorId}; turn processing should keep
 * using its already-loaded global snapshot.
 *
 * The query is state-scoped rather than trusting `corporateSectors.countryId`
 * so pre-migration rows without that denormalized field still count. Countries
 * with no real sector revenue are returned as 0.
 */
export async function fetchCorporationNationalSectorSharesByCountry(
  db: Db,
  inputs: {
    corporationId: Corporation["_id"];
    sectorType: CorporateSector["sectorType"];
    countryIds: readonly CountryId[];
  }
): Promise<Map<CountryId, number>> {
  const countryIds = [...new Set(inputs.countryIds)];
  const result = new Map<CountryId, number>(countryIds.map((countryId) => [countryId, 0]));
  if (countryIds.length === 0) return result;

  const states = await statesCollection(db)
    .find({ countryId: { $in: countryIds } }, { projection: { _id: 1, countryId: 1 } })
    .toArray();
  const countryByStateId = new Map(
    states.map((state) => [state._id, state.countryId as CountryId])
  );
  const stateIds = [...countryByStateId.keys()];
  if (stateIds.length === 0) return result;

  const nationalSectors = await corporateSectorsCollection(db)
    .find(
      {
        $or: stateIds.map(
          (stateId) => ({ stateId, sectorType: inputs.sectorType }) as Filter<CorporateSector>
        ),
      },
      {
        projection: {
          corporationId: 1,
          stateId: 1,
          sectorType: 1,
          revenue: 1,
          capitalStock: 1,
          plantCount: 1,
        },
      }
    )
    .toArray();

  const shareByMarket = buildCorporationNationalRevenueShareByMarket(
    nationalSectors,
    countryByStateId
  );
  for (const countryId of countryIds) {
    result.set(
      countryId,
      shareByMarket.get(
        corporationNationalSectorShareKey(inputs.corporationId, countryId, inputs.sectorType)
      ) ?? 0
    );
  }
  return result;
}

/** One-country convenience wrapper for build and founding commands. */
export async function fetchCorporationNationalSectorSharePercent(
  db: Db,
  inputs: {
    corporationId: Corporation["_id"];
    countryId: CountryId;
    sectorType: CorporateSector["sectorType"];
  }
): Promise<number> {
  const shares = await fetchCorporationNationalSectorSharesByCountry(db, {
    corporationId: inputs.corporationId,
    sectorType: inputs.sectorType,
    countryIds: [inputs.countryId],
  });
  return shares.get(inputs.countryId) ?? 0;
}

/**
 * Count distinct rival corporations holding a sector in the same
 * (state, sectorType) cell. Excludes the building corp's own sectors, so a
 * sole occupant returns 0. Feeds `dominanceDensityFactor`. Returns null when
 * the count cannot be established; callers read null as "crowded" (full toll).
 */
export async function fetchSectorCompetitorCount(
  db: Db,
  sector: Pick<CorporateSector, "stateId" | "sectorType">,
  owningCorporationId: Corporation["_id"]
): Promise<number | null> {
  try {
    const corpIds = await corporateSectorsCollection(db).distinct("corporationId", {
      stateId: sector.stateId,
      sectorType: sector.sectorType,
    });
    const own = owningCorporationId?.toString();
    return corpIds.filter((id) => id != null && id.toString() !== own).length;
  } catch {
    return null;
  }
}

/**
 * Batched market share for a set of sectors — one set of DB queries covering all
 * the (state, sectorType) buckets the sectors span, then a single pure pass.
 * Returns sectorId → share percent (0–100) for each input sector. Used where a
 * caller needs several sectors' shares at once (e.g. the privatization wizard's
 * per-sector carve cap) without N separate FX loads.
 */
export async function fetchMarketSharePercentForSectors(
  db: Db,
  targetSectors: Array<
    Pick<
      CorporateSector,
      | "_id"
      | "stateId"
      | "sectorType"
      | "revenue"
      | "countryId"
      | "corporationId"
      | "capitalStock"
      | "plantCount"
    >
  >,
  /** @deprecated Ignored. Share is revenue-basis in every tier. */
  _plantsEnabled: boolean = false
): Promise<Map<string, number>> {
  if (targetSectors.length === 0) return new Map();
  const { loadFxRatesByCurrency } = await import("@/lib/currency/corporationCapital");

  const stateIds = [...new Set(targetSectors.map((s) => s.stateId))];
  const bucketFilters = targetSectors.map((s) => ({
    stateId: s.stateId,
    sectorType: s.sectorType,
  }));

  // Sibling sectors across the spanned buckets (a superset; buildMarketShareBySectorId
  // buckets precisely by (state, sectorType), so non-target buckets don't pollute).
  const [siblingSectors, states, fxByCurrency] = await Promise.all([
    corporateSectorsCollection(db)
      .find(
        { $or: bucketFilters },
        {
          projection: {
            _id: 1,
            stateId: 1,
            sectorType: 1,
            countryId: 1,
            revenue: 1,
            capitalStock: 1,
            plantCount: 1,
          },
        }
      )
      .toArray(),
    statesCollection(db)
      .find({ _id: { $in: stateIds } }, { projection: { _id: 1, gdp: 1, countryId: 1 } })
      .toArray(),
    loadFxRatesByCurrency(db),
  ]);

  const shareByAll = buildMarketShareBySectorId({
    sectors: siblingSectors,
    stateById: new Map(states.map((s) => [s._id, s])),
    exchangeRatesByCurrency: fxByCurrency,
  });

  const result = new Map<string, number>();
  for (const s of targetSectors) {
    result.set(s._id.toString(), shareByAll.get(s._id.toString()) ?? 0);
  }
  return result;
}

/**
 * Compute defender + attacker market shares in a single (state, sectorType)
 * cell with one set of DB queries. Used by attack routes that need both shares
 * to apply the underdog amplifier on top of the dominance multiplier. Returns
 * 0 for the attacker share when the attacker has no presence in the cell.
 */
export async function fetchAttackerDefenderShares(
  db: Db,
  targetSector: Pick<
    CorporateSector,
    | "_id"
    | "stateId"
    | "sectorType"
    | "countryId"
    | "revenue"
    | "capitalStock"
    | "plantCount"
    | "strategyId"
  >,
  // Retained for call-site compatibility; sector revenue is now denominated in
  // its host-state currency, so the defender corp's FX context is no longer used.
  _defenderCorp: CorpCapitalCurrencyInfo,
  attackerCorpId: import("mongodb").ObjectId,
  // Retained for call-site compatibility. Market share is revenue-basis in every
  // tier now, so the tier does not select a basis.
  _plantsEnabled: boolean = false
): Promise<{ defenderSharePercent: number; attackerSharePercent: number }> {
  const { loadFxRatesByCurrency } = await import("@/lib/currency/corporationCapital");

  const [state, siblingSectors, fxByCurrency] = await Promise.all([
    statesCollection(db).findOne(
      { _id: targetSector.stateId },
      { projection: { _id: 1, gdp: 1, countryId: 1 } }
    ),
    corporateSectorsCollection(db)
      .find(
        { stateId: targetSector.stateId, sectorType: targetSector.sectorType },
        {
          projection: {
            _id: 1,
            corporationId: 1,
            revenue: 1,
            capitalStock: 1,
            plantCount: 1,
            sectorType: 1,
          },
        }
      )
      .toArray(),
    loadFxRatesByCurrency(db),
  ]);

  if (!state) return { defenderSharePercent: 0, attackerSharePercent: 0 };
  const countryId =
    (targetSector.countryId as CountryId | undefined) ?? (state.countryId as CountryId);

  // Every sibling is in the same state (same host country), so they share one
  // host-state functional currency — resolve the ₳ rate once from the country.
  const hostCode = resolveSectorHostCurrencyCode({ countryId }, null);
  const hostRate = fxRateForSectorHostFromMap({ countryId }, null, fxByCurrency);

  // Defender/attacker shares of the cell's TOTAL real revenue,
  // the same denominator every other share reads.
  let cellRevenue = 0;
  let defenderAnchor = 0;
  let attackerAnchor = 0;
  const attackerIdStr = attackerCorpId.toString();
  for (const s of siblingSectors) {
    const anchor = readCorpEconomicAnchor(shareRevenueLocal(s), hostCode, hostRate);
    cellRevenue += anchor;
    if (s._id.toString() === targetSector._id.toString()) {
      defenderAnchor = anchor;
    }
    if (s.corporationId.toString() === attackerIdStr) {
      attackerAnchor += anchor;
    }
  }
  // Race fallback: if the target sector wasn't yet visible in the siblings
  // query, normalize its revenue directly at the same host rate.
  if (defenderAnchor === 0) {
    defenderAnchor = readCorpEconomicAnchor(shareRevenueLocal(targetSector), hostCode, hostRate);
    cellRevenue += defenderAnchor;
  }

  return {
    defenderSharePercent: computeMarketSharePercent(defenderAnchor, cellRevenue),
    attackerSharePercent: computeMarketSharePercent(attackerAnchor, cellRevenue),
  };
}
