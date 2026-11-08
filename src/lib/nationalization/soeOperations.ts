/**
 * Turn-time SOE behavior (spec §11): apply public-service mandate contributions
 * to state metrics and back operating losses from the treasury. Builders are
 * pure (testable without DB); `processSoeOperations` orchestrates the writes.
 */
import { floorUnitsToPlants } from "@/lib/corporations/wholePlants/rules";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import type { Db, AnyBulkWriteOperation } from "mongodb";
import type {
  Corporation,
  CorporateSector,
  FederalBudget,
  SectorBuildOrder,
  StateMetrics,
} from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import {
  loadFxRatesByCurrency,
  corpCapitalToAnchor,
  anchorToCorpCapital,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { getMetricDefinition } from "@/lib/constants/metricDefinitions";
import type { MetricCategoryId } from "@/lib/db/types/stateMetrics";
import { sumCorporateSectorConstructionInProgress } from "@/lib/bonds/corporateCredit";
import type { CorpSnapshot, SoeBackingSnapshot } from "@/lib/turn/corporation/types";
import type { ActionAuditInput } from "@/lib/db/types/actionAuditLog";
import { isStateOwned } from "./nationalCorporation";
import { plantChangePipeline } from "@/lib/corporations/plantLedger";
import { loadWholePlantsOn } from "@/lib/corporations/wholePlants/stage";
import { findMergedRegionMetricsMany } from "@/lib/macroMetrics/merge";
import { isMacroMetricPath } from "@/lib/macroMetrics/paths";
import { boardDeltaForLegacyEffect } from "@/lib/politicalLegislation/legacyEffectBridge";
import { applyBoardValueDeltasByRegion } from "@/lib/politicalLegislation/boardWrite";
import {
  getMandateContributions,
  resolveSectorMandate,
  type MandateContribution,
} from "./soeMandates";
import * as Sentry from "@sentry/nextjs";
import {
  coverSoeOperatingLoss,
  debitTreasurySoeCapex,
  loadTreasuryCurrency,
  settleFundedSoeCapexGrant,
} from "./treasury";
import {
  resolveTreasuryCashOptions,
  witnessTreasuryCash,
  type TreasuryCashOptions,
} from "./treasuryLedger";
import { snapshotCorporationCurrency } from "@/lib/ledger/balanceSnapshot";
import {
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { sectorDailyProfitAnchor } from "@/lib/corporations/sectorProfitBasis";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import {
  capacityPricePerUnit,
  CAPACITY_ANCHOR_YEAR,
  CAPACITY_BUILD_TURNS,
} from "@/lib/constants/capacityEconomy";
import { buildNppPriceSignals } from "@/lib/turn/npp/priceSignals";
import { sectorShortageScore } from "@/lib/turn/npp/marketSignals";
import { readGovBudgetAnchor } from "@/lib/currency/govBudgetFields";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import { planSoeCapexGrowth, soeGrowthBudgetAnchor } from "./rules/soeGrowth";
import { CAPITAL_DEPRECIATION_PER_TURN } from "@/lib/market/capital";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import {
  NATCORP_RD_MOMENTUM_MAX,
  NATCORP_RD_FULL_FUND_REVENUE_FRACTION,
  NATCORP_RD_DECAY_PER_TURN,
  NATCORP_RD_RAMP_UP_PER_TURN,
} from "./constants";
import { SETTLEMENT_HISTORY_EXCLUDED } from "@/lib/banking/settlementHistory";

interface MetricOpInput {
  countryId: CountryId;
  stateId: string;
  contributions: MandateContribution[];
  currentMetrics: StateMetrics;
  now: Date;
}

type MetricBulkOp = {
  updateOne: {
    filter: { _id: string };
    update: { $set: Record<string, number | Date> };
  };
};

/**
 * Convert the POLITICAL half of a state's mandate contributions into board
 * deltas.
 *
 * Most mandate targets are political, so when the political store stopped
 * being written `buildMandateMetricOps` skipped them on the absent-metric
 * check and SOE-driven metrics silently stopped moving.
 *
 * VALUE, not residual: mandate contributions are ongoing operating pressure,
 * re-applied every turn while the state owns the sector. On the board this
 * composes with the dynamics phase: each turn's push drifts back toward the
 * law-implied target, settling at a steady elevation, and relaxes once the
 * sector is sold. A residual would bank each turn permanently and never let go.
 */
function buildMandateBoardDeltas(
  contributions: MandateContribution[]
): Array<{ familyId: string; scoreDelta: number }> {
  const out: Array<{ familyId: string; scoreDelta: number }> = [];
  for (const c of contributions) {
    const [category, metricId] = c.metricPath.split(".");
    const hit = boardDeltaForLegacyEffect(category, metricId, c.delta);
    if (hit) out.push(hit);
  }
  return out;
}

/** Build the clamped `$set` ops for one state's MACRO mandate contributions. */
export function buildMandateMetricOps(input: MetricOpInput): MetricBulkOp[] {
  const set: Record<string, number | Date> = {};
  for (const c of input.contributions) {
    const [category, field] = c.metricPath.split(".");
    const cat = (input.currentMetrics as unknown as Record<string, unknown>)[category] as
      Record<string, { value?: number }> | undefined;
    const current = cat?.[field]?.value;
    if (typeof current !== "number") continue; // metric absent on this state — skip
    const def = getMetricDefinition(category as MetricCategoryId, field);
    const min = def?.minValue ?? 0;
    const max = def?.maxValue ?? 100;
    const next = Math.max(min, Math.min(max, current + c.delta));
    set[`${c.metricPath}.value`] = next;
  }
  if (Object.keys(set).length === 0) return [];
  set.lastUpdated = input.now;
  return [{ updateOne: { filter: { _id: input.stateId }, update: { $set: set } } }];
}

type RdModernizationOp = {
  updateOne: {
    filter: { _id: Corporation["_id"] };
    update: { $set: { rdScore: number; updatedAt: Date } };
  };
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Per-turn NatCorp modernization: `rdScore` is momentum on 0-MAX that tracks
 * a funding-driven target and bleeds toward it at a flat decay rate.
 *
 * intensity = min(1, spend / (revenue × FULL_FUND_FRACTION))   // 0-1
 * target    = intensity × MAX
 * next      = clamp(momentum + clamp(target-momentum, -DECAY, +RAMP_UP), 0, MAX)
 *
 * `spend` is capped at the corp's own per-turn revenue, so it is affordable
 * by construction and scale-proportional: a giant corp needs a giant budget
 * to hold a high score.
 *
 * The cost is charged as an operating expense in
 * {@link estimateNationalizedOperatingIncome}, which drives both the treasury
 * remittance and the budget page's State Enterprises line, so the treasury
 * funds it by remitting less. It is deliberately NOT debited from
 * `liquidCapital`: SOE profit is remitted each turn and never banked, so a
 * `liquid >= spend` gate would pin every SOE at rdScore 0.
 */
export function buildRdModernizationOps(
  corps: Array<Pick<Corporation, "_id" | "rdScore" | "rdBudgetPerTurn">>,
  revenueByCorp: Map<string, number>,
  now: Date
): RdModernizationOp[] {
  const ops: RdModernizationOp[] = [];
  for (const c of corps) {
    const momentum =
      Math.round(clamp(Number(c.rdScore ?? 0), 0, NATCORP_RD_MOMENTUM_MAX) * 100) / 100;
    const budget = Math.max(0, Math.round(c.rdBudgetPerTurn ?? 0));
    const revenue = Math.max(0, revenueByCorp.get(c._id.toString()) ?? 0);
    const fullFundBudget = revenue * NATCORP_RD_FULL_FUND_REVENUE_FRACTION;
    // Capped at the corp's own revenue, so spend is self-affordable from
    // operations — see the FUNDING note above.
    const spend = Math.round(Math.min(budget, fullFundBudget));
    const intensity = fullFundBudget > 0 ? Math.min(1, spend / fullFundBudget) : 0;
    const target = intensity * NATCORP_RD_MOMENTUM_MAX;
    const gap = target - momentum;
    const delta =
      gap >= 0
        ? Math.min(gap, NATCORP_RD_RAMP_UP_PER_TURN)
        : Math.max(gap, -NATCORP_RD_DECAY_PER_TURN);
    const next = Math.round(clamp(momentum + delta, 0, NATCORP_RD_MOMENTUM_MAX) * 100) / 100;
    if (next === momentum) continue; // nothing to write

    ops.push({
      updateOne: {
        filter: { _id: c._id },
        update: { $set: { rdScore: next, updatedAt: now } },
      },
    });
  }
  return ops;
}

/**
 * SOE capex discipline (plants tier): cover only this turn's realized
 * operating loss, not build spend. Treasury covers up to
 * `min(shortfall, max(0, -realizedOperatingLossThisTurn))`; the build-funded
 * residual stays negative `liquidCapital` so overbuilders self-correct.
 * The realized loss comes from the corporation turn's snapshots and includes
 * upkeep and compliance, unlike the margin estimator, which survives only
 * as a fallback for callers without a snapshot map. Bond interest and taxes
 * are deliberately out of scope. CIP never enters cover math; it only names
 * the residual. Returns ₳. Non-plants callers get the full shortfall.
 */
export function coverableSoeShortfallAnchor(args: {
  corporation: Corporation;
  sectors: readonly CorporateSector[];
  shortfallAnchor: number;
  corpOverheadAnchor: number;
  fxByCurrency: ReadonlyMap<CurrencyCode, number>;
  plantsEnabled: boolean;
  /**
   * This turn's realized operating loss (₳, positive = loss), from the
   * corporation turn's snapshots. When present it IS the coverable basis;
   * when absent the margin estimate below is used as an explicit fallback.
   */
  realizedLossAnchor?: number;
}): number {
  const shortfall = Math.max(0, args.shortfallAnchor);
  if (!args.plantsEnabled || shortfall <= 0) return shortfall;
  const realized = args.realizedLossAnchor;
  if (typeof realized === "number" && Number.isFinite(realized)) {
    return Math.min(shortfall, Math.max(0, realized));
  }
  return Math.min(shortfall, estimateSoeOperatingLossAnchor(args));
}

/**
 * Fallback operating-loss estimate used ONLY when no realized per-corp loss is
 * available (see `coverableSoeShortfallAnchor`). Built from the plants-aware
 * sector profit basis (realized-preferring revenue less maintenance, no growth
 * charge) net of corp-level overhead, converted from daily basis to one turn.
 *
 * Blind to idle / mothball upkeep (`plantsUpkeepCost` in sectorTurn) and the
 * regulatory burden the turn processor charges; both live outside
 * `operatingCost`. Prefer the realized snapshot when it exists; this exists so
 * a missing map degrades to conservative partial cover, never zero or full.
 *
 * Returns ₳ (positive = loss, 0 = no estimated loss).
 */
export function estimateSoeOperatingLossAnchor(args: {
  corporation: Corporation;
  sectors: readonly CorporateSector[];
  corpOverheadAnchor: number;
  fxByCurrency: ReadonlyMap<CurrencyCode, number>;
}): number {
  let dailyProfitAnchor = 0;
  for (const sector of args.sectors) {
    const code = resolveSectorHostCurrencyCode(sector, args.corporation);
    const rate = fxRateForSectorHostFromMap(sector, args.corporation, args.fxByCurrency);
    // REALIZED margin, not the seeded one. `sector.profitMargin` is a frozen
    // constant nothing writes; under plants the turn processor derives the margin
    // from physical cost lines and persists it as `effectiveProfitMargin`.
    // Reading the constant made this report a profit for enterprises running at a
    // large physical loss.
    //
    // Anti-exploit scope is UNCHANGED: `derivedMarginPct` is
    // `1 - operatingCost/revenue` and `operatingCost` excludes growth/build spend,
    // so capex remains uncovered. This makes the OPERATING half honest, it does not
    // widen what "operating" means.
    const realizedMarginPct = sector.effectiveProfitMargin;
    const marginSector =
      typeof realizedMarginPct === "number" && Number.isFinite(realizedMarginPct)
        ? { ...sector, profitMargin: realizedMarginPct }
        : sector;
    dailyProfitAnchor += sectorDailyProfitAnchor(marginSector, {
      currencyCode: code,
      fxRate: rate,
      plantsEnabled: true,
      growthCost: { kind: "stored" },
    }).dailyProfitAnchor;
  }
  const operatingResultPerTurn =
    (dailyProfitAnchor - Math.max(0, args.corpOverheadAnchor)) / TURNS_PER_DAY;
  return Math.max(0, -operatingResultPerTurn);
}

/**
 * Per-corporation treasury-backing reconciliation for one turn (₳ anchor).
 * `cipHeldAnchor` only NAMES the residual — capital construction is never
 * coverable and never enters cover math.
 */
export interface SoeCorpBacking {
  corpId: Corporation["_id"];
  /** Owning country whose treasury covered the loss. */
  countryId: CountryId;
  /** Total negative-liquidCapital hole at backing time. */
  shortfallAnchor: number;
  /** This turn's operating loss (positive = loss). */
  realizedLossAnchor: number;
  /** `snapshot` = this turn's corporation-turn snapshot; `estimate` = margin fallback. */
  realizedSource: "snapshot" | "estimate";
  /** What the treasury paid (₳). `min(shortfall, realizedLoss)` under plants. */
  coveredAnchor: number;
  /** What the treasury paid, in the corp's own currency (rounded). */
  coveredLocal: number;
  /** Outstanding construction-in-progress held off-cover (₳). Explains the residual. */
  cipHeldAnchor: number;
  /** `shortfallAnchor − coveredAnchor` (₳). */
  residualAnchor: number;
}

/**
 * Orchestrate SOE operations for the turn. Reads state-owned corps, their
 * sectors, and metrics of the states they operate in; applies mandate
 * contributions (scaled by SOE share of each state-sector) and backs any
 * negative liquidCapital from the treasury. Money math is ₳-anchor internal.
 *
 * `realizedIncomeAnchorByCorpId` carries this turn's realized per-corp
 * operating result (₳/turn, `CorpSnapshot.income`) keyed by corp id string.
 * When present for a corp it IS the coverable basis; when absent the margin
 * estimate is used as an explicit fallback (and recorded as such).
 *
 * WRITE ORDER (loud failure): every per-corp cover amount is computed PURE
 * first; then each owning treasury is debited; only then are the corp credits
 * bulk-written. A treasury failure therefore THROWS before any corp is
 * credited, never free money. A failure BETWEEN the treasury debits and the
 * corp bulk-write leaves debits without matching credits on the treasury
 * ledger (visible, auditable), and a retry recomputes the same cover from the
 * still-negative corp cash, so an operator rerun after such a mid-pass failure
 * must account for already-issued debits first. Turn-level rerun atomicity
 * beyond this window belongs to the turn framework, like every other treasury
 * leg in this turn.
 */
export async function processSoeOperations(
  db: Db,
  now: Date,
  /** Game year — era-prices the state capex grant. Absent ⇒ the anchor year. */
  currentYear?: number | null,
  /** This turn's realized per-corp operating income (₳/turn) by corp id. Absent ⇒ estimate fallback. */
  realizedIncomeAnchorByCorpId?: ReadonlyMap<string, number>,
  /** Treasury cash accounting; omitted loads a context only when cash moves. */
  ledger?: TreasuryCashOptions
): Promise<{ soeCorps: number; backing: SoeCorpBacking[] }> {
  // Match `isStateOwned` semantics at the DB layer: a state-owned corp has
  // `countryOwnerId` set OR `ownershipState: "stateOwned"`. The seeded NatCorps
  // (e.g. the UK NHS) and pre-Phase-1 backfilled corps carry `countryOwnerId`
  // but NOT `ownershipState`, so filtering on `ownershipState` alone would miss
  // them entirely. The post-filter keeps the canonical reader as the final word.
  const corps = await db
    .collection<Corporation>("corporations")
    .find(
      { $or: [{ countryOwnerId: { $exists: true } }, { ownershipState: "stateOwned" }] },
      { projection: SETTLEMENT_HISTORY_EXCLUDED }
    )
    .toArray();
  const soeCorps = corps.filter((c) => isStateOwned(c));
  if (soeCorps.length === 0) return { soeCorps: 0, backing: [] };

  // One budget denomination read per owning country, not per SOE. A 2027
  // euro treasury can back many firms in the same turn.
  const ownerCountryIds = Array.from(
    new Set(soeCorps.map((c) => (c.countryOwnerId ?? c.countryId) as CountryId))
  );
  const treasuryCurrencyByCountry = new Map(
    await Promise.all(
      ownerCountryIds.map(
        async (countryId) => [countryId, await loadTreasuryCurrency(db, countryId)] as const
      )
    )
  );

  const corpIds = soeCorps.map((c) => c._id);
  const sectors = await db
    .collection<CorporateSector>("corporateSectors")
    .find(
      { corporationId: { $in: corpIds } },
      { projection: { buildQueue: 0, plantsPnl: 0, soldByCommodity: 0 } }
    )
    .toArray();

  const stateIds = Array.from(new Set(sectors.map((s) => s.stateId)));
  // Legacy-shaped per-region view required by buildMandateMetricOps presence
  // checks. Mandate targets formerly on the political half are now board
  // families, handled below.
  const [mergedMetrics, fxByCurrency] = await Promise.all([
    findMergedRegionMetricsMany(db, { _id: { $in: stateIds } }),
    loadFxRatesByCurrency(db),
  ]);
  const metricsById = new Map<string, StateMetrics>(
    mergedMetrics.map((m) => [String(m._id), m] as const)
  );
  const corpById = new Map(soeCorps.map((c) => [c._id.toString(), c]));
  let ledgerOptions: Promise<TreasuryCashOptions> | undefined;
  const treasuryLedger = () => (ledgerOptions ??= resolveTreasuryCashOptions(db, ledger));

  // Group contributions per state (a state may host sectors from primary + split-offs).
  const contributionsByState = new Map<string, MandateContribution[]>();
  for (const sector of sectors) {
    const corp = corpById.get(sector.corporationId.toString());
    if (!corp) continue;
    const mandate = resolveSectorMandate(corp, sector);
    const soeShare = computeSoeShareOfStateSector(sector, sectors);
    const contributions = getMandateContributions(
      corp.countryId as CountryId,
      sector,
      mandate,
      soeShare
    );
    if (contributions.length === 0) continue;
    const list = contributionsByState.get(sector.stateId) ?? [];
    list.push(...contributions);
    contributionsByState.set(sector.stateId, list);
  }

  // Merge same-metric contributions within a state (sum deltas) before clamping,
  // then route each half to its own store: macro paths (unemployment relief,
  // food security) stay an absolute clamped `$set` on macroMetrics; political
  // paths become board deltas.
  const metricOps: MetricBulkOp[] = [];
  const boardDeltasByState = new Map<string, Array<{ familyId: string; scoreDelta: number }>>();
  for (const [stateId, contributions] of contributionsByState) {
    const metrics = metricsById.get(stateId);
    if (!metrics) continue;
    const merged = mergeContributions(contributions);
    metricOps.push(
      ...buildMandateMetricOps({
        countryId: (metrics.countryId ?? "US") as CountryId,
        stateId,
        contributions: merged.filter((c) => isMacroMetricPath(c.metricPath)),
        currentMetrics: metrics,
        now,
      })
    );
    const board = buildMandateBoardDeltas(merged.filter((c) => !isMacroMetricPath(c.metricPath)));
    if (board.length > 0) boardDeltasByState.set(stateId, board);
  }
  if (metricOps.length > 0) {
    await db
      .collection<StateMetrics>("macroMetrics")
      .bulkWrite(metricOps as AnyBulkWriteOperation<StateMetrics>[]);
  }
  await applyBoardValueDeltasByRegion(db, boardDeltasByState);

  // Per-turn modernization (R&D): advance each SOE's decaying, scale-aware
  // momentum from its CEO-set budget (relative to its own revenue). The spend is
  // capped at the corp's revenue and charged through operating income (remittance
  // + budget line), not against liquidCapital — see buildRdModernizationOps.
  const revenueByCorp = new Map<string, number>();
  for (const s of sectors) {
    const k = s.corporationId.toString();
    revenueByCorp.set(
      k,
      (revenueByCorp.get(k) ?? 0) + (Number.isFinite(s.revenue) ? s.revenue : 0)
    );
  }
  const rdOps = buildRdModernizationOps(soeCorps, revenueByCorp, now);
  if (rdOps.length > 0) {
    await db
      .collection<Corporation>("corporations")
      .bulkWrite(rdOps as AnyBulkWriteOperation<Corporation>[]);
  }

  const plantsEnabled = marketAtLeast(await getMarketSystemModeForDb(db), "plants");
  const sectorsByCorpId = new Map<string, CorporateSector[]>();
  for (const s of sectors) {
    const k = s.corporationId.toString();
    sectorsByCorpId.set(k, [...(sectorsByCorpId.get(k) ?? []), s]);
  }

  // ── State capex grant (the non-command SOE capacity channel) ───────────────
  //
  // Market-economy nationalized corps are excluded from the private NPP
  // reinvestment path and the treasury backstop refuses build orders, so their
  // plant would decay one-way without this channel. It is a BUDGETED LINE: the
  // owning treasury is debited and it appears in `estimateCountryOwnedBudgetNetLocal`.
  // Bounded: it buys back exactly the units that wore out this turn at the standing
  // list price (`capacityBookAnchor` rises by cash paid, so no exit can mint against
  // it), leaving `capitalStock` flat and never touched `liquidCapital`.
  // Growth is a separate rule-bound leg (`planSoeCapexGrowth`).
  if (plantsEnabled) {
    await applyStateCapexGrants(
      db,
      soeCorps,
      sectorsByCorpId,
      fxByCurrency,
      treasuryCurrencyByCountry,
      currentYear,
      now,
      treasuryLedger
    );
  }

  // Treasury-backing: an SOE with negative liquidCapital is covered — but only
  // up to this turn's REALIZED operating loss under plants. See
  // `coverableSoeShortfallAnchor`: cash drained into build orders is the
  // director's problem, not the treasury's. CIP only names the residual.
  //
  // LOUD ORDERING: the whole pass is computed pure first; treasury debits run
  // second; corp credits bulk-write last. A treasury failure throws before any
  // corp is credited (never free money), and the still-negative cash makes the
  // next attempt recompute the identical cover.
  const backing: SoeCorpBacking[] = [];
  for (const corp of soeCorps) {
    const liquid = Number.isFinite(corp.liquidCapital) ? corp.liquidCapital : 0;
    if (liquid >= 0) continue;
    const corpId = corp._id.toString();
    const countryId = (corp.countryOwnerId ?? corp.countryId) as CountryId;
    const code = resolveCorpLiquidCurrencyCode(corp);
    const rate = fxRateForCorpFromMap(corp, fxByCurrency);
    const shortfallAnchor = -corpCapitalToAnchor(liquid, code, rate);
    // Corp-level overhead is stored in the corp's own currency (daily basis),
    // same convention as estimateNationalizedOperatingIncome.
    const corpOverheadAnchor =
      readCorpEconomicAnchor(corp.marketingBudget ?? 0, code, rate) +
      readCorpEconomicAnchor(corp.logisticsBudget ?? 0, code, rate) +
      readCorpEconomicAnchor(corp.ceoSalary ?? 0, code, rate);
    const corpSectors = sectorsByCorpId.get(corpId) ?? [];
    const realizedIncome = realizedIncomeAnchorByCorpId?.get(corpId);
    let realizedLossAnchor: number;
    let realizedSource: "snapshot" | "estimate";
    if (typeof realizedIncome === "number" && Number.isFinite(realizedIncome)) {
      realizedLossAnchor = Math.max(0, -realizedIncome);
      realizedSource = "snapshot";
    } else {
      realizedLossAnchor = estimateSoeOperatingLossAnchor({
        corporation: corp,
        sectors: corpSectors,
        corpOverheadAnchor,
        fxByCurrency,
      });
      realizedSource = "estimate";
    }
    // Below plants the whole hole is covered, exactly as before.
    const coveredAnchor = plantsEnabled
      ? coverableSoeShortfallAnchor({
          corporation: corp,
          sectors: corpSectors,
          shortfallAnchor,
          corpOverheadAnchor,
          fxByCurrency,
          plantsEnabled,
          realizedLossAnchor,
        })
      : shortfallAnchor;
    const coveredLocal = Math.round(anchorToCorpCapital(coveredAnchor, code, rate));
    backing.push({
      corpId: corp._id,
      countryId,
      shortfallAnchor,
      realizedLossAnchor,
      realizedSource,
      coveredAnchor,
      coveredLocal,
      // Explanatory ONLY: held CIP names the residual, it never funds it.
      cipHeldAnchor: sumCorporateSectorConstructionInProgress(corpSectors, corp._id),
      residualAnchor: shortfallAnchor - coveredAnchor,
    });
  }

  const backingOps: AnyBulkWriteOperation<Corporation>[] = [];
  const backingCredits: { corpId: string; currency: CurrencyCode; amount: number }[] = [];
  for (const b of backing) {
    if (!(b.coveredAnchor > 0)) continue; // nothing operating-related to comp
    // Debit the OWNING treasury: the same key the remittance, state capex
    // grant, and both budget estimators use. A firm nationalised abroad keeps
    // its domicile on `countryId`, but debiting that would drain a treasury
    // for an enterprise it does not own. The debit is unconditional: an
    // unaffordable cover pushes the treasury negative (national debt) rather
    // than being withheld.
    const cashLedger = await treasuryLedger();
    await coverSoeOperatingLoss(
      db,
      b.countryId,
      b.coveredAnchor,
      fxByCurrency,
      now,
      cashLedger,
      treasuryCurrencyByCountry.get(b.countryId),
      `soe-loss-backing:${cashLedger.context?.turn ?? 0}:${b.countryId}:${b.corpId.toString()}`
    );
    const corp = corpById.get(b.corpId.toString());
    const liquid = corp && Number.isFinite(corp.liquidCapital) ? corp.liquidCapital : 0;
    // Credit only what the treasury actually paid. Below plants that is the
    // whole loaded hole (liquidCapital → 0, as before); under plants an
    // over-built SOE is left negative by the residual it spent on capacity.
    // Both are deltas so a concurrent cash movement is kept, not zeroed.
    backingOps.push({
      updateOne: {
        filter: { _id: b.corpId },
        update: {
          $inc: { liquidCapital: plantsEnabled ? b.coveredLocal : -liquid },
          $set: { updatedAt: now },
        },
      },
    });
    backingCredits.push({
      corpId: b.corpId.toString(),
      currency: snapshotCorporationCurrency(corp ?? {}),
      // Nothing earlier in this pass moves liquidCapital, so the zeroing write
      // lands exactly the loaded hole.
      amount: plantsEnabled ? b.coveredLocal : -liquid,
    });
  }
  if (backingOps.length > 0) {
    const credited = await db.collection<Corporation>("corporations").bulkWrite(backingOps);
    const options = await treasuryLedger();
    // A partial write cannot say which credit landed; the treasury legs stay
    // witnessed and the missed enterprise surfaces as a divergence.
    if (options.context && (credited?.matchedCount ?? 0) !== backingOps.length) {
      Sentry.captureException(new Error("SOE loss backing missed an enterprise credit"), {
        extra: { expected: backingOps.length, matched: credited?.matchedCount },
      });
    } else if (options.context) {
      for (const credit of backingCredits) {
        await witnessTreasuryCash(db, options, {
          flow: "soe_loss_backing",
          account: { kind: "corporation", corpId: credit.corpId, currency: credit.currency },
          amount: credit.amount,
          now,
          site: "soeOperations:backing",
        });
      }
    }
  }

  return { soeCorps: soeCorps.length, backing };
}

/**
 * Fold SOE backing credits and profit-remittance debits into the turn's
 * in-memory corp state BEFORE `corporationHistory` persistence, so history
 * rows chart post-backing cash instead of the pre-backing snapshot.
 *
 * PURE (no DB): the DB legs already landed inside `processSoeOperations` /
 * `processSoeRemittance`; this only syncs the two in-memory mirrors the
 * history writer reads (`corpSnapshots[].liquidCapital` + `soeBacking`, and
 * the `corpById` docs). Corp docs in the map are turn-start stale, so they are
 * synced TO the folded snapshot cash, not incremented — incrementing a stale
 * base would double-count the turn's operating income.
 */
export function foldSoeCashDeltas(args: {
  corpSnapshots: CorpSnapshot[];
  corpById: Map<string, Corporation>;
  backing: readonly SoeCorpBacking[];
  remittedLocalByCorpId: ReadonlyMap<string, number>;
}): void {
  const snapshotByCorpId = new Map(args.corpSnapshots.map((s) => [s.corpId.toString(), s]));
  const syncCorpCash = (key: string, snap: CorpSnapshot | undefined, deltaLocal: number): void => {
    const corp = args.corpById.get(key);
    if (!corp) return;
    corp.liquidCapital = snap
      ? snap.liquidCapital
      : (Number.isFinite(corp.liquidCapital) ? corp.liquidCapital : 0) + deltaLocal;
  };
  for (const b of args.backing) {
    const key = b.corpId.toString();
    const snap = snapshotByCorpId.get(key);
    if (snap) {
      snap.liquidCapital += b.coveredLocal;
      const reconciliation: SoeBackingSnapshot = {
        shortfallAnchor: b.shortfallAnchor,
        realizedLossAnchor: b.realizedLossAnchor,
        realizedSource: b.realizedSource,
        coveredAnchor: b.coveredAnchor,
        cipHeldAnchor: b.cipHeldAnchor,
        residualAnchor: b.residualAnchor,
      };
      snap.soeBacking = reconciliation;
    }
    syncCorpCash(key, snap, b.coveredLocal);
  }
  for (const [key, amount] of args.remittedLocalByCorpId) {
    if (!(amount > 0)) continue;
    const snap = snapshotByCorpId.get(key);
    if (snap) snap.liquidCapital -= amount;
    syncCorpCash(key, snap, -amount);
  }
}

/**
 * Deterministic aggregate audit row for the SOE backing + remittance sweep,
 * in the existing turn-audit shape (`corp.soe_backing_sweep`). PURE: rounded
 * totals only, no clock, no randomness — the same input always yields the same
 * entry. Returns null when neither leg moved anything, so callers emit no row.
 */
export function buildSoeBackingAuditEntry(args: {
  backing: readonly SoeCorpBacking[];
  remittedCorps: number;
}): ActionAuditInput | null {
  let corpsBacked = 0;
  let corpsWithResidual = 0;
  let snapshotCorps = 0;
  let coveredAnchor = 0;
  let residualAnchor = 0;
  for (const b of args.backing) {
    if (b.coveredAnchor > 0) corpsBacked += 1;
    if (b.residualAnchor > 0) corpsWithResidual += 1;
    if (b.realizedSource === "snapshot") snapshotCorps += 1;
    coveredAnchor += b.coveredAnchor;
    residualAnchor += b.residualAnchor;
  }
  if (corpsBacked === 0 && args.remittedCorps === 0) return null;
  return {
    source: "turn",
    category: "corp",
    action: "corp.soe_backing_sweep",
    phase: "corporationTurn",
    subject: { type: "corpBatch", name: "soe backing sweep" },
    outcome: "ok",
    meta: {
      corpsBacked,
      corpsWithResidual,
      realizedFromSnapshot: snapshotCorps,
      realizedFromEstimate: args.backing.length - snapshotCorps,
      coveredAnchor: Math.round(coveredAnchor),
      residualAnchor: Math.round(residualAnchor),
      remittedCorps: args.remittedCorps,
    },
  };
}

function mergeContributions(contributions: MandateContribution[]): MandateContribution[] {
  const byPath = new Map<string, number>();
  for (const c of contributions)
    byPath.set(c.metricPath, (byPath.get(c.metricPath) ?? 0) + c.delta);
  return Array.from(byPath, ([metricPath, delta]) => ({ metricPath, delta }));
}

/**
 * SOE share of its (state, sectorType): this sector's revenue over the total
 * SOE revenue for that (state, sectorType) across all SOE sectors. v1 proxy for
 * "share of the state sector" — full market-share (incl. private + unowned)
 * resolution is a later refinement; SOE-internal share keeps the contribution
 * bounded and monotonic in SOE footprint.
 */
function computeSoeShareOfStateSector(
  sector: CorporateSector,
  allSoeSectors: CorporateSector[]
): number {
  let total = 0;
  for (const s of allSoeSectors) {
    if (s.stateId === sector.stateId && s.sectorType === sector.sectorType) {
      total += Math.max(0, s.revenue);
    }
  }
  if (total <= 0) return 0;
  return Math.max(0, sector.revenue) / total;
}

// ── State capex grant (plants tier) ─────────────────────────────────────────

/** One sector's share of a state capex grant. */
export interface SoeCapexSectorBuy {
  sectorId: CorporateSector["_id"];
  sectorType: CorporateSector["sectorType"];
  industryModel?: CorporateSector["industryModel"];
  mediaDiscriminator?: CorporateSector["mediaDiscriminator"];
  /** Decides plant size with the lane. */
  strategyId?: CorporateSector["strategyId"];
  capitalStock: number;
  /** Capacity units bought back — exactly this turn's depreciation. */
  unitsAdded: number;
  /** ₳ paid for them at the standing list price. */
  costAnchor: number;
  /** `capacityBookAnchor` after the purchase (prior paid basis + what was paid). */
  nextBookAnchor: number;
}

/**
 * Plan one state enterprise's capex grant: buy back exactly the capacity each
 * of its sectors lost to depreciation this turn, at the standing list price.
 *
 * PURE. `grantAnchor` is the ₳ the treasury owes and equals
 * {@link soeCapacityReplacementCostAnchor} over the same sectors by
 * construction — the invariant that makes the grant provably incapable of
 * growing the enterprise: units bought == units worn out, so `capitalStock` is
 * flat and no amount of build-order queueing changes what the state pays.
 *
 * A sector with no capital stock is skipped (nothing to replace — founding is a
 * policy decision, not maintenance), as is one with no priced capacity.
 */
export function buildSoeCapexGrant(
  sectors: readonly CorporateSector[],
  year: number | null | undefined,
  unitScale: number
): { grantAnchor: number; buys: SoeCapexSectorBuy[] } {
  const priceYear = typeof year === "number" && Number.isFinite(year) ? year : CAPACITY_ANCHOR_YEAR;
  const buys: SoeCapexSectorBuy[] = [];
  let grantAnchor = 0;
  for (const sector of sectors) {
    const stock =
      typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
        ? Math.max(0, sector.capitalStock)
        : 0;
    if (stock <= 0) continue;
    const unitPrice = capacityPricePerUnit(
      sector.sectorType,
      priceYear,
      unitScale,
      sector.strategyId ?? null,
      sector.industryModel
    );
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;
    const unitsAdded = stock * CAPITAL_DEPRECIATION_PER_TURN;
    if (!(unitsAdded > 0)) continue;
    const costAnchor = unitsAdded * unitPrice;
    // Same convention as the directed-credit purchase: the paid basis is an
    // absolute `$set` seeded from the list-price fallback, so a row with no
    // recorded basis is stamped at its honest value instead of just this
    // tranche. Exits settle at what was PAID, never at list.
    const priorBook =
      typeof sector.capacityBookAnchor === "number" &&
      Number.isFinite(sector.capacityBookAnchor) &&
      sector.capacityBookAnchor >= 0
        ? sector.capacityBookAnchor
        : stock * unitPrice;
    buys.push({
      sectorId: sector._id,
      sectorType: sector.sectorType,
      industryModel: sector.industryModel,
      mediaDiscriminator: sector.mediaDiscriminator,
      strategyId: sector.strategyId,
      capitalStock: stock,
      unitsAdded,
      costAnchor,
      nextBookAnchor: priorBook + costAnchor,
    });
    grantAnchor += costAnchor;
  }
  return { grantAnchor, buys };
}

/**
 * Apply the state capex grant to every state-owned corp that has no OTHER state
 * capacity channel, debiting each owning treasury for what it bought.
 *
 * Corps carrying a command-economy `soe` overlay are skipped: the Gosbank
 * already funds their replacement through directed credit (floored at exactly
 * this quantity in `commandEconomyTurn`), and paying twice would let a planned
 * economy's plant grow on maintenance money.
 */
async function applyStateCapexGrants(
  db: Db,
  soeCorps: readonly Corporation[],
  sectorsByCorpId: ReadonlyMap<string, CorporateSector[]>,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>,
  treasuryCurrencyByCountry: ReadonlyMap<CountryId, CurrencyCode>,
  currentYear: number | null | undefined,
  now: Date,
  treasuryLedger: () => Promise<TreasuryCashOptions>
): Promise<void> {
  const grantByCountry = new Map<CountryId, { grantAnchor: number; buys: SoeCapexSectorBuy[] }>();
  const sectorsByOwner = new Map<CountryId, CorporateSector[]>();
  const grantUnitScale = await loadWorldEraUnitScale(db);
  for (const corp of soeCorps) {
    if (corp.soe) continue; // command economy — funded by directed credit
    const countryId = (corp.countryOwnerId ?? corp.countryId) as CountryId | undefined;
    if (!countryId) continue;
    const corpSectors = sectorsByCorpId.get(corp._id.toString()) ?? [];
    sectorsByOwner.set(countryId, [...(sectorsByOwner.get(countryId) ?? []), ...corpSectors]);
    const { grantAnchor, buys } = buildSoeCapexGrant(corpSectors, currentYear, grantUnitScale);
    if (!(grantAnchor > 0) || buys.length === 0) continue;
    const grant = grantByCountry.get(countryId) ?? { grantAnchor: 0, buys: [] };
    grant.grantAnchor += grantAnchor;
    grant.buys.push(...buys);
    grantByCountry.set(countryId, grant);
  }
  if (grantByCountry.size === 0) return;
  const cashLedger = await treasuryLedger();
  const turn = cashLedger.context?.turn ?? 0;
  const wholePlants = await loadWholePlantsOn(db);
  const capacityUpdate = (buy: SoeCapexSectorBuy) =>
    plantChangePipeline(
      buy,
      buy.unitsAdded,
      { capacityBookAnchor: buy.nextBookAnchor, updatedAt: now },
      { wholePlants }
    );

  if (cashLedger.context?.treasuryCashLedgerEnabled) {
    // Funded cash: each country's capacity rides its Treasury debit's receipt,
    // so an unaffordable grant buys nothing and blocks no other country.
    for (const [countryId, { grantAnchor, buys }] of grantByCountry) {
      const outcome = await settleFundedSoeCapexGrant(db, {
        countryId,
        grantAnchor,
        fxByCurrency,
        now,
        ledger: cashLedger,
        treasuryCurrency: treasuryCurrencyByCountry.get(countryId),
        key: `soe-capex-grant:${turn}:${countryId}`,
        capacity: buys.map((buy) => ({
          collection: "corporateSectors",
          filter: { _id: buy.sectorId },
          pipelineUpdate: capacityUpdate(buy),
          note: "Install the state capex grant's replacement capacity",
        })),
      });
      if (outcome.status !== "paid") {
        Sentry.addBreadcrumb({
          category: "soe.capexGrant",
          level: "warning",
          message: `State capex grant for ${countryId} not paid this turn (${outcome.status})`,
          data: { countryId, turn, grantAnchor, error: outcome.error },
        });
        continue;
      }
      await applyStateCapexGrowth(db, {
        countryId,
        sectors: sectorsByOwner.get(countryId) ?? [],
        year: currentYear,
        unitScale: grantUnitScale,
        fxByCurrency,
        treasuryCurrency: treasuryCurrencyByCountry.get(countryId),
        now,
        ledger: cashLedger,
        turn,
      });
    }
    return;
  }

  const ops: AnyBulkWriteOperation<CorporateSector>[] = [];
  for (const { buys } of grantByCountry.values()) {
    for (const buy of buys) {
      ops.push({ updateOne: { filter: { _id: buy.sectorId }, update: capacityUpdate(buy) } });
    }
  }
  await db.collection<CorporateSector>("corporateSectors").bulkWrite(ops);
  for (const [countryId, { grantAnchor }] of grantByCountry) {
    await debitTreasurySoeCapex(
      db,
      countryId,
      grantAnchor,
      fxByCurrency,
      now,
      cashLedger,
      treasuryCurrencyByCountry.get(countryId),
      `soe-capex-grant:${turn}:${countryId}`
    );
  }
}

/**
 * Fund growth orders for one owning country's short sectors (funded Treasury
 * cash only). Paid through the same settlement as the replacement grant, under
 * its own key: an unaffordable growth leg buys nothing and never blocks the
 * replacement. The order lands in the sector's normal `buildQueue`, so the
 * capacity arrives after the usual build time and is booked at what was paid.
 */
async function applyStateCapexGrowth(
  db: Db,
  input: {
    countryId: CountryId;
    sectors: readonly CorporateSector[];
    year: number | null | undefined;
    unitScale: number;
    fxByCurrency: ReadonlyMap<CurrencyCode, number>;
    treasuryCurrency: CurrencyCode | undefined;
    now: Date;
    ledger: TreasuryCashOptions;
    turn: number;
  }
): Promise<void> {
  const { countryId, sectors, ledger, turn, now } = input;
  const candidates = sectors.filter(
    (s) => s.sectorType !== "extraction" && (s.capitalStock ?? 0) > 0
  );
  if (candidates.length === 0) return;
  const [budgetDoc, priceDocs, queueDocs] = await Promise.all([
    db
      .collection<FederalBudget>("federalBudget")
      .findOne(
        { countryId },
        { projection: { debt: 1, sovereignCrisisState: 1, treasuryCashLocal: 1 } }
      ),
    db
      .collection<CommodityPrice>("commodityPrices")
      .find(
        {},
        {
          projection: {
            commodity: 1,
            basePrice: 1,
            globalPrice: 1,
            globalSupply: 1,
            globalDemand: 1,
            nationalPrices: 1,
            nationalSupply: 1,
            nationalDemand: 1,
            reachablePrices: 1,
            demandTruncatedUnits: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<CorporateSector>("corporateSectors")
      .find({ _id: { $in: candidates.map((s) => s._id) } }, { projection: { buildQueue: 1 } })
      .toArray(),
  ]);
  if (!budgetDoc) return;
  const currency =
    input.treasuryCurrency ??
    ledger.context?.treasuryCurrencies.get(countryId) ??
    (await loadTreasuryCurrency(db, countryId));
  const rate = input.fxByCurrency.get(currency) ?? 1;
  const budgetAnchor = soeGrowthBudgetAnchor({
    debtPrincipal: budgetDoc.debt?.principal ?? Number.NaN,
    debtCeiling: budgetDoc.debt?.ceiling ?? 0,
    crisisState: budgetDoc.sovereignCrisisState,
    cashAnchor: readGovBudgetAnchor(budgetDoc.treasuryCashLocal ?? 0, currency, rate),
  });
  if (!(budgetAnchor > 0)) return;

  const { priceRatioOf } = buildNppPriceSignals(new Map(priceDocs.map((p) => [p.commodity, p])));
  const pendingById = new Map(queueDocs.map((q) => [String(q._id), q.buildQueue?.length ?? 0]));
  const priceYear =
    typeof input.year === "number" && Number.isFinite(input.year)
      ? input.year
      : CAPACITY_ANCHOR_YEAR;
  const byId = new Map(candidates.map((s) => [String(s._id), s]));
  const { growthAnchor, orders } = planSoeCapexGrowth(
    candidates.map((s) => ({
      id: String(s._id),
      sectorType: s.sectorType,
      capitalStock: s.capitalStock ?? 0,
      pendingOrders: pendingById.get(String(s._id)) ?? 0,
      unitPriceAnchor: capacityPricePerUnit(
        s.sectorType,
        priceYear,
        input.unitScale,
        s.strategyId ?? null,
        s.industryModel
      ),
      shortage: sectorShortageScore(s.sectorType, s.countryId ?? countryId, priceRatioOf),
    })),
    budgetAnchor
  );
  if (orders.length === 0) return;
  const wholePlantsGrowth = await loadWholePlantsOn(db);

  const outcome = await settleFundedSoeCapexGrant(db, {
    countryId,
    grantAnchor: growthAnchor,
    fxByCurrency: input.fxByCurrency,
    now,
    ledger,
    treasuryCurrency: input.treasuryCurrency,
    key: `soe-capex-growth:${turn}:${countryId}`,
    capacity: orders.map((o) => {
      const sector = byId.get(o.sectorId)!;
      // Whole plants: the grant buys whole plants, at least one, and the order
      // keeps the cash it was granted (per-plant cost rises when rounded up).
      const plantUnits = plantSizeForSector(sector);
      const buildOrder: SectorBuildOrder = {
        unitsOrdered: wholePlantsGrowth
          ? Math.max(plantUnits, floorUnitsToPlants(o.units, plantUnits))
          : o.units,
        strategyId: sector.strategyId ?? null,
        costPaidAnchor: o.costAnchor,
        startTurn: turn,
        onlineTurn: turn + Math.max(1, CAPACITY_BUILD_TURNS(sector.sectorType)),
        smooth: true,
        ...(wholePlantsGrowth ? { plantUnits } : {}),
      };
      return {
        collection: "corporateSectors",
        // Compare-and-swap on an empty queue: a sector that gained an order
        // since the read above is left alone.
        filter: { _id: sector._id, buildQueue: { $in: [null, []] } },
        update: { $push: { buildQueue: buildOrder }, $set: { updatedAt: now } },
        note: "Queue the state capex growth order",
      };
    }),
  });
  if (outcome.status !== "paid") {
    Sentry.addBreadcrumb({
      category: "soe.capexGrowth",
      level: "warning",
      message: `State capex growth for ${countryId} not paid this turn (${outcome.status})`,
      data: { countryId, turn, growthAnchor, error: outcome.error },
    });
  }
}
