import { clearCommodityMarket } from "@/lib/market/clearCommodityBook";
export { clearCommodityMarket } from "@/lib/market/clearCommodityBook";
import { autoPosture, isClearingBookBreach } from "@/lib/market/clearingDiagnostics";
export {
  autoPosture,
  isClearingBookBreach,
  describeClearingBookBreach,
} from "@/lib/market/clearingDiagnostics";
import type {
  ClearingSeller,
  SectorClearingInput,
  ClearingBookDiagnostic,
  SectorClearingResult,
} from "@/lib/market/clearingTypes";
export type {
  ClearingSeller,
  SectorClearingInput,
  ClearingBookDiagnostic,
  SectorClearingResult,
} from "@/lib/market/clearingTypes";
import { offerPriceFactor } from "./rules/offerPricing";
import {
  guardedPricingPosture,
  isDumpingGuarded,
} from "@/lib/corporations/rules/commodityDominanceRamp";
import type { GroupForecastBasis } from "@/lib/corporations/groups/rules/forecast";
import {
  coordinateGroupMarket,
  coordinationSlices,
  type CoordinationBuyer,
  type GroupMarketReceipt,
} from "@/lib/corporations/groups/rules/marketCoordination";
import type { SupplyMember } from "@/lib/corporations/groups/rules/supply";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import {
  reserveInternalSupply,
  finishInternalSupplyCommodity,
  type InternalSupplyClearing,
  type InternalSupplyContextBuyer,
} from "./internalSupply/clearing";
import { normalizedOfferShare } from "./rules/demandAllocation";
import { appendToBook, indexRowsById } from "./rules/bookAssembly";
import { commodityMixWeights, mixWeightFor } from "./rules/commodityMixWeights";
import { placementRevenueLeg } from "./placementRevenuePhase";
import { capDeliveredMediaUnits, type MediaOwnershipMarket } from "@/lib/mediaRegulation/rules";
import { COMMODITY_BASE_PRICES, type CommodityType } from "@/lib/constants/commodities";
import { priceRealizationFactor } from "@/lib/market/priceRealization";

import { isStateScopedCommodity, supplyAgreementScopeKey } from "@/lib/market/commodityMarketScope";

/**
 * Market clearing, Tier 3 of the structural market rework.
 *
 * Sellers post a price relative to market (their **pricing posture**,
 * −20%…+20%) and per commodity the (lagged) demand fills sellers
 * cheapest-first. Undercutting fills your order book before rivals';
 * premium posture skims more per unit but sells last and can go unsold in a
 * glut. This is the moment "lower your margin to sell more" becomes
 * literally true.
 *
 * A sector's revenue leg per output commodity becomes:
 *
 *   legFactor = soldFraction × (1 + posture) × priceRealizationFactor(price/base)
 *
 * i.e. volume × your price choice × the macro price level (clearing subsumes
 * the plain realization multiplier when on). Sector factor is the
 * supply-rate-weighted mean across outputs, ramped in per sector via the
 * shared 240-turn window.
 *
 * Demand is the PRIOR turn's aggregate (lagged, like every market input in
 * this rework), so clearing can't feed back on itself within a turn.
 */

/** Namespace prefix for state-scoped clearing books. */
const STATE_GROUP_PREFIX = "state:";
const MISSING_STATE_GROUP_PREFIX = "missing-state:";

export {
  PRICING_POSTURE_MIN,
  PRICING_POSTURE_MAX,
  clampPricingPosture,
  costPlusPriceFactor,
} from "./costPlusPricing/rules";
import { clampPricingPosture, costPlusPriceFactor } from "./costPlusPricing/rules";

/**
 * Quality → premium pricing coupling (Package B, qualityPremiumPricingEnabled).
 *
 * Output quality was designed to feed the premium-pricing strategy: a corp that
 * posts a premium price (positive posture) should be REWARDED for high output
 * quality and PENALIZED for low quality — buyers pay up for a quality brand and
 * balk at a premium on a shoddy one. `qualityPremiumMultiplier` scales the
 * PREMIUM portion of the posture (never the base price, never an undercut) by a
 * factor centred on 1.0 at neutral quality (`QUALITY_PREMIUM_REF` = 50, the
 * mid-scale used everywhere in brandQuality). Deliberately conservative: at the
 * ±0.2 posture cap and quality 100, the realized premium widens from +0.20 to
 * at most +0.26 (mult 1.3); at quality 0 it shrinks to +0.14 (mult 0.7).
 */
export {
  QUALITY_PREMIUM_REF,
  QUALITY_PREMIUM_STRENGTH,
  QUALITY_PREMIUM_MULT_MIN,
  QUALITY_PREMIUM_MULT_MAX,
  qualityPremiumMultiplier,
} from "./rules/offerPricing";

/** Plants contract-fill basis, else the open-market offer. */
function sellerContractFillBasis(s: ClearingSeller): number {
  return typeof s.contractFillUnits === "number" &&
    Number.isFinite(s.contractFillUnits) &&
    s.contractFillUnits >= 0
    ? s.contractFillUnits
    : Math.max(0, s.units);
}

/**
 * Run the clearing pass across every selling sector for every commodity.
 * Pure: consumes lagged balances/prices, returns per-sector factors.
 */
