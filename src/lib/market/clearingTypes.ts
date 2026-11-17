import { type CommodityType } from "@/lib/constants/commodities";

export interface ClearingSeller {
  /** Sector id (or synthetic id for aggregate pools). */
  id: string;
  /** Units offered this turn after any pre-market audience availability limit. */
  units: number;
  /** Physical output before any audience availability limit. */
  physicalUnits?: number;
  /** Editorially available fraction of advertising output. */
  editorialAvailability?: number;
  /** Product-reachable fraction of this physical offer. */
  productAvailability?: number;
  /** Combined editorial and title reach applied to this offer before clearing. */
  availability?: number;
  /** Posted price relative to market, −0.2 … 0.2. */
  posture: number;
  /** Internally resolved quote relative to this book's price; CEO input is still bounded. */
  quotedPosture?: number;
  /**
   * Plants tier: these units came from the seller's OWN measured output
   * (`producedUnits`), not from the revenue nameplate, so they are exempt from
   * the lagged-supply normalization below. Absent/false ⇒ normalized as before.
   */
  realUnits?: boolean;
  /**
   * Optional contract-reservation basis (plants units) when the open-market
   * offer must stay on the revenue nameplate — extraction under plants. Does
   * not set realUnits or replace `units`. Absent ⇒ contracts reserve against
   * `units` as before.
   */
  contractFillUnits?: number;
}

export interface SectorClearingInput {
  sectorId: string;
  /**
   * Sector's revenue base (drives offered units per output).
   * MUST be anchor-normalized (₳) — sector.revenue is stored in the corp's
   * LOCAL currency, and the lagged balances/demand this book clears against
   * are ₳-denominated (commodityPriceTurn anchor-normalizes before unit
   * accumulation). Feeding raw local revenue inflates a JPY corp's offered
   * units ~100× and an NGN corp's ~1900×, drowning the whole book: the t879
   * clone A/B showed corporate mean fill ~0.13 in a market whose aggregate
   * flows cleared 88%, with undercutters filling WORSE than at-market sellers.
   */
  revenue: number;
  /** Output rates (strategy supply). */
  supplyRates: Partial<Record<CommodityType, number>>;
  /** Exact per-commodity physical offers from a product line, when enabled. */
  outputUnitsByCommodity?: Partial<Record<CommodityType, number>>;
  /** Fraction of each physical offer reachable by current media product titles. */
  offerAvailabilityByCommodity?: Partial<Record<CommodityType, number>>;
  /**
   * Placement share used for REVENUE by the revenue-follows-placement phase:
   * placed plus freight-limited. Absent falls back to `offerPlacementByCommodity`.
   */
  revenuePlacementByCommodity?: Partial<Record<CommodityType, number>>;
  /** Host-state placement cap for each output, independent of other commodities. */
  offerPlacementByCommodity?: Partial<Record<CommodityType, number>>;
  /** Conserved nominal output value by commodity, used to weight sector realization. */
  outputAnchorByCommodity?: Partial<Record<CommodityType, number>>;
  /** Product quality by output commodity, overriding the legacy corp average for that output. */
  productQualityByCommodity?: Partial<Record<CommodityType, number>>;
  /** Project-only redirected units offered, excluding the strategy recipe baseline. */
  projectOutputUnitsByCommodity?: Partial<Record<CommodityType, number>>;
  /** Product quality for the active project, independent of quality-premium pricing. */
  projectQualityByCommodity?: Partial<Record<CommodityType, number>>;
  /** Active project identity for the project-owned offer snapshot. */
  productProjectId?: string;
  /** Turn that produced the project-owned offer. */
  productOutputTurn?: number;
  /** Owning corporation id, for the dumping guard. Absent ⇒ never guarded. */
  corporationId?: string;
  /** Posted posture (player-set), or null to auto-position (NPP/unowned). */
  posture: number | null;
  /** Flag-gated input basket index for cost-plus pricing, otherwise absent. */
  inputCostIndex?: number;
  /** Recipe's base material spend as a share of nominal output value. */
  inputCostShare?: number;
  /** Recorded payroll, overhead, upkeep and compliance per nominal output value. */
  fixedCostShare?: number;
  /**
   * The sector's own soldFraction from the PRIOR turn (lagged, like every
   * other clearing input), if known. Feeds autoPosture's own-fill feedback;
   * ignored for player-posted postures.
   */
  lastSoldFraction?: number | null;
  /**
   * Owning corp's brand loyalty (0–100), lagged. Only consulted when the
   * caller opts into the loyal-slice pre-pass (brandLoyaltySliceEnabled).
   * Absent ⇒ treated as 0 (no protected slice).
   */
  brandLoyalty?: number | null;
  /**
   * Owning corp's lagged output quality (0–100), supplied only when the caller
   * opts into the quality→premium coupling (qualityPremiumPricingEnabled). Used
   * to scale the premium portion of a positive posture; null/undefined ⇒ no
   * quality effect on this sector's premium.
   */
  outputQuality?: number | null;
  /**
   * Plants tier (marketSystemMode >= "plants"): the units this sector actually
   * produced last turn (`sector.producedUnits`, daily, currency-free), already
   * carrying the canonical ledger-side legs the caller applies
   * (scaleMeasuredProducedUnits: natcorpScale, embargo haircut, arsenal
   * retention) so the offer is comparable to `balances`. When supplied AND
   * the caller sets `plantsEnabled`, the offered book is built from these
   * units instead of from the revenue nameplate. Null/absent falls back to
   * the legacy revenue-derived offer.
   */
  producedUnits?: number | null;
  /**
   * Plants contract-fill basis for sectors that must keep a nameplate clearing
   * offer (extraction). Same scale chain as `producedUnits` would use; never
   * sets `realUnits`. Absent ⇒ contracts use the offered units.
   */
  contractFillUnits?: number | null;
  /** Share of advertising output available to its audience, default 1. */
  editorialAdvertisingAvailability?: number;
}

