import {
  sectorOutputCommodities,
  toDominanceSector,
} from "@/lib/corporations/commodityDominanceContext";
import {
  commodityDominanceRatio,
  memoSupplyMixOf,
  type CommodityDominanceSector,
} from "@/lib/corporations/rules/commodityDominance";
import { groupOperator } from "@/lib/corporations/groups/operator";
import {
  activeGroupDirection,
  groupDirectionLevers,
} from "@/lib/corporations/groups/rules/direction";
import type { CorporationType } from "@/lib/constants/corporations";
import { getLogisticsSupportedSectorCount } from "@/lib/constants/corporations";
import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import type { CapacityDecisionObservation } from "@/lib/corporations/capacityDecisionTelemetry/rules";
import {
  buildNppOperatorObservation,
  type NppDecisionConstraint,
} from "@/lib/corporations/nppOperatorTelemetry/rules";
import { hasProtectedConstructionProperty } from "@/lib/corporations/securedConstructionProperty";
import {
  STRANDED_DIVEST_MAX_PER_TURN,
  STRANDED_DIVEST_TURNS,
} from "@/lib/corporations/strandedPlant";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import {
  anchorToCorpCapital,
  resolveCorpLiquidCurrencyCode,
  resolveSectorHostCurrencyCode,
} from "@/lib/currency/corporationCapital";
import type { CorporateSector } from "@/lib/db/types";
import type { UnownedSector } from "@/lib/db/types/unownedSector";
import { isAutopilotRun } from "@/lib/corporations/autopilot";
import { operatorPermissionsFor } from "./operatorPermissions";
import { operatorAllowsPlacement, operatorMay } from "./rules/operatorPolicy";
import {
  createFoundingCapacityOutcome,
  makeCapacityCashToAnchor,
  pushFoundingCapacityObservation,
  resolveCapacityCohort,
} from "@/lib/turn/npp/capacityDecisionTelemetry";
import { fundedSellThrough } from "@/lib/turn/npp/rules/fundedSellThrough";
import type {
  NppCorpDecision,
  NppCorpDecisionContext,
  NppPlantsContext,
} from "@/lib/turn/npp/corpDecisionTypes";
import { advanceStrategy, type StrategySituation } from "@/lib/turn/npp/corpStrategy";
import { memoizeOnce } from "@/lib/turn/npp/rules/strategyCadence";
import { corpHeldByCashCut } from "./rules/cashCutHold";
import {
  allowsNppIndustryInvestment,
  isNppDivestmentProtected,
} from "./rules/investmentProtection";
import { lossChronicityUpdates } from "@/lib/turn/npp/costMothball";
import { evaluateNppEntry } from "@/lib/turn/npp/entryEvaluation";
import {
  evaluateFrontierCandidate,
  settleFrontierEntryPlacement,
} from "@/lib/turn/npp/frontierEntryCandidate";
import { sectorsAfterConversion } from "@/lib/turn/npp/rules/transitionConversion";
import {
  hasEnterableHeadroom,
  type CommodityPriceRatioFn,
  type PlacementSignals,
} from "@/lib/turn/npp/marketSignals";
import { getNppCashFloorAnchor } from "@/lib/turn/npp/nppCashReserve";
import {
  EXPANSION_MIN_CASH,
  EXPANSION_MIN_MARGIN,
  MAX_DIVIDEND_RATE,
  NPP_RD_MAINTENANCE_BUDGET_MIN,
  NPP_RD_MAINTENANCE_SHARE,
  NPP_SHORTAGE_ENTRIES_PER_TURN,
} from "@/lib/turn/npp/nppCorporationTuning";
import { nppSectorProfitability, type SectorProfitInfo } from "@/lib/turn/npp/sectorProfitability";
import { CHRONIC_LOW_FILL_THRESHOLD } from "@/lib/turn/npp/strategyExpectedRevenue";
import type { ObjectId } from "mongodb";
import { applyNppSectorPolicies } from "./corpDecisionSectorPolicy";
import { decideNppFounding } from "./corpDecisionFounding";
import { decideNppCapacityReinvestment } from "./corpDecisionReinvestment";