export function computeClearingFactors(args: {
  sectors: readonly SectorClearingInput[];
  /** Optional own-group supply policy, inert when omitted. */
  internalSupply?: InternalSupplyClearing;
  /** Enabled ownership laws constrain actual advertising fills before receipts. */
  mediaOwnership?: MediaOwnershipMarket;
  recordDelivery?: boolean;
  /** NPP-only internal allocations; absent leaves legacy clearing unchanged. */
  groupSupply?: {
    turn: number;
    activeRoots?: ReadonlySet<string>;
    localInputAvailabilityByState?: ReadonlyMap<string, ReadonlyMap<CommodityType, number>>;
    localBalancesByState?: ReadonlyMap<string, ReadonlyMap<CommodityType, { demand: number }>>;
    forecastByRoot?: Map<string, GroupForecastBasis>;
    members: readonly SupplyMember[];
    buyersByCommodity: ReadonlyMap<CommodityType, readonly CoordinationBuyer[]>;
    locationBySector: ReadonlyMap<string, { countryId: string; stateId: string }>;
    physicalBySectorCommodity: ReadonlyMap<string, ReadonlyMap<CommodityType, number>>;
    receipts: GroupMarketReceipt[];
    committedOutputBySector?: Map<string, Map<string, number>>;
    availabilityBySector: Map<string, Map<CommodityType, number>>;
    inputAllocationsBySector?: Map<
      string,
      Map<
        CommodityType,
        import("@/lib/corporations/groups/rules/inputPricing").GroupInputAllocation
      >
    >;
  };
  /** Lagged per-commodity aggregate balances (prior turn). */
  balances: ReadonlyMap<CommodityType, { supply: number; demand: number }>;
  /** Lagged price-over-base ratios (prior turn). */
  priceRatioByCommodity: ReadonlyMap<CommodityType, number>;
  basePrices: Record<CommodityType, number>;
  /** Optional book-sanity hook — called once per cleared commodity. */
  onBookDiagnostic?: (d: ClearingBookDiagnostic) => void;
  /**
   * Commodities whose lagged price row was written by a prior market turn.
   * A reset seeds turn-0 price rows with zero supply/demand; comparing a new
   * producer against that placeholder is not a supply-ledger invariant check.
   * Omitted by standalone callers to retain the existing comparison behavior.
   */
  initializedLaggedBooks?: ReadonlySet<CommodityType>;
  /**
   * Brand-loyalty slice (A2b, brandLoyaltySliceEnabled). When true, each
   * commodity runs a loyal-slice pre-pass off sectors' `brandLoyalty` before
   * cheapest-first. Omitted/false ⇒ clearing is byte-identical to today.
   */
  loyaltySliceEnabled?: boolean;
  /**
   * Private supply agreements (supplyAgreementsEnabled). Per supplier corp, the
   * contracted output units per scope key. computeClearingFactors distributes
   * each corp's contracted volume across its selling sectors for that commodity
   * and guarantees their fill before loyalty/cheapest-first.
   *
   * Keys are {@link supplyAgreementScopeKey}: a bare commodity is a
   * corporation-wide reservation split across every book the corp sells in;
   * `commodity@stateId` is a state-scoped reservation that lands only in that
   * state's book, on that state's sectors.
   */
  contractedByCorpCommodity?: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** sectorId → owning corpId, required to resolve contracts to sectors. */
  sectorCorpId?: ReadonlyMap<string, string>;
  /**
   * Optional settlement sink: supplier corpId → scope key → contracted units
   * that ACTUALLY cleared this pass. The caller uses it to settle the bilateral
   * price premium (a contract-for-difference) as a separate cash transfer, so
   * the revenue/tax/share-price legs stay untouched. Keyed exactly like
   * `contractedByCorpCommodity`.
   */
  contractSettlementOut?: Map<string, Map<string, number>>;
  /**
   * Optional production sink: supplier corpId → commodity → the units that corp
   * actually OFFERED this pass (under plants, its real produced units for that
   * commodity). The settlement pass uses it to tell a delivery shortfall caused
   * by under-production — the seller's fault, penalised — apart from one caused
   * by weak market demand, which is nobody's breach. Requires `sectorCorpId`.
   */
  producedUnitsOut?: Map<string, Map<CommodityType, number>>;
  /**
   * Quality → premium coupling (qualityPremiumPricingEnabled). When true, each
   * sector's `outputQuality` scales the premium portion of a positive posture
   * in the revenue leg. Omitted/false ⇒ the revenue leg is byte-identical.
   */
  qualityPremiumEnabled?: boolean;
  /**
   * Plants tier: sellers offer their measured `producedUnits` (split across the
   * output mix) rather than revenue-derived nameplate units. Omitted/false ⇒
   * the book is byte-identical to today for every other mode.
   */
  plantsEnabled?: boolean;
  /**
   * Control-group root per corporation. When present, the dumping guard sums a
   * firm's sold units over its whole control group, so splitting output across
   * subsidiaries does not dodge it. Omitted ⇒ each corporation on its own.
   */
  controlRootByCorpId?: ReadonlyMap<string, string>;
  /**
   * Market partition (era worlds, marketPartition): sectorId → market-group key
   * (the seller's home country). Together with `balancesByGroup`, each
   * commodity clears one book PER GROUP against that group's reachable
   * balances (see market/tradePartition.ts) instead of a single worldwide
   * book — a seller behind an embargo wall competes only for the demand its
   * country can reach. Sectors absent from the map, or groups without a
   * balance entry, fall back to the worldwide `balances`. Omitted ⇒ one
   * worldwide book, byte-identical to today.
   */
  groupBySector?: ReadonlyMap<string, string>;
  /** Per-group lagged balances (group key → commodity → {supply, demand}). */
  balancesByGroup?: ReadonlyMap<
    string,
    ReadonlyMap<CommodityType, { supply: number; demand: number }>
  >;
  /**
   * Per-group lagged price-over-base ratios (group key → commodity → ratio).
   * When partitioned, a seller's price-realization leg reads its own market's
   * reachable price, not the worldwide `priceRatioByCommodity` — otherwise a
   * seller in a locally-short, globally-glutted market realizes glut revenue
   * on shortage volume. Groups/commodities absent here fall back to the
   * worldwide ratio, so the map may be sparse.
   */
  priceRatioByGroup?: ReadonlyMap<string, ReadonlyMap<CommodityType, number>>;
  /**
   * State-local market context. Omit the whole context to preserve the legacy
   * reachable-book behavior, for example while a legacy freight supply
   * agreement still requires corporation-wide settlement. Once present, a
   * state-local seller with missing location data fails closed into a zero-
   * demand book rather than claiming aggregate demand already used elsewhere.
   */
  /**
   * Revenue-follows-placement phase-in progress, 0..1 (see
   * market/placementRevenuePhase). 0 or absent keeps the sold fraction
   * measured against the placement-shrunk offer, as before.
   */
  placementRevenuePhase?: number;
  stateMarkets?: {
    /** sectorId → host stateId. */
    stateBySector: ReadonlyMap<string, string>;
    /** stateId → commodity → lagged supply and demand. */
    balances: ReadonlyMap<string, ReadonlyMap<CommodityType, { supply: number; demand: number }>>;
    /** stateId → commodity → lagged price-over-base ratio. */
    priceRatios: ReadonlyMap<string, ReadonlyMap<CommodityType, number>>;
  };
}): Map<string, SectorClearingResult> {
  const { sectors, balances, priceRatioByCommodity, basePrices, onBookDiagnostic } = args;

  // States and countries share an id space (DE is both Delaware and Germany),
  // so a state book gets a namespaced group key that cannot collide with a
  // country group.
  const stateGroupKey = (stateId: string) => `${STATE_GROUP_PREFIX}${stateId}`;
  /** The seller's known state when this commodity clears state-locally. */
  const stateScopeFor = (commodity: CommodityType, sectorId: string): string | null => {
    if (!args.stateMarkets || !isStateScopedCommodity(commodity)) return null;
    return args.stateMarkets.stateBySector.get(sectorId) ?? null;
  };
  const bookKeyFor = (commodity: CommodityType, sectorId: string): string => {
    const stateId = stateScopeFor(commodity, sectorId);
    if (stateId != null) return stateGroupKey(stateId);
    if (args.stateMarkets && isStateScopedCommodity(commodity)) {
      return `${MISSING_STATE_GROUP_PREFIX}${sectorId}`;
    }
    return args.groupBySector?.get(sectorId) ?? "";
  };
  const balanceForBook = (book: string, commodity: CommodityType) => {
    if (book.startsWith(STATE_GROUP_PREFIX)) {
      return args.stateMarkets?.balances.get(book.slice(STATE_GROUP_PREFIX.length))?.get(commodity);
    }
    if (book.startsWith(MISSING_STATE_GROUP_PREFIX)) return undefined;
    return (
      (book !== "" ? args.balancesByGroup?.get(book)?.get(commodity) : undefined) ??
      balances.get(commodity)
    );
  };
  const realizedPriceFor = (commodity: CommodityType, sectorId: string) => {
    const stateScope = stateScopeFor(commodity, sectorId);
    const group = args.groupBySector?.get(sectorId);
    return priceRealizationFactor(
      (stateScope != null
        ? args.stateMarkets?.priceRatios.get(stateScope)?.get(commodity)
        : undefined) ??
        (group != null ? args.priceRatioByGroup?.get(group)?.get(commodity) : undefined) ??
        priceRatioByCommodity.get(commodity)
    );
  };

  // Loyal-slice lookup (seller id === sectorId), built only when the slice is on.
  const loyaltyBySectorId = args.loyaltySliceEnabled
    ? new Map<string, number>(sectors.map((s) => [s.sectorId, Math.max(0, s.brandLoyalty ?? 0)]))
    : undefined;

  // 1) Resolve each sector's effective posture + offered units per commodity.
  const sellersByCommodity = new Map<CommodityType, ClearingSeller[]>();
  const postureBySector = new Map<string, number>();
  const sourceBySector = new Map(sectors.map((s) => [s.sectorId, s]));
  const groupFractionByCommodity = new Map<CommodityType, Map<string, number>>();
  const groupCash = new Map(
    args.groupSupply?.members.map((m) => [m.id, m.cashAvailableAnchor]) ?? []
  );
  for (const s of sectors) {
    const commodities = new Set([
      ...Object.keys(s.supplyRates),
      ...Object.keys(s.outputUnitsByCommodity ?? {}),
    ] as CommodityType[]);
    // The output mix's rate/base weights are one table per sector. Rebuilding
    // them per commodity made the split below O(commodities^2) with a fresh
    // array per leg.
    let mixWeights: Map<CommodityType, number> | undefined;
    const mixWeightForSector = (commodity: CommodityType): number => {
      mixWeights ??= commodityMixWeights(s.supplyRates, basePrices);
      return mixWeightFor(mixWeights, commodity);
    };
    for (const commodity of commodities) {
      const rate = s.supplyRates[commodity] ?? 0;
      const hasExactProductOffer = s.outputUnitsByCommodity != null;
      const productUnits = s.outputUnitsByCommodity?.[commodity];
      if (hasExactProductOffer && productUnits == null) continue;
      if (rate <= 0 && productUnits == null) continue;
      // Auto-posture reads the sector's OWN market's balance when partitioned:
      // a seller in a glutted, embargo-walled market must undercut off its
      // reachable book, not off a healthy worldwide aggregate it cannot sell to.
      // Under state scoping that book is its own state, so a logistics sector
      // in a glutted state undercuts even while the nation looks balanced.
      const bal = balanceForBook(bookKeyFor(commodity, s.sectorId), commodity);
      const posture =
        s.posture != null
          ? clampPricingPosture(s.posture)
          : autoPosture(bal?.demand ?? 0, bal?.supply ?? 0, s.lastSoldFraction);
      postureBySector.set(s.sectorId, posture);
      // Naive nameplate units from revenue. This OVERSTATES a sector's actual
      // output: the supply ledger (computeRawSupplyDemand) applies natcorpScale,
      // outputMultiplier and the extraction capacity haircut on top of the same
      // revenue/base term, so nameplate/base > the units that actually reach the
      // market. The excess is reconciled per-commodity in section 2 by normalizing
      // the book down to the lagged supply (which already carries those factors).
      const base = basePrices[commodity];
      // Plants: the seller offers what its plants MADE last turn, split across
      // the output mix by the same rate/base weights the nameplate uses — so
      // the split is unchanged and only the total is replaced. This is a real
      // measured quantity, not a revenue proxy, which is why it skips the
      // lagged-supply reconciliation in section 2.
      const plantsUnits =
        args.plantsEnabled && hasExactProductOffer && typeof productUnits === "number"
          ? Math.max(0, productUnits)
          : args.plantsEnabled && typeof s.producedUnits === "number" && s.producedUnits >= 0
            ? s.producedUnits * mixWeightForSector(commodity)
            : null;
      const physicalUnits = plantsUnits ?? (base > 0 ? (s.revenue * rate) / base : 0);
      const editorialAvailability =
        commodity === "advertising" && Number.isFinite(s.editorialAdvertisingAvailability)
          ? Math.max(0, Math.min(1, s.editorialAdvertisingAvailability!))
          : 1;
      const productAvailability = Number.isFinite(s.offerAvailabilityByCommodity?.[commodity])
        ? Math.max(0, Math.min(1, s.offerAvailabilityByCommodity?.[commodity] ?? 1))
        : 1;
      const availability = editorialAvailability * productAvailability;
      const placement = s.offerPlacementByCommodity?.[commodity] ?? 1;
      const units = physicalUnits * availability * placement;
      // Extraction contract-fill: same availability/placement/mix as a plants
      // offer would use, without replacing the nameplate `units` or setting realUnits.
      const contractFillPhysical =
        typeof s.contractFillUnits === "number" && s.contractFillUnits >= 0
          ? s.contractFillUnits * mixWeightForSector(commodity)
          : null;
      const contractFillUnits =
        contractFillPhysical != null ? contractFillPhysical * availability * placement : undefined;
      if (
        units <= 0 &&
        !Number.isFinite(s.offerAvailabilityByCommodity?.[commodity]) &&
        !Number.isFinite(s.offerPlacementByCommodity?.[commodity])
      )
        continue;
      appendToBook(sellersByCommodity, commodity, {
        id: s.sectorId,
        units,
        physicalUnits,
        editorialAvailability,
        productAvailability,
        availability,
        posture,
        realUnits: plantsUnits != null,
        ...(contractFillUnits != null ? { contractFillUnits } : {}),
        ...(s.inputCostIndex !== undefined
          ? {
              quotedPosture:
                costPlusPriceFactor(s.inputCostIndex, posture, s.inputCostShare, s.fixedCostShare) /
                  realizedPriceFor(commodity, s.sectorId) -
                1,
            }
          : {}),
      });
    }
  }

  // 1b) Dumping guard. A firm whose sold share of a commodity's world supply is
  //     above DUMPING_GUARD_SOLD_SHARE cannot undercut the market in it: its
  //     negative posture is floored at 0, whether a player set it or autoPosture
  //     chose it. Measured on lagged sold units (offer x last sold fraction)
  //     against the lagged world supply, plants tier only, where offers are
  //     real measured output rather than a revenue proxy.
  if (args.plantsEnabled) {
    for (const [commodity, sellers] of sellersByCommodity) {
      const worldSupply = balances.get(commodity)?.supply ?? 0;
      if (!(worldSupply > 0)) continue;
      const guardKey = (corpId: string): string => args.controlRootByCorpId?.get(corpId) ?? corpId;
      const soldByCorp = new Map<string, number>();
      for (const seller of sellers) {
        const source = sourceBySector.get(seller.id);
        if (!source?.corporationId) continue;
        const sold = seller.units * (source.lastSoldFraction ?? 1);
        const key = guardKey(source.corporationId);
        soldByCorp.set(key, (soldByCorp.get(key) ?? 0) + sold);
      }
      for (const seller of sellers) {
        const corpId = sourceBySector.get(seller.id)?.corporationId;
        if (!corpId || !isDumpingGuarded(soldByCorp.get(guardKey(corpId)) ?? 0, worldSupply))
          continue;
        seller.posture = guardedPricingPosture(seller.posture, true);
        if (seller.quotedPosture !== undefined) {
          seller.quotedPosture = guardedPricingPosture(seller.quotedPosture, true);
        }
        postureBySector.set(seller.id, seller.posture);
      }
    }
  }

  // 2) Clear each commodity market against LAGGED demand. Sellers outside this
  //    pass (unowned pools, imports) are represented by the gap between the
  //    lagged aggregate supply and the units offered here: demand available to
  //    these sellers is scaled by their share of total supply so the pass
  //    doesn't hand corporate sectors the whole market.
  const soldByCommodityBySector = new Map<CommodityType, Map<string, number>>();
  const supplyShareByCommodity = new Map<CommodityType, Map<string, number>>();
  const deliveredByCommodityBySector = new Map<CommodityType, Map<string, number>>();
  // Offered fraction a buyer took but an ownership law refused, kept apart
  // from sold so production feedback does not read a legal limit as no demand.
  const regulationBlockedByCommodityBySector = new Map<CommodityType, Map<string, number>>();
  for (const [commodity, sellers] of args.groupSupply
    ? [...sellersByCommodity].sort(([a], [b]) => a.localeCompare(b))
    : sellersByCommodity) {
    // A seller's clearing book and realized price are pure functions of
    // (commodity, sector) for the whole commodity pass. A state-scoped market
    // clears one book per state, so the same sector is asked again for every
    // book it could belong to; resolving the state, the group and the price
    // ratio on each ask made the pass quadratic in states. Memoise per
    // commodity instead: the maps die with the commodity.
    const bookKeyBySectorId = new Map<string, string>();
    const realizedPriceBySectorId = new Map<string, number>();
    const bookKeyOf = (sectorId: string): string => {
      let key = bookKeyBySectorId.get(sectorId);
      if (key === undefined) {
        key = bookKeyFor(commodity, sectorId);
        bookKeyBySectorId.set(sectorId, key);
      }
      return key;
    };
    const realizedPriceOf = (sectorId: string): number => {
      let price = realizedPriceBySectorId.get(sectorId);
      if (price === undefined) {
        price = realizedPriceFor(commodity, sectorId);
        realizedPriceBySectorId.set(sectorId, price);
      }
      return price;
    };
    // Market partition: split the commodity's sellers into per-group books
    // (seller's home country) and clear each book against ITS reachable
    // balances. Without partition args this is one worldwide group ("") over
    // the aggregate `balances` — the original single-book pass, unchanged.
    const partitioned = new Map<string, ClearingSeller[]>();
    if (args.balancesByGroup || args.stateMarkets) {
      for (const s of sellers) {
        const g = bookKeyOf(s.id);
        appendToBook(partitioned, g, s);
      }
    } else {
      partitioned.set("", sellers);
    }

    // Group buyers by book once so a state-scoped market pays one pass, not one per state.
    if (args.internalSupply && !args.groupSupply && args.sectorCorpId) {
      const buyersByBook = new Map<string, InternalSupplyContextBuyer[]>();
      for (const buyer of args.internalSupply.buyers) {
        const key = bookKeyOf(buyer.sectorId);
        const rows = buyersByBook.get(key);
        if (rows) rows.push(buyer);
        else buyersByBook.set(key, [buyer]);
      }
      args.internalSupply.buyersByBook = buyersByBook;
    }

    for (const [g, groupSellers] of partitioned) {
      const bal = balanceForBook(g, commodity);
      const rawOfferedUnits = groupSellers.reduce((sum, s) => sum + s.units, 0);
      const laggedSupply = bal?.supply ?? 0;
      const normalizable = groupSellers.filter((s) => !s.realUnits);
      const normalizableUnits = normalizable.reduce((sum, s) => sum + s.units, 0);
      const exemptRealUnits = rawOfferedUnits - normalizableUnits;
      // When the nameplate exceeds lagged supply, scale every seller down
      // proportionally so the offered book equals the units that actually reach the
      // market. This makes aggregate corp fill track the true clear rate
      // (min(1, demand/supply)) instead of being depressed by phantom over-supply,
      // while preserving relative seller shares so posture ordering still holds.
      // Sellers offering REAL produced units are exempt: the normalization exists
      // only to undo the nameplate's known overstatement (it omits natcorpScale,
      // outputMultiplier and the extraction haircut that the supply ledger
      // applies). Capacity-derived offers already carry every production leg, so
      // scaling them down would double-count the same haircuts and depress fills.
      if (laggedSupply > 0 && rawOfferedUnits > laggedSupply) {
        const target = laggedSupply - exemptRealUnits;
        if (normalizableUnits > 0 && target > 0 && target < normalizableUnits) {
          const norm = target / normalizableUnits;
          for (const s of normalizable) s.units *= norm;
        } else if (normalizableUnits > 0 && target <= 0) {
          // Exempt (real) offers alone already meet or exceed lagged supply —
          // nothing left of the book for the nameplate sellers to claim.
          for (const s of normalizable) s.units = 0;
        }
      }
      const normalizedOfferedUnits = groupSellers.reduce((sum, s) => sum + s.units, 0);
      const shares = supplyShareByCommodity.get(commodity) ?? new Map<string, number>();
      for (const seller of groupSellers) {
        shares.set(
          seller.id,
          normalizedOfferShare(seller.units, normalizedOfferedUnits, laggedSupply)
        );
      }
      supplyShareByCommodity.set(commodity, shares);
      onBookDiagnostic?.({
        commodity,
        group: g || null,
        rawOfferedUnits,
        normalizedOfferedUnits,
        offeredUnits: normalizedOfferedUnits,
        normalizableUnits,
        exemptRealUnits,
        laggedSupply,
        laggedDemand: bal?.demand ?? 0,
        invariantBreach:
          (args.initializedLaggedBooks?.has(commodity) ?? true) &&
          isClearingBookBreach(normalizedOfferedUnits, laggedSupply),
      });
    }

    // Post-normalization per-corp unit totals ACROSS groups: a corp whose
    // sectors span countries (overseas plants) must have its contracted volume
    // split once, proportional to where its units actually sit — allocating the
    // full volume inside every book it touches would double-count the contract.
    const corpUnitsTotal = new Map<string, number>();
    if (args.contractedByCorpCommodity && args.sectorCorpId) {
      for (const s of sellers) {
        const corpId = args.sectorCorpId.get(s.id);
        if (!corpId) continue;
        corpUnitsTotal.set(corpId, (corpUnitsTotal.get(corpId) ?? 0) + sellerContractFillBasis(s));
      }
    }

    const sold = new Map<string, number>();
    const contractedCorpBySector = new Map<string, string>();
    const contractedShareBySector = new Map<string, number>();
    const contractedTakeBySector = new Map<string, number>();
    // Which reservation(s) a sector's contracted share came from, so the
    // settlement sink can credit a state contract and a corporation-wide one
    // separately. Shares sum to `contractedShareBySector`.
    const contractedKeysBySector = new Map<string, Array<{ key: string; share: number }>>();
    // Each seller's slice of its book's demand, the audience an ownership law
    // measures against.
    const demandSliceBySector = new Map<string, number>();
    for (const [g, groupSellers] of partitioned) {
      const bal = balanceForBook(g, commodity);
      const laggedSupply = bal?.supply ?? 0;
      const offeredUnits = groupSellers.reduce((sum, s) => sum + s.units, 0);
      const totalSupply = Math.max(laggedSupply, offeredUnits);
      const share = totalSupply > 0 ? offeredUnits / totalSupply : 1;
      const demandForPass = (bal?.demand ?? 0) * share;
      for (const s of groupSellers)
        demandSliceBySector.set(
          s.id,
          offeredUnits > 0 ? (demandForPass * s.units) / offeredUnits : 0
        );

      // Contracted allocation: distribute each supplier corp's contracted volume
      // for this commodity across its selling sectors, proportional to their
      // (post-normalization) offered units, capped at each sector's units. This
      // is a RESERVATION, not a ceiling: the contracted units are guaranteed-sold
      // to the buyer, and the sector's surplus above them still clears openly.
      let contractedUnitsById: Map<string, number> | undefined;
      if (args.contractedByCorpCommodity && args.sectorCorpId) {
        contractedUnitsById = new Map<string, number>();
        // A state book also carries the state-scoped reservations addressed to
        // it. Those are whole, not sliced by unit weight: the contract named
        // this state, so its plants here are the only ones that can fill it.
        const bookStateId = g.startsWith(STATE_GROUP_PREFIX)
          ? g.slice(STATE_GROUP_PREFIX.length)
          : null;
        const stateKey =
          bookStateId != null ? supplyAgreementScopeKey(commodity, bookStateId) : null;
        const unitsByCorp = new Map<string, { total: number; sellers: ClearingSeller[] }>();
        for (const s of groupSellers) {
          const corpId = args.sectorCorpId.get(s.id);
          if (!corpId) continue;
          const e = unitsByCorp.get(corpId) ?? { total: 0, sellers: [] };
          e.total += sellerContractFillBasis(s);
          e.sellers.push(s);
          unitsByCorp.set(corpId, e);
        }
        for (const [corpId, e] of unitsByCorp) {
          const byKey = args.contractedByCorpCommodity.get(corpId);
          const contractedAll = byKey?.get(commodity) ?? 0;
          const allUnits = corpUnitsTotal.get(corpId) ?? 0;
          // This group's slice of the corp's corporation-wide volume, by unit weight.
          const wide = allUnits > 0 ? contractedAll * (e.total / allUnits) : 0;
          const stateContracted = stateKey != null ? (byKey?.get(stateKey) ?? 0) : 0;
          const contracted = Math.max(0, wide) + Math.max(0, stateContracted);
          if (contracted <= 0 || e.total <= 0) continue;
          const take = Math.min(contracted, e.total);
          // Both reservations shrink together when the book cannot cover them.
          const fillRatio = take / contracted;
          for (const s of e.sellers) {
            const basis = sellerContractFillBasis(s);
            const sectorShare = (take * basis) / e.total;
            contractedUnitsById.set(s.id, sectorShare);
            contractedCorpBySector.set(s.id, corpId);
            contractedShareBySector.set(s.id, sectorShare);
            const keys: Array<{ key: string; share: number }> = [];
            if (wide > 0)
              keys.push({ key: commodity, share: (wide * fillRatio * basis) / e.total });
            if (stateContracted > 0 && stateKey != null) {
              keys.push({
                key: stateKey,
                share: (stateContracted * fillRatio * basis) / e.total,
              });
            }
            contractedKeysBySector.set(s.id, keys);
          }
        }
      }

      // Existing agreements take precedence. Group allocations consume the same
      // finite offers and anonymous demand, and carry no premium or damages.
      const groupContext = args.groupSupply;
      const groupReserved = new Map<string, number>();
      let groupUnits = 0;
      if (groupContext && args.sectorCorpId && commodity !== "advertising") {
        const buyers = (groupContext.buyersByCommodity.get(commodity) ?? []).filter(
          (b) => bookKeyOf(b.sectorId) === g
        );
        const price =
          (basePrices[commodity] * realizedPriceOf(groupSellers[0]?.id ?? "")) / TURNS_PER_DAY;
        const allSellers = groupSellers.map((s) => ({
          sectorId: s.id,
          memberId: args.sectorCorpId!.get(s.id) ?? "",
          countryId: groupContext.locationBySector.get(s.id)?.countryId ?? "",
          stateId: groupContext.locationBySector.get(s.id)?.stateId ?? "",
          units: s.units,
          committedUnits: contractedUnitsById?.get(s.id) ?? 0,
          physicalUnits: groupContext.physicalBySectorCommodity.get(s.id)?.get(commodity) ?? 0,
        }));
        if (groupContext.committedOutputBySector)
          for (const seller of allSellers) {
            const row =
              groupContext.committedOutputBySector?.get(seller.sectorId) ??
              new Map<string, number>();
            row.set(commodity, seller.committedUnits);
            groupContext.committedOutputBySector?.set(seller.sectorId, row);
          }
        const baselineFill = groupContext.forecastByRoot
          ? clearCommodityMarket(
              demandForPass,
              groupSellers,
              loyaltyBySectorId,
              contractedUnitsById
            )
          : new Map<string, number>();
        for (const [rootId, basis] of groupContext.forecastByRoot ?? []) {
          // Membership is a set test inside two filters; scanning the id list
          // for every seller and buyer made this O(rows x members) per root.
          const memberIds = new Set(basis.memberIds);
          const ownSellers = allSellers.filter((s) => memberIds.has(s.memberId));
          const ownBuyers = buyers.filter((b) => memberIds.has(b.memberId));
          if (!ownSellers.length && !ownBuyers.length) continue;
          if (
            basis.books.length >= 128 ||
            basis.books.reduce((n, b) => n + b.sellers.length + b.buyers.length, 0) +
              ownSellers.length +
              ownBuyers.length >
              2000
          ) {
            basis.complete = false;
            continue;
          }
          const preview = {
            commodity,
            supply: bal?.supply ?? 0,
            demand: bal?.demand ?? 0,
            unitPriceAnchor: price,
            benchmarkFactor: realizedPriceOf(groupSellers[0]?.id ?? ""),
            buyers: ownBuyers,
            sellers: ownSellers.map((s) => {
              return {
                ...s,
                openFill:
                  s.units > s.committedUnits
                    ? Math.max(
                        0,
                        (s.units * (baselineFill.get(s.sectorId) ?? 0) - s.committedUnits) /
                          (s.units - s.committedUnits)
                      )
                    : 0,
                quoteFactor:
                  offerPriceFactor({
                    posture: postureBySector.get(s.sectorId) ?? 0,
                    priceLeg: realizedPriceOf(s.sectorId),
                    qualityPremiumEnabled: args.qualityPremiumEnabled,
                    quality:
                      sourceBySector.get(s.sectorId)?.productQualityByCommodity?.[commodity] ??
                      sourceBySector.get(s.sectorId)?.outputQuality,
                    inputCostIndex: sourceBySector.get(s.sectorId)?.inputCostIndex,
                    inputCostShare: sourceBySector.get(s.sectorId)?.inputCostShare,
                    fixedCostShare: sourceBySector.get(s.sectorId)?.fixedCostShare,
                  }) / realizedPriceOf(s.sectorId),
              };
            }),
          };
          for (const slice of coordinationSlices(
            { ...preview, turn: groupContext.turn, members: groupContext.members },
            groupContext.localInputAvailabilityByState,
            groupContext.localBalancesByState
          )) {
            const rows = slice.sellers.length + slice.buyers.length;
            if (
              basis.books.length >= 128 ||
              basis.books.reduce((n, b) => n + b.sellers.length + b.buyers.length, 0) + rows > 2000
            ) {
              basis.complete = false;
              break;
            }
            basis.books.push({
              ...preview,
              supply: slice.supply,
              demand: slice.demand,
              buyers: slice.buyers,
              sellers: preview.sellers.filter((s) =>
                slice.sellers.some((r) => r.sectorId === s.sectorId)
              ),
            });
          }
          if (rootId !== basis.rootId) basis.complete = false;
        }
        const allocation = coordinateGroupMarket(
          {
            commodity,
            turn: groupContext.turn,
            supply: bal?.supply ?? 0,
            demand: bal?.demand ?? 0,
            unitPriceAnchor: price,
            members: groupContext.members
              .filter((m) => !groupContext.activeRoots || groupContext.activeRoots.has(m.rootId))
              .map((m) => ({
                ...m,
                cashAvailableAnchor: groupCash.get(m.id) ?? 0,
              })),
            buyers,
            sellers: allSellers,
          },
          groupContext.localInputAvailabilityByState,
          groupContext.localBalancesByState
        );
        for (const [id, units] of allocation.reservedBySeller) {
          groupReserved.set(id, units);
          groupUnits += units;
          const seller = groupSellers.find((s) => s.id === id)!;
          const fractions = groupFractionByCommodity.get(commodity) ?? new Map<string, number>();
          fractions.set(id, seller.units > 0 ? units / seller.units : 0);
          groupFractionByCommodity.set(commodity, fractions);
        }
        for (const [id, amount] of allocation.spendByBuyer)
          groupCash.set(id, Math.max(0, (groupCash.get(id) ?? 0) - amount));
        for (const [id, availability] of allocation.availabilityByBuyer) {
          const byCommodity =
            groupContext.availabilityBySector.get(id) ?? new Map<CommodityType, number>();
          byCommodity.set(commodity, availability);
          groupContext.availabilityBySector.set(id, byCommodity);
        }
        for (const receipt of allocation.receipts) {
          if (!groupContext.inputAllocationsBySector) continue;
          const byCommodity =
            groupContext.inputAllocationsBySector.get(receipt.buyerSectorId) ?? new Map();
          const prev = byCommodity.get(commodity);
          const units =
            (receipt.units * basePrices[commodity]) /
            COMMODITY_BASE_PRICES[commodity] /
            TURNS_PER_DAY;
          byCommodity.set(commodity, {
            units: (prev?.units ?? 0) + units,
            marketFactor: realizedPriceOf(receipt.supplierSectorId),
          });
          groupContext.inputAllocationsBySector.set(receipt.buyerSectorId, byCommodity);
        }
        groupContext.receipts.push(...allocation.receipts);
      }
      const internalReservations =
        args.internalSupply && !args.groupSupply && args.sectorCorpId
          ? reserveInternalSupply({
              context: args.internalSupply,
              commodity,
              sellers: groupSellers,
              corporationBySector: args.sectorCorpId,
              committed: contractedUnitsById,
              book: g,
              bookForSector: (id) => bookKeyOf(id),
              supply: Math.min(laggedSupply, offeredUnits),
              demand: bal?.demand ?? 0,
              reservationRoom: Math.max(
                0,
                demandForPass -
                  [...(contractedUnitsById?.values() ?? [])].reduce((n, u) => n + u, 0)
              ),
              marketPrice: basePrices[commodity] * realizedPriceOf(groupSellers[0]?.id ?? ""),
            })
          : undefined;
      const groupSold = clearCommodityMarket(
        Math.max(0, demandForPass - groupUnits),
        groupSellers.map((s) => ({
          ...s,
          units: Math.max(0, s.units - (groupReserved.get(s.id) ?? 0)),
        })),
        loyaltyBySectorId,
        internalReservations ?? contractedUnitsById,
        contractedTakeBySector
      );
      for (const seller of groupSellers) {
        const reserved = groupReserved.get(seller.id) ?? 0;
        if (reserved > 0)
          groupSold.set(
            seller.id,
            Math.min(
              1,
              (reserved + (seller.units - reserved) * (groupSold.get(seller.id) ?? 0)) /
                seller.units
            )
          );
      }
      for (const [id, f] of groupSold) sold.set(id, f);
    }
    if (commodity === "advertising" && args.mediaOwnership) {
      const rows = sellers.flatMap((seller) => {
        const stateId = args.mediaOwnership!.stateBySector.get(seller.id);
        const corporationId = args.mediaOwnership!.corporationBySector.get(seller.id);
        return stateId && corporationId
          ? [
              {
                sectorId: seller.id,
                stateId,
                corporationId,
                units: seller.units * (sold.get(seller.id) ?? 0),
                demandUnits: demandSliceBySector.get(seller.id) ?? 0,
              },
            ]
          : [];
      });
      const capped = capDeliveredMediaUnits(
        rows,
        args.mediaOwnership.shareCap,
        args.mediaOwnership.demandByState,
        args.mediaOwnership.limitUnitsByOwner
      );
      const blocked = new Map<string, number>();
      for (const seller of sellers) {
        const units = capped.get(seller.id);
        if (units === undefined) continue;
        const before = sold.get(seller.id) ?? 0;
        const after = seller.units > 0 ? units / seller.units : 0;
        sold.set(seller.id, after);
        if (before - after > 0) blocked.set(seller.id, before - after);
        // Contract take was recorded before this law trimmed delivery. Cap it
        // so settlement cannot credit units the ownership law excluded.
        const take = contractedTakeBySector.get(seller.id);
        if (take != null) contractedTakeBySector.set(seller.id, Math.min(take, units));
      }
      regulationBlockedByCommodityBySector.set(commodity, blocked);
    }
    if (args.internalSupply && !args.groupSupply)
      finishInternalSupplyCommodity(
        args.internalSupply,
        commodity,
        sold,
        sellers,
        contractedShareBySector,
        regulationBlockedByCommodityBySector.get(commodity)
      );
    soldByCommodityBySector.set(commodity, sold);
    if (args.recordDelivery)
      deliveredByCommodityBySector.set(
        commodity,
        new Map(sellers.map((seller) => [seller.id, seller.units * (sold.get(seller.id) ?? 0)]))
      );

    // Production sink: each corp's offered units for this commodity, recorded
    // BEFORE any fill outcome. Under plants these are real produced units.
    if (args.producedUnitsOut && args.sectorCorpId) {
      for (const s of sellers) {
        const corpId = args.sectorCorpId.get(s.id);
        const available = s.availability ?? s.editorialAvailability ?? 1;
        const productionUnits =
          s.realUnits === true
            ? (s.physicalUnits ?? s.units)
            : available < 1
              ? s.units / available
              : s.units;
        if (!corpId || !(productionUnits > 0)) continue;
        const byCommodity = args.producedUnitsOut.get(corpId) ?? new Map<CommodityType, number>();
        byCommodity.set(commodity, (byCommodity.get(commodity) ?? 0) + productionUnits);
        args.producedUnitsOut.set(corpId, byCommodity);
      }
    }

    // Settlement sink: record the contracted units that actually cleared, per
    // supplier corp, for the caller's bilateral premium settlement.
    if (args.contractSettlementOut && contractedShareBySector.size > 0) {
      // One lookup table per commodity instead of scanning the book for every
      // contracted sector.
      const sellerById = indexRowsById(sellers);
      for (const [sectorId, contractedShare] of contractedShareBySector) {
        const corpId = contractedCorpBySector.get(sectorId);
        if (!corpId) continue;
        const seller = sellerById.get(sectorId);
        const filledFraction = sold.get(sectorId) ?? 0;
        const recordedTake = contractedTakeBySector.get(sectorId);
        const filledUnits = seller
          ? Math.min(
              contractedShare,
              recordedTake != null ? recordedTake : filledFraction * seller.units
            )
          : 0;
        if (filledUnits <= 0) continue;
        const byKey = args.contractSettlementOut.get(corpId) ?? new Map<string, number>();
        // Credit each reservation its share of what actually filled.
        const keys = contractedKeysBySector.get(sectorId) ?? [
          { key: commodity, share: contractedShare },
        ];
        for (const { key, share } of keys) {
          if (!(share > 0)) continue;
          const credited = filledUnits * (share / contractedShare);
          byKey.set(key, (byKey.get(key) ?? 0) + credited);
        }
        args.contractSettlementOut.set(corpId, byKey);
      }
    }
  }

  // 3) Weighted per-sector factor across outputs.
  const internalUnitsByCommodity = new Map<CommodityType, Map<string, number>>();
  for (const trade of (args.groupSupply ? [] : args.internalSupply?.tradesOut) ?? []) {
    const units = internalUnitsByCommodity.get(trade.commodity) ?? new Map<string, number>();
    units.set(trade.supplierSectorId, (units.get(trade.supplierSectorId) ?? 0) + trade.units);
    internalUnitsByCommodity.set(trade.commodity, units);
  }
  const offeredUnitsByCommodity = new Map(
    [...internalUnitsByCommodity.keys()].map((commodity) => [
      commodity,
      new Map((sellersByCommodity.get(commodity) ?? []).map((seller) => [seller.id, seller.units])),
    ])
  );
  const results = new Map<string, SectorClearingResult>();
  for (const s of sectors) {
    let rateSum = 0;
    let factorSum = 0;
    let soldSum = 0;
    let quotedPostureSum = 0;
    const posture = postureBySector.get(s.sectorId) ?? 0;
    // Quality → premium: only a positive (premium) posture is quality-scaled,
    // and only when the caller opted in with a finite quality. The base price
    // and any undercut are untouched, so quality can lift or shave the premium
    // but never let a seller charge below market.
    const soldByCommodity: Partial<Record<CommodityType, number>> = {};
    const marketSupplyShareByCommodity: Partial<Record<CommodityType, number>> = {};
    const deliveredUnitsByCommodity: Partial<Record<CommodityType, number>> = {};
    const offerFactorByCommodity: Partial<Record<CommodityType, number>> = {};
    const revenueWeightByCommodity: Partial<Record<CommodityType, number>> = {};
    const regulationBlockedByCommodity: Partial<Record<CommodityType, number>> = {};
    const editorialAvailabilityByCommodity: Partial<Record<CommodityType, number>> = {};
    let blockedSum = 0;
    const sectorGroup = args.groupBySector?.get(s.sectorId);
    const groupRatios = sectorGroup != null ? args.priceRatioByGroup?.get(sectorGroup) : undefined;
    const outputCommodities = new Set([
      ...Object.keys(s.supplyRates),
      ...Object.keys(s.outputAnchorByCommodity ?? {}),
      ...Object.keys(s.outputUnitsByCommodity ?? {}),
      ...Object.keys(s.projectOutputUnitsByCommodity ?? {}),
    ] as CommodityType[]);
    for (const commodity of outputCommodities) {
      const rate = s.supplyRates[commodity] ?? 0;
      const outputAnchor = s.outputAnchorByCommodity?.[commodity];
      const weight = typeof outputAnchor === "number" ? Math.max(0, outputAnchor) : rate;
      if (weight <= 0) continue;
      const offeredSold = soldByCommodityBySector.get(commodity)?.get(s.sectorId) ?? 1;
      const editorialAvailability =
        commodity === "advertising" && Number.isFinite(s.editorialAdvertisingAvailability)
          ? Math.max(0, Math.min(1, s.editorialAdvertisingAvailability!))
          : 1;
      const productAvailability = Number.isFinite(s.offerAvailabilityByCommodity?.[commodity])
        ? Math.max(0, Math.min(1, s.offerAvailabilityByCommodity?.[commodity] ?? 1))
        : 1;
      const availability = editorialAvailability * productAvailability;
      if (editorialAvailability < 1)
        editorialAvailabilityByCommodity[commodity] = editorialAvailability;
      // Placement shrank the offer; without this leg the sold fraction is a
      // share of that shrunken offer, so output nobody bought was still paid.
      const placementLeg = placementRevenueLeg(
        s.revenuePlacementByCommodity?.[commodity] ?? s.offerPlacementByCommodity?.[commodity],
        args.placementRevenuePhase ?? 0
      );
      const sold = offeredSold * availability * placementLeg;
      // State-scoped legs realize their own state's price. Clearing volume
      // locally while realizing price nationally would leave a seller who
      // relieved a local shortage paid at the glutted national level.
      const stateScope = stateScopeFor(commodity, s.sectorId);
      const stateRatio =
        stateScope != null
          ? args.stateMarkets?.priceRatios.get(stateScope)?.get(commodity)
          : undefined;
      const priceLeg = priceRealizationFactor(
        stateRatio ?? groupRatios?.get(commodity) ?? priceRatioByCommodity.get(commodity)
      );
      const quality = s.productQualityByCommodity?.[commodity] ?? s.outputQuality;
      const offerFactor = offerPriceFactor({
        posture,
        priceLeg,
        qualityPremiumEnabled: args.qualityPremiumEnabled,
        quality,
        inputCostIndex: s.inputCostIndex,
        inputCostShare: s.inputCostShare,
        fixedCostShare: s.fixedCostShare,
      });
      const internalUnits = internalUnitsByCommodity.get(commodity)?.get(s.sectorId) ?? 0;
      const offeredUnits = offeredUnitsByCommodity.get(commodity)?.get(s.sectorId) ?? 0;
      const internalSold =
        offeredUnits > 0 ? Math.min(sold, (internalUnits / offeredUnits) * availability) : 0;
      // Group units realize exactly the benchmark, without posture, quality or cost-plus markup.
      const groupFraction =
        (groupFractionByCommodity.get(commodity)?.get(s.sectorId) ?? 0) * availability;
      const revenueFactor =
        Math.max(0, sold - groupFraction - internalSold) * offerFactor +
        (groupFraction + internalSold) * priceLeg;
      offerFactorByCommodity[commodity] = sold > 0 ? revenueFactor / sold : offerFactor;
      rateSum += weight;
      factorSum += weight * revenueFactor;
      revenueWeightByCommodity[commodity] = weight * revenueFactor;
      quotedPostureSum += weight * (offerFactor / priceLeg - 1);
      soldSum += weight * sold;
      soldByCommodity[commodity] = sold;
      const blocked =
        (regulationBlockedByCommodityBySector.get(commodity)?.get(s.sectorId) ?? 0) * availability;
      if (blocked > 0) {
        regulationBlockedByCommodity[commodity] = blocked;
        blockedSum += weight * blocked;
      }
      marketSupplyShareByCommodity[commodity] =
        supplyShareByCommodity.get(commodity)?.get(s.sectorId) ?? 0;
      if (args.recordDelivery)
        deliveredUnitsByCommodity[commodity] =
          deliveredByCommodityBySector.get(commodity)?.get(s.sectorId) ?? 0;
    }
    if (rateSum <= 0) continue;
    const revenueShareByCommodity: Partial<Record<CommodityType, number>> = {};
    if (factorSum > 0 && Number.isFinite(factorSum)) {
      for (const [commodity, revenueWeight] of Object.entries(revenueWeightByCommodity) as Array<
        [CommodityType, number]
      >) {
        if (Number.isFinite(revenueWeight) && revenueWeight > 0)
          revenueShareByCommodity[commodity] = revenueWeight / factorSum;
      }
    }
    const projectSoldUnitsByCommodity = Object.fromEntries(
      Object.entries(s.projectOutputUnitsByCommodity ?? {}).map(([commodity, units]) => [
        commodity,
        Math.max(0, units ?? 0) * (soldByCommodity[commodity as CommodityType] ?? 0),
      ])
    ) as Partial<Record<CommodityType, number>>;
    results.set(s.sectorId, {
      factor: factorSum / rateSum,
      soldFraction: soldSum / rateSum,
      soldByCommodity,
      ...(Object.keys(editorialAvailabilityByCommodity).length > 0
        ? { editorialAvailabilityByCommodity }
        : {}),
      marketSupplyShareByCommodity,
      ...(args.recordDelivery ? { deliveredUnitsByCommodity } : {}),
      ...(blockedSum > 0
        ? { regulationBlockedFraction: blockedSum / rateSum, regulationBlockedByCommodity }
        : {}),
      effectivePosture: s.inputCostIndex !== undefined ? quotedPostureSum / rateSum : posture,
      offerFactorByCommodity,
      ...(Object.keys(revenueShareByCommodity).length > 0 ? { revenueShareByCommodity } : {}),
      ...(s.productProjectId
        ? {
            productProjectId: s.productProjectId,
            productOutputTurn: s.productOutputTurn,
            projectOutputUnitsByCommodity: s.projectOutputUnitsByCommodity,
            projectSoldUnitsByCommodity,
            projectQualityByCommodity: s.projectQualityByCommodity,
          }
        : {}),
    });
  }
  return results;
}