/**
 * Per-commodity book-sanity diagnostic emitted by computeClearingFactors.
 * The raw book can legitimately exceed lagged supply because legacy nameplate
 * offers omit ledger-side scale and extraction haircuts. Callers must read
 * mismatch state from invariantBreach (the canonical-basis invariant), not
 * from ad-hoc ratios over rawOfferedUnits. A large post-normalization excess
 * means exempt measured production and the balance ledger are in different
 * units, so fill rates can still be depressed.
 */
export interface ClearingBookDiagnostic {
  commodity: CommodityType;
  /** Country/reachable-market book key, or null for the worldwide book. */
  group: string | null;
  /** Total before legacy nameplate reconciliation. Informational only. */
  rawOfferedUnits: number;
  /** Total after legacy nameplate reconciliation. Use for mismatch alarms. */
  normalizedOfferedUnits: number;
  /** @deprecated Alias of normalizedOfferedUnits for existing consumers. */
  offeredUnits: number;
  /** Legacy/nameplate units before reconciliation. */
  normalizableUnits: number;
  /** Measured produced units exempt from nameplate reconciliation. */
  exemptRealUnits: number;
  laggedSupply: number;
  laggedDemand: number;
  /**
   * True when the post-normalization book breaches the canonical-basis
   * invariant (see isClearingBookBreach). Both sides now build plants units
   * through the canonical basis, so a breach is a genuine defect: the turn
   * keeps clearing honestly and records a health warning.
   */
  invariantBreach: boolean;
}

export interface SectorClearingResult {
  /** Normalized share of each scoped offer book, for allocating shortage headroom once. */
  marketSupplyShareByCommodity?: Partial<Record<CommodityType, number>>;
  /** Weighted legFactor across outputs (unramped). */
  factor: number;
  /** Weighted sold fraction across outputs. */
  soldFraction: number;
  /**
   * Sold fraction per output commodity, before the rate-weighted rollup above.
   * A multi-output sector (oil_gas: oil 0.58 + natural_gas 0.32) can sell one
   * output out completely and the other barely at all; the weighted headline
   * hides that, and players read the blended number as "my short commodity
   * isn't selling". The sector page renders these per output.
   *
   * Optional so callers that hand-build a result (tests, fixtures) need not
   * restate it; computeClearingFactors always populates it.
   */
  soldByCommodity?: Partial<Record<CommodityType, number>>;
  /**
   * Editorial audience fit actually applied to each output's offer, for outputs
   * where it cut the offer (today: advertising for an outlet whose stance does
   * not match its audience). The cut shrinks the offer, not demand, so a sold
   * out outlet's fill reads below 1 and its sold-out headroom needs this
   * restored. Absent when no output was cut.
   */
  editorialAvailabilityByCommodity?: Partial<Record<CommodityType, number>>;
  /**
   * Offered fraction buyers took but a media ownership law refused, overall
   * and per output. Not sold and not paid; production feedback counts it as
   * demand so a capped outlet does not shrink because of a legal limit.
   * Absent when nothing was blocked.
   */
  regulationBlockedFraction?: number;
  regulationBlockedByCommodity?: Partial<Record<CommodityType, number>>;
  /** Exact normalized units delivered, emitted only when recording is enabled. */
  deliveredUnitsByCommodity?: Partial<Record<CommodityType, number>>;
  /** Posture actually used (player's, or the auto value). */
  effectivePosture: number;
  /** Exact quoted offer factor per output, before sold quantity is applied. */
  offerFactorByCommodity?: Partial<Record<CommodityType, number>>;
  /**
   * Each output's share of the sector's realized revenue this pass (weight x
   * sold x offer factor, normalized to sum to 1). Telemetry only: the money
   * path still uses the blended `factor`. The sector page uses it to split
   * the blended "sold at" price into a sale price per product, which matters
   * when outputs are priced far apart (ordnance vs. industrial chemicals).
   * Absent when nothing sold.
   */
  revenueShareByCommodity?: Partial<Record<CommodityType, number>>;
  /** Project-owned offer identity and units, carried through commodity clearing. */
  productProjectId?: string;
  productOutputTurn?: number;
  projectOutputUnitsByCommodity?: Partial<Record<CommodityType, number>>;
  projectSoldUnitsByCommodity?: Partial<Record<CommodityType, number>>;
  projectQualityByCommodity?: Partial<Record<CommodityType, number>>;
}