export function makeNppCorpDecision(
  ctx: NppCorpDecisionContext,
  unownedByCountry: Map<string, UnownedSector[]>,
  stateControlled: ReadonlySet<string>,
  priceRatioOf: CommodityPriceRatioFn,
  plants?: NppPlantsContext,
  placementSignals?: PlacementSignals
): NppCorpDecision {
  const { corp, sectors, now, modifiers } = ctx;
  const operator = ctx.operator ?? operatorPermissionsFor(corp);
  const foundAllowed = operatorMay(operator, "found");
  const borrowAllowed = operatorMay(operator, "borrow");
  const budgetsAllowed = operatorMay(operator, "budgets");
  const dividendsAllowed = operatorMay(operator, "dividends");
  const coreSectorModel = corp.industryModel ?? null;
  const isCoreSector = (sector: CorporateSector) =>
    sector.sectorType === corp.type && (sector.industryModel ?? null) === coreSectorModel;
  const operatingCorpType = getOperatingSectorType(
    corp.type,
    corp.industryModel,
    corp.mediaDiscriminator
  );
  const updates: Record<string, unknown> = { updatedAt: now };
  const sectorUpdates: NppCorpDecision["sectorUpdates"] = [];
  const newSectors: NppCorpDecision["newSectors"] = [];
  const divestedSectorIds: ObjectId[] = [];
  const unownedDraws: NonNullable<NppCorpDecision["unownedDraws"]> = [];
  const reinvestments: NonNullable<NppCorpDecision["reinvestments"]> = [];
  const constructionFinanceIntents: NonNullable<NppCorpDecision["constructionFinanceIntents"]> = [];
  let entryDiagnostic: NppCorpDecision["entryDiagnostic"];

  const liquidCapital = corp.liquidCapital ?? 0;
  const passive = ctx.caretakerMandate === "passive";
  let cashLocal = liquidCapital;
  const numSectors = sectors.length;

  const corpCurrencyCode = resolveCorpLiquidCurrencyCode(corp);
  const corpFxRate = ctx.fxRate ?? 1;
  const toCorpLocal = (amountAnchor: number): number =>
    anchorToCorpCapital(amountAnchor, corpCurrencyCode, corpFxRate);
  const cashToAnchor = makeCapacityCashToAnchor(corp, corpFxRate);
  const capacityCohort = resolveCapacityCohort(corp);
  const nationalShare = (
    countryId: string,
    sectorType: CorporationType,
    industryModel?: string | null,
    mediaDiscriminator?: string | null
  ) =>
    plants?.nationalShareOf?.(
      corp._id,
      countryId,
      sectorType,
      industryModel,
      mediaDiscriminator as "entertainment" | null | undefined
    ) ?? 0;
  // Commodity-level build toll, priced exactly as a player's build is: this
  // corp's potential output (owned plus queued plus the order) of each
  // commodity the sector makes, over world demand (state demand for freight and
  // local services). 0 when demand is unknown.
  let dominanceSectorsCache: CommodityDominanceSector[] | undefined;
  // One mix per sector per decision (see memoSupplyMixOf).
  const dominanceSupplyMixOf = memoSupplyMixOf(ctx.turn);
  const commodityRatioFor = (sector: CorporateSector, extraUnits: number): number => {
    const demandOf = plants?.commodityDemandOf;
    if (!plants || !demandOf) return 0;
    dominanceSectorsCache ??=
      plants.groupDominanceSectorsOf?.(corp._id.toString()) ??
      sectors.map((s) => toDominanceSector(s, ctx.turn));
    return commodityDominanceRatio({
      sectors: dominanceSectorsCache,
      commodities: sectorOutputCommodities(sector, ctx.turn),
      demandOf,
      stateDemandOf: plants.commodityStateDemandOf,
      countryDemandOf: plants.commodityCountryDemandOf,
      targetSectorId: sector._id.toString(),
      targetStateId: sector.stateId,
      targetCountryId: sector.countryId,
      extraUnits,
      isNatcorp: !!corp.countryOwnerId,
      turn: ctx.turn,
      currentYear: plants.year,
      commandEconomyEnabled: plants.commandEconomyEnabled === true,
      supplyMixOf: dominanceSupplyMixOf,
    }).ratio;
  };
  const capacityObservations: CapacityDecisionObservation[] = [];
  // Which of the four operator decision legs bound this corp this turn (#2122);
  // sections below flag the branch they take and the resolver picks the first.
  const constraintFlags: Partial<Record<NppDecisionConstraint, boolean>> = {};
  const ownCorporationId = corp._id.toString();
  const rivalCount = (stateId: string, sectorType: string): number =>
    ctx.competitorCountOf?.(stateId, sectorType, ownCorporationId) ?? 0;
  const sectorEconomicToCorpLocal = (amount: number, sector: CorporateSector): number => {
    const hostCurrency = resolveSectorHostCurrencyCode(sector, corp);
    const hostRate =
      (hostCurrency && ctx.fxByCurrency?.get(hostCurrency)) ??
      (hostCurrency === corpCurrencyCode ? corpFxRate : 1);
    return toCorpLocal(readCorpEconomicAnchor(amount, hostCurrency, hostRate));
  };

  // Archetype-adjusted levers, each clamped to a safe rail so no personality can
  // bankrupt a profitable corp. Clamped in ₳ (where the rails are authored),
  // then converted once into the currency `liquidCapital` is compared in.
  const effectiveCashFloor = toCorpLocal(
    getNppCashFloorAnchor(plants?.enabled ? plants.preset : undefined, modifiers.cashFloorMult)
  );
  const effectiveExpansionMinMargin = EXPANSION_MIN_MARGIN * modifiers.expansionMinMarginMult;
  const effectiveExpansionMinCash = toCorpLocal(
    EXPANSION_MIN_CASH * modifiers.expansionMinCashMult
  );

  // ── Profitability analysis ─────────────────────────────────────────────────
  const sectorProfits = nppSectorProfitability(sectors, plants);
  const profitableSectors = sectorProfits.filter((sp) => sp.isProfitable).length;

  // Count consecutive loss turns for active NPP sectors. Restart resets the count.
  if (plants?.enabled === true) {
    sectorUpdates.push(...lossChronicityUpdates(sectorProfits, now));
  }

  // `totalIncome`/`totalRevenue`/`corpMargin`/`isProfitable` below feed ONLY
  // sections 3-5 (budgets, dividends, expansion); sections 1-2 read
  // sp.income/sp.margin directly. These figures must account for overhead,
  // realized (not nominal) revenue, and debt service, or NPPs spend themselves
  // into the ground while reading as healthy:
  //  (1) Subtract last turn's ACTUAL spend before judging profitability.
  //  (2) Use `realizedRevenue`, not nominal `sector.revenue`; the corp pays
  //      overhead out of realized, so sizing off nominal multiplies the burden
  //      by 1/realizationRatio.
  //  (3) Include bond interest (contracted, not discretionary); see
  //      NppCorpDecisionContext.debtServiceAnchor. Charged in corp currency.
  const realizedOrNominal = (sp: SectorProfitInfo) =>
    sectorEconomicToCorpLocal(sp.sector.realizedRevenue ?? sp.sector.revenue ?? 0, sp.sector);
  const totalRevenue = sectorProfits.reduce((sum, sp) => sum + realizedOrNominal(sp), 0);
  const grossRealizedIncome = sectorProfits.reduce(
    (sum, sp) => sum + realizedOrNominal(sp) * (sp.margin / 100),
    0
  );
  const priorOverhead =
    (corp.marketingBudget ?? 0) +
    (corp.logisticsBudget ?? 0) +
    (corp.rdBudget ?? 0) +
    (corp.ceoSalary ?? 0);
  const debtServiceLocal = toCorpLocal(ctx.debtServiceAnchor ?? 0);
  const totalIncome = grossRealizedIncome - priorOverhead - debtServiceLocal;
  const corpMargin = totalRevenue > 0 ? (totalIncome / totalRevenue) * 100 : 0;
  const isProfitable = totalIncome > 0 && profitableSectors > 0;

  // ── v5 strategy loop ───────────────────────────────────────────────────────
  // The score is `corpMargin` itself: already currency-normalized, scale-free,
  // and net of both overhead and debt service. One number, comparable across
  // countries and eras, unlike every money constant in this module.
  //
  // Everything below only RE-WEIGHTS levers that already existed. `expand` is
  // the identity, so a corp that is doing fine never changes behaviour.
  const debtDominant = debtServiceLocal > 0 && debtServiceLocal >= grossRealizedIncome;
  const lowFillSectors = sectorProfits.filter(
    (sp) => sp.sector.soldFraction != null && sp.sector.soldFraction < CHRONIC_LOW_FILL_THRESHOLD
  ).length;
  const readHeadroom = memoizeOnce(() =>
    hasEnterableHeadroom(
      corp,
      sectors,
      unownedByCountry,
      stateControlled,
      plants?.enabled === true,
      plants?.eraUnitScale ?? 1
    )
  );
  const situation: StrategySituation = {
    score: corpMargin,
    debtDominant,
    // "Mostly cannot sell what it makes": a majority of the corp's sectors.
    chronicLowFill: sectorProfits.length > 0 && lowFillSectors * 2 > sectorProfits.length,
    // Lazy: the headroom scan walks the unowned pools and is only read by the
    // switch evaluation, which most corp-turns never reach (#2693).
    get hasHeadroom() {
      return readHeadroom();
    },
    // Derived from the corp, NOT passed in. An `isCaretaker` the caller had
    // to remember to set is one more way to get this wrong, which is the
    // exact bug class this module keeps producing: the seeded-margin read,
    // the nominal-revenue read, the unconverted foreign revenue. The corp
    // document already knows.
    isCaretaker: !!corp.caretakerCeo || isAutopilotRun(corp),
  };
  // Absent reads as enabled: see `strategyLoopEnabled`. When off, the corp runs
  // the `expand` levers and no strategy state is written, so an operator can
  // kill the loop mid-world without a revert and without leaving stale memory
  // that would resume the moment it is re-enabled.
  const strategyLoopOn = ctx.strategyLoopEnabled !== false;
  const strategyDecision = strategyLoopOn
    ? advanceStrategy({
        prior: ctx.strategy,
        turn: ctx.turn,
        situation,
        eligible: ctx.strategyEligible === true,
        engineSix: ctx.engineSix === true,
      })
    : null;
  const directionContext = {
    turn: ctx.turn,
    ceoId: corp.ceoId?.toString() ?? "",
    ceoTenureKey: ctx.groupDirection
      ? groupOperator(corp, ctx.groupRootId ?? "").ceoTenureKey
      : undefined,
    rootId: ctx.groupRootId ?? "",
    isNpp: corp.ceoType === "npp",
    caretaker: !!corp.caretakerCeo,
    distressed: debtDominant || corpMargin < 0,
  };
  const groupDirection = activeGroupDirection(ctx.groupDirection, directionContext);
  const levers = groupDirectionLevers(
    strategyDecision?.state.id ?? "expand",
    groupDirection,
    directionContext
  );

  const primaryIndustryOnly = groupDirection?.primaryIndustryOnly === true;
  const placementLimited = operator.sectorTypes !== null || operator.countryIds !== null;
  const entryPools =
    groupDirection?.regions.length || primaryIndustryOnly || placementLimited
      ? new Map(
          [...unownedByCountry].map(([country, rows]) => [
            country,
            rows.filter((row) => {
              const rowType = getOperatingSectorType(
                row.sectorType,
                row.industryModel,
                row.mediaDiscriminator
              );
              return (
                (!groupDirection?.regions.length || groupDirection.regions.includes(row.stateId)) &&
                allowsNppIndustryInvestment(operatingCorpType, rowType, primaryIndustryOnly) &&
                operatorAllowsPlacement(operator, rowType, country)
              );
            }),
          ])
        )
      : unownedByCountry;

  // ── 1. Divest losing sectors ──────────────────────────────────────────────
  // Divest a losing sector once its margin falls to/below the archetype's
  // tolerance (impatient archetypes shed at the first loss; patient ones tolerate
  // shallow losses) and the corp has other profitable sectors — BUT never divest
  // the corp's primary type (core business).
  if (numSectors > 1) {
    for (const sp of sectorProfits) {
      if (
        !hasProtectedConstructionProperty(sp.sector) &&
        !isNppDivestmentProtected(sp.sector, ctx.turn) &&
        sp.income < 0 &&
        sp.margin <= modifiers.divestMarginFloor + levers.divestMarginFloorDelta
      ) {
        // Protect the corp's primary sector type — that's its core business
        if (isCoreSector(sp.sector)) {
          constraintFlags.divest_core_protected = true;
          continue;
        }

        const remainingProfitable = profitableSectors;
        if (remainingProfitable > 0) {
          divestedSectorIds.push(sp.sector._id);
        } else {
          constraintFlags.divest_no_other_income = true;
        }
      }
    }
  }

  // ── 1b. Divest stranded plants (supply-dislocation phase 2) ───────────────
  // A plant that has cleared less than half its output for STRANDED_DIVEST_TURNS
  // straight is built in the wrong place, and margin cannot see it: the units
  // that DO sell carry a healthy margin while most of the output evaporates.
  // Exit it so the corp's next founding (state-aware since P1) rebuilds where
  // the demand is. Same protections as the margin divest — never the corp's
  // core type, never the last sector, only while something else is profitable —
  // plus a one-per-turn cap so exits stay gradual. Capacity is deliberately not
  // restored to the unowned pool: the state is glutted, re-listing the bucket
  // would invite the next founding straight back in.
  if (plants?.enabled && numSectors > 1 && profitableSectors > 0) {
    let strandedDivests = 0;
    // Longest-stranded first, so the cap exits the worst plant.
    const stranded = sectorProfits
      .filter(
        (sp) =>
          (sp.sector.lowFillTurns ?? 0) >= STRANDED_DIVEST_TURNS &&
          // lowFillTurns counts the legacy clearing shadow. On a funded world a
          // plant is stranded only if its own settlement left output unsold:
          // deleting a sold-out plant destroys capacity in a short market.
          (!ctx.fundedWorldEpoch ||
            (fundedSellThrough(sp.sector, ctx.fundedWorldEpoch) ?? 1) < 0.5) &&
          !isCoreSector(sp.sector) &&
          !hasProtectedConstructionProperty(sp.sector) &&
          !isNppDivestmentProtected(sp.sector, ctx.turn) &&
          sp.sector.mothballed !== true &&
          !divestedSectorIds.includes(sp.sector._id)
      )
      .sort((a, b) => (b.sector.lowFillTurns ?? 0) - (a.sector.lowFillTurns ?? 0));
    for (const sp of stranded) {
      if (strandedDivests >= STRANDED_DIVEST_MAX_PER_TURN) break;
      if (numSectors - divestedSectorIds.length <= 1) break;
      divestedSectorIds.push(sp.sector._id);
      strandedDivests += 1;
    }
  }

  // A divest deletes the sector with no proceeds, so a player's plant is shed
  // only when the owner's policy allows it. Autopilot reports losers to the
  // owner instead. Parent-owned AI corps keep the parent's property unless
  // policy says otherwise.
  const autopilot = isAutopilotRun(corp);
  const blockedDivests = operatorMay(operator, "divest") ? 0 : divestedSectorIds.splice(0).length;
  const autopilotLosers = autopilot && operator.actions.divest === "ask" ? blockedDivests : 0;

  // Divest-leg flag (section 1): a completed shed; blocked-shed flags are set
  // inside the margin-divest loop above.
  if (divestedSectorIds.length > 0) constraintFlags.divested = true;

  // Effective sector count after divestiture
  const effectiveSectors = numSectors - divestedSectorIds.length;
  const logisticsSupportedSectors = getLogisticsSupportedSectorCount(corp.logisticsStrength);

  // ── 2. Growth rate adjustment (per-sector) ────────────────────────────────
  // Aggressive: strong sectors get +2, healthy +1, thin stays, loss -2.
  // Then a macro tilt (smarter-NPP, t879): the margin signal alone floods
  // gluts (a strong-margin sector in a deep glut still accelerated) and
  // starves shortages (a thin sector selling a scarce commodity never grew).
  // Shortage outputs get +1 growth, deep-glut outputs −1, so NPP capacity
  // chases unmet demand instead of pure own-margin momentum.
  const { conversionApplied, conversionCharge } = applyNppSectorPolicies({
    sectorProfits,
    divestedSectorIds,
    operatingCorpType,
    primaryIndustryOnly,
    plants,
    sectorUpdates,
    now,
    constraintFlags,
    modifiers,
    levers,
    corp,
    placementSignals,
    priceRatioOf,
    ctx,
    sectors,
    operator,
  });

  // ── 3. Budget decisions (revenue-based, not cash-based) ───────────────────
  // Budgets scale on what the corp EARNS, not what it holds. `totalRevenue`/
  // `corpMargin`/`isProfitable` are the net-of-overhead figures computed above.

  // Base budget shares by margin band, then scaled by archetype (marketing/R&D).
  // Logistics is an operational lever, not a personality one, so it's unscaled.
  let marketingPct: number;
  let logisticsPct: number;
  let rdPct: number;
  const isCashCrisis = liquidCapital <= effectiveCashFloor;
  if (!isProfitable || totalRevenue === 0 || isCashCrisis) {
    // Cash distress overrides accounting profit for discretionary budgets.
    marketingPct = 0.005;
    logisticsPct = 0.003;
    rdPct = 0;
  } else if (corpMargin < 10) {
    // Thin margins: lean budgets, no R&D
    marketingPct = 0.015;
    logisticsPct = 0.01;
    rdPct = 0;
  } else if (corpMargin < 25) {
    // Healthy margins: moderate investment
    marketingPct = 0.03;
    logisticsPct = 0.02;
    rdPct = 0.01;
  } else {
    // Strong margins: aggressive investment to grow
    marketingPct = 0.05;
    logisticsPct = 0.03;
    rdPct = 0.02;
  }

  // Budget-leg flag (section 3), in the code's own branch order.
  if (isCashCrisis) constraintFlags.budget_cash_crisis = true;
  else if (!isProfitable || totalRevenue === 0) constraintFlags.budget_unprofitable = true;
  else if (corpMargin < 10) constraintFlags.budget_thin_margin = true;

  const marketingBudget = Math.round(
    totalRevenue * marketingPct * modifiers.marketingMult * levers.marketingMult
  );
  const logisticsBudget = Math.round(totalRevenue * logisticsPct);
  let rdBudget = Math.round(totalRevenue * rdPct * modifiers.rdMult * levers.rdMult);
  // Engine 6: R&D never drops to zero. Any R&D budget earns the flat per-turn
  // base gain, which holds rdScore (the quality tech pillar) near par for a
  // token cost; a zero budget lets it decay 3% a turn and quality with it.
  if (ctx.engineSix && rdBudget < NPP_RD_MAINTENANCE_BUDGET_MIN) {
    rdBudget = Math.max(
      NPP_RD_MAINTENANCE_BUDGET_MIN,
      Math.round(totalRevenue * NPP_RD_MAINTENANCE_SHARE)
    );
  }
  if (budgetsAllowed) {
    if (marketingBudget !== (corp.marketingBudget ?? 0)) updates.marketingBudget = marketingBudget;
    if (logisticsBudget !== (corp.logisticsBudget ?? 0)) updates.logisticsBudget = logisticsBudget;
    if (rdBudget !== (corp.rdBudget ?? 0)) updates.rdBudget = rdBudget;
  }

  // ── 4. Dividend policy ────────────────────────────────────────────────────
  // Rate scales with margin — higher margin = higher payout. isProfitable/
  // corpMargin are net of overhead (see profitability-analysis block above) —
  // a corp whose marketing/logistics/R&D/CEO-salary spend is eating its
  // sector income no longer reads as dividend-eligible just because its
  // sectors look healthy in isolation.
  let targetDividendRate = 0;
  if (isProfitable && liquidCapital > effectiveCashFloor && corpMargin >= 15) {
    if (corpMargin >= 30) targetDividendRate = 8;
    else if (corpMargin >= 20) targetDividendRate = 5;
    else targetDividendRate = 3;
    // Archetype tilts payout vs. reinvestment, clamped to a sane ceiling.
    targetDividendRate = Math.min(
      MAX_DIVIDEND_RATE,
      Math.round(targetDividendRate * modifiers.dividendMult * levers.dividendMult)
    );
  }
  // Dividend-leg flag (section 4): why the payout was withheld.
  if (targetDividendRate === 0) {
    if (!isProfitable) constraintFlags.dividend_unprofitable = true;
    if (!(liquidCapital > effectiveCashFloor)) constraintFlags.dividend_cash_floor = true;
    if (corpMargin < 15) constraintFlags.dividend_margin_below_min = true;
  }
  if (dividendsAllowed && targetDividendRate !== (corp.dividendRate ?? 0)) {
    updates.dividendRate = targetDividendRate;
  }

  if (passive) {
    if (budgetsAllowed) {
      updates.marketingBudget = 0;
      updates.logisticsBudget = 0;
      updates.rdBudget = 0;
    }
    if (dividendsAllowed) updates.dividendRate = 0;
    return {
      corpId: corp._id,
      updates,
      liquidCapitalDelta: 0,
      cashFloorLocal: effectiveCashFloor,
      sectorUpdates,
      strategy: strategyDecision?.state,
      operatorObservation: buildNppOperatorObservation({
        sectorType: operatingCorpType,
        cashNegative: cashLocal < 0,
        passive: true,
        profitable: isProfitable,
        marginPct: corpMargin,
        cashCrisis: isCashCrisis,
        entryReason: entryDiagnostic?.reason,
        dividendRate: 0,
        divestedSectors: divestedSectorIds.length,
        reinvestments: 0,
        cashHeadroomAnchor: cashToAnchor(cashLocal - effectiveCashFloor),
        constraintFlags,
      }),
    };
  }

  // ── 5. Sector expansion ───────────────────────────────────────────────────
  // Candidate search, ordinary entry gates, and the funnel diagnostic naming
  // the first binding gate. See evaluateNppEntry. The frontier fallback (5b)
  // overlays this evaluation; the shared priced founding block below prices
  // whichever target survives.
  const surplusCash = liquidCapital - effectiveCashFloor;
  // Plants idle for want of cash hold founding and every reinvestment leg.
  // nppDividendAfterTaxStage >= 2: no founding or growth from cash at or under the floor.
  // A short-lane financed build still goes through (rules/shortageGrowthFinance): the
  // cash growth budget is zero under the floor, so only the loan can size units.
  const cashRunCut = corpHeldByCashCut(sectors, ctx.fundedWorldEpoch, ctx.turn);
  const floorHold = plants?.holdExpansionAtCashFloor === true && !(surplusCash > 0);
  const cashCutHold = cashRunCut || floorHold;
  const entry = evaluateNppEntry({
    corp,
    sectors: sectorsAfterConversion(sectors, conversionApplied),
    unownedByCountry: entryPools,
    stateControlled,
    priceRatioOf,
    placementSignals,
    plantsEnabled: plants?.enabled === true,
    eraUnitScale: plants?.eraUnitScale ?? 1,
    profitable: isProfitable,
    marginPct: corpMargin,
    marginFloorPct: effectiveExpansionMinMargin,
    surplusCash,
    minCash: effectiveExpansionMinCash,
    sectorCount: effectiveSectors,
    logisticsSupportedSectors,
    allowExpansion: levers.allowExpansion && foundAllowed,
    ordinaryEntryEligible: ctx.ordinaryEntryEligible,
    shortageEntryEligible: ctx.shortageEntryEligible,
    criticalLogisticsEntryEligible: ctx.criticalLogisticsEntryEligible,
    criticalLogisticsShortageEligible: ctx.criticalLogisticsShortageEligible,
    retailExpansionPaused: ctx.retailExpansionPaused,
    entryCapReached: newSectors.length >= NPP_SHORTAGE_ENTRIES_PER_TURN,
    fundedRecipeWorld: ctx.fundedRecipeWorld,
  });
  const {
    entryCandidate,
    expansion,
    hasLogisticsCapacity,
    marketEntryEligible,
    criticalShortage: entryCriticalShortage,
    allowExpansion: entryAllowsExpansion,
    exceptionalShortageEntry,
    ordinaryEntryTargetGlutted,
    ordinaryEntry,
    foundingStrategyId,
  } = entry;
  entryDiagnostic = entry.diagnostic;
  // Whether the founding evaluation below runs at all. Captured so the
  // capacity observation can tell pre-evaluation gates (eligibility, demand)
  // from affordability gates; `newSectors` is still empty here, so the cap
  // term is trivially true and needs no gate of its own.
  // ── 5b. Frontier-entry experiment fallback (issue #991) ───────────────────
  // A policy-cleared candidate rejected only on an expectational gate gets
  // one priced evaluation through the shared founding block below. See
  // evaluateFrontierCandidate for the relaxable reasons, gate revalidation,
  // and slot checks.
  const frontier = evaluateFrontierCandidate({
    turnState: ctx.frontierEntry,
    corp,
    candidate: entryCandidate,
    diagnostic: entryDiagnostic,
    placementSignals,
    gates: {
      allowExpansion: entryAllowsExpansion,
      hasLogisticsCapacity,
      marketEntryEligible,
      retailBlocked: ctx.retailExpansionPaused === true && entryCandidate?.sectorType === "retail",
      targetGlutted: ordinaryEntryTargetGlutted,
    },
  });
  // The ordinary target when the corp earned it, else the experiment's
  // second-chance target. `expansion` is the entry candidate itself whenever
  // it is non-null, so the block below prices the same slot either way.
  const foundingTarget = expansion ?? frontier?.target ?? null;
  const foundingBlockEntered =
    foundAllowed &&
    !cashCutHold &&
    foundingTarget !== null &&
    newSectors.length < NPP_SHORTAGE_ENTRIES_PER_TURN &&
    (ordinaryEntry || exceptionalShortageEntry || frontier !== null);
  // Founding outcome tracked across the priced branches for the capacity
  // observation; see capacityDecisionTelemetry. Blank until a branch prices
  // the candidate: pre-pricing gates observe explicit zeros, never a
  // fabricated quote.
  const foundingOutcome = createFoundingCapacityOutcome();
  const foundingResult = decideNppFounding({
    foundingBlockEntered,
    plants,
    foundingTarget,
    nationalShare,
    liquidCapital,
    exceptionalShortageEntry,
    borrowAllowed,
    ctx,
    toCorpLocal,
    effectiveCashFloor,
    placementSignals,
    foundingStrategyId,
    entryDiagnostic,
    foundingOutcome,
    corp,
    cashToAnchor,
    newSectors,
    unownedDraws,
    cashLocal,
  });
  entryDiagnostic = foundingResult.entryDiagnostic;
  cashLocal = foundingResult.cashLocal;
  const { foundingCashLocal, foundingCreditLocal, shortageCreditRequest } = foundingResult;

  // Frontier experiment slot accounting: every placement consumes one
  // cohort and one controller slot; experiment placements carry the trial
  // marker. See settleFrontierEntryPlacement.
  entryDiagnostic = settleFrontierEntryPlacement({
    turnState: ctx.frontierEntry,
    frontier,
    diagnostic: entryDiagnostic,
    corp,
    fallbackCandidate: entryCandidate,
    ordinaryEntry,
    exceptionalShortageEntry,
  });

  // One founding observation per corp per turn; gate evaluation lives in
  // capacityDecisionTelemetry.
  pushFoundingCapacityObservation(capacityObservations, {
    cohort: capacityCohort,
    competitorCount: entryCandidate
      ? rivalCount(entryCandidate.stateId, entryCandidate.sectorType)
      : 0,
    outcome: foundingOutcome,
    fallbackCashHeadroomAnchor: cashToAnchor(cashLocal - effectiveCashFloor),
    gates: {
      allowExpansion: entryAllowsExpansion,
      isProfitable: isProfitable || entryCriticalShortage,
      corpMargin,
      minMargin: entryCriticalShortage ? Number.NEGATIVE_INFINITY : effectiveExpansionMinMargin,
      entryCandidate: entryCandidate
        ? { stateId: entryCandidate.stateId, sectorType: entryCandidate.sectorType }
        : null,
      hasLogisticsCapacity,
      marketEntryEligible,
      shortageEntryEligible: ctx.shortageEntryEligible === true,
      retailExpansionPaused: ctx.retailExpansionPaused === true,
      ordinaryEntryTargetGlutted,
      exceptionalShortageEntry,
      cashCutHold,
      blockEntered: foundingBlockEntered,
      plantsEnabled: plants?.enabled === true,
      expansionPresent: expansion !== null,
      surplusCash,
      minCash: effectiveExpansionMinCash,
    },
  });

  // ── 6. Capacity reinvestment (plants only) ────────────────────────────────
  //
  // The replacement for the growth-target decision the AI lost under plants.
  // See the NPP_REINVEST_* constants block for the rule, the arithmetic and the
  // calibration. Non-plants worlds skip this block entirely and are byte-
  // identical to before.
  //
  // STATE-OWNED ENTERPRISES ARE EXCLUDED. Everything below is PRIVATE-SECTOR
  // machinery: it rations the build against the corp's own liquid cash
  // (`effectiveCashFloor`, `NPP_REINVEST_MAINTENANCE_CASH_SHARE`) because a
  // private corp's capex is funded out of retained earnings. An SOE's is not —
  // a state enterprise funds capacity from state channels, and its treasury
  // backstop deliberately covers only its OPERATING loss (see
  // `coverableSoeShortfallAnchor`; covering build orders was the P3b exploit).
  // Running an SOE through this path therefore charges it cash the state never
  // gave it and leaves it permanently insolvent. Its channels are instead:
  //   • command economies — the Gosbank directed-credit tranche, floored at one
  //     turn of depreciation replacement (`commandEconomyTurn`);
  //   • every other state-owned corp — the budgeted state capex grant from the
  //     owning treasury (`processSoeOperations`).
  // Note this is the CANONICAL `isStateOwned` reader, not `ownershipState`
  // alone: the seeded NatCorps and the command-economy national enterprises
  // carry `countryOwnerId` and no `ownershipState`, so the old local check saw
  // them as private.
  ({ cashLocal } = decideNppCapacityReinvestment({
    plants,
    corp,
    groupDirection,
    ctx,
    unownedByCountry,
    autopilot,
    cashLocal,
    effectiveCashFloor,
    capacityCohort,
    rivalCount,
    cashToAnchor,
    capacityObservations,
    sectorProfits,
    operatingCorpType,
    primaryIndustryOnly,
    divestedSectorIds,
    stateControlled,
    cashRunCut,
    floorHold,
    placementSignals,
    priceRatioOf,
    levers,
    operator,
    toCorpLocal,
    nationalShare,
    commodityRatioFor,
    borrowAllowed,
    sectorEconomicToCorpLocal,
    totalIncome,
    constructionFinanceIntents,
    sectorUpdates,
    now,
    reinvestments,
  }));

  // Expansion and shareholder returns can coexist. The build paths above have
  // already paid capex and preserved the effective cash floor; forcing the
  // dividend rate to zero here made continuously-growing NPP corporations
  // retain every future profitable turn as well. The margin-based rate from
  // section 4 applies only to positive after-tax income at settlement time, so
  // it cannot spend the operating reserve or distribute a loss.

  return {
    corpId: corp._id,
    updates,
    // Ticket #1260: the cash leg travels as a DELTA, never as an absolute write.
    // These ops are appended to the corporation bulkWrite AFTER this turn's
    // income `$inc`, so a `$set` of the balance overwrote the credit and the
    // whole turn's operating income vanished. `cashLocal` starts at the opening
    // `liquidCapital` and every path above adjusts it — a market-entry credit
    // up, a founding cost or growth capex down — so this one subtraction is the
    // net movement whichever path ran. See `nppCashWrite.ts`.
    liquidCapitalDelta: cashLocal - liquidCapital,
    ...(foundingCashLocal === undefined ? {} : { foundingCashLocal }),
    ...(foundingCreditLocal === undefined ? {} : { foundingCreditLocal }),
    cashFloorLocal: effectiveCashFloor,
    sectorUpdates,
    newSectors: newSectors.length > 0 ? newSectors : undefined,
    divestedSectorIds: divestedSectorIds.length > 0 ? divestedSectorIds : undefined,
    unownedDraws: unownedDraws.length > 0 ? unownedDraws : undefined,
    reinvestments: reinvestments.length > 0 ? reinvestments : undefined,
    constructionFinanceIntents:
      constructionFinanceIntents.length > 0 ? constructionFinanceIntents : undefined,
    shortageCreditRequest,
    entryDiagnostic,
    conversionCharge,
    strategy: strategyDecision?.state,
    capacityObservations,
    ...(autopilot
      ? {
          autopilotSignals: {
            chronicLowFill: situation.chronicLowFill,
            debtDominant,
            losingSectors: autopilotLosers,
          },
        }
      : {}),
    operatorObservation: buildNppOperatorObservation({
      sectorType: operatingCorpType,
      cashNegative: cashLocal < 0,
      passive: false,
      profitable: isProfitable,
      marginPct: corpMargin,
      cashCrisis: isCashCrisis,
      entryReason: entryDiagnostic?.reason,
      dividendRate: targetDividendRate,
      divestedSectors: divestedSectorIds.length,
      reinvestments: reinvestments.length,
      cashHeadroomAnchor: cashToAnchor(cashLocal - effectiveCashFloor),
      constraintFlags,
    }),
  };
}
