/** Capacity reinvestment step of an NPP corporation's turn decision. */
import type {
  NppPlantsContext,
  NppCorpDecisionContext,
  NppCorpDecision,
} from "@/lib/turn/npp/corpDecisionTypes";
import type { UnownedSector } from "@/lib/db/types/unownedSector";
import type { CapacityDecisionObservation } from "@/lib/corporations/capacityDecisionTelemetry/rules";
import type { SectorProfitInfo } from "@/lib/turn/npp/sectorProfitability";
import type { ObjectId } from "mongodb";
import {
  type PlacementSignals,
  type CommodityPriceRatioFn,
  depositAwarePriceRatioOf,
  plantShortageScore,
  plantPeakShortageScore,
  ESSENTIAL_SHORTAGE_SCORE,
} from "@/lib/turn/npp/marketSignals";
import type { CorporationType } from "@/lib/constants/corporations";
import type { CorporateSector, SectorBuildOrder } from "@/lib/db/types";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import {
  createReinvestPoolLookup,
  type ReinvestCandidate,
  reinvestPoolHeadroomUnits,
} from "@/lib/turn/npp/reinvestCandidatePool";
import {
  autopilotCapexBudgetLocal,
  AUTOPILOT_CAPEX_SIZING_SLACK,
  AUTOPILOT_GROWTH_STEP_OF_RUN,
  AUTOPILOT_MAX_INFLIGHT_GROWTH_STEPS,
  evaluateAutopilotGrowthGate,
  autopilotBoundGrowthUnits,
} from "./rules/autopilotReinvest";
import {
  createReinvestCapacityObserver,
  evaluateReinvestPreSizingGate,
} from "@/lib/turn/npp/capacityDecisionTelemetry";
import { allowsNppIndustryInvestment } from "./rules/investmentProtection";
import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import { gateFill, type ProductFillRow } from "@/lib/turn/npp/rules/productFill";
import {
  NPP_REINVEST_MAX_QUEUE_DEPTH,
  NPP_REINVEST_MIN_FILL,
  NPP_REINVEST_AGGRESSION,
  NPP_REINVEST_MAX_GROWTH_QUEUE_DEPTH,
  NPP_GROWTH_MIN_SHORTAGE,
  NPP_GROWTH_MIN_UTILIZATION,
  NPP_GROWTH_DEPLOY_FRACTION,
  NPP_GROWTH_MAX_STEP_OF_RUN,
  NPP_REINVEST_MAX_SECTORS_PER_TURN,
  NPP_REINVEST_MAINTENANCE_CASH_SHARE,
} from "@/lib/turn/npp/nppCorporationTuning";
import { bucketKey } from "@/lib/nationalization/stateControlledBuckets";
import {
  hasProtectedConstructionProperty,
  unprotectedConstructionPropertyFilter,
} from "@/lib/corporations/securedConstructionProperty";
import { nppOperatingCapacityUnits } from "@/lib/turn/npp/rules/fundedSellThrough";
import {
  CAPACITY_BUILD_TURNS,
  computeBuildCost,
  MAX_BUILD_UNITS_PER_ORDER,
} from "@/lib/constants/capacityEconomy";
import {
  fragileReinvestmentPriority,
  extractionGrowthHeadroom,
} from "@/lib/turn/npp/fragileMarketSupply";
import { CAPITAL_DEPRECIATION_PER_TURN } from "@/lib/market/capital";
import { operatorMay, operatorAllowsPlacement } from "./rules/operatorPolicy";
import { isMarketSaturated } from "@/lib/turn/npp/rules/marketSaturation";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import { existingPlantGrowthStep, existingPlantGrowthUnits } from "./rules/existingPlantGrowth";
import { sizeShortageGrowthFinance } from "@/lib/turn/npp/rules/shortageGrowthFinance";
import { growthEvidenceGate } from "./rules/growthEvidenceGate";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import { floorUnitsToPlants } from "@/lib/corporations/wholePlants/rules";
import type { Corporation } from "@/lib/db/types";
import type { GroupDirection } from "@/lib/corporations/groups/managementTypes";
import type { CorporationManagementCohort } from "@/lib/corporations/balanceAudit/rules";
import type { StrategyLevers } from "@/lib/turn/npp/corpStrategy";
import type { OperatorPermissions } from "@/lib/turn/npp/rules/operatorPolicy";

/** Chooses capacity reinvestments for held plants; returns the remaining cash. */
export function decideNppCapacityReinvestment({
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
}: {
  plants: NppPlantsContext | undefined;
  corp: Corporation;
  groupDirection: GroupDirection | undefined;
  ctx: NppCorpDecisionContext;
  unownedByCountry: Map<string, UnownedSector[]>;
  autopilot: boolean;
  cashLocal: number;
  effectiveCashFloor: number;
  capacityCohort: CorporationManagementCohort;
  rivalCount: (stateId: string, sectorType: string) => number;
  cashToAnchor: (amountLocal: number) => number;
  capacityObservations: CapacityDecisionObservation[];
  sectorProfits: SectorProfitInfo[];
  operatingCorpType:
    | "financial"
    | "media"
    | "manufacturing"
    | "chemical_industries"
    | "healthcare"
    | "retail"
    | "technology"
    | "energy"
    | "agriculture"
    | "real_estate"
    | "construction"
    | "defense"
    | "telecommunications"
    | "logistics"
    | "extraction"
    | "manufacturing_vehicles"
    | "media_entertainment";
  primaryIndustryOnly: boolean;
  divestedSectorIds: ObjectId[];
  stateControlled: ReadonlySet<string>;
  cashRunCut: boolean;
  floorHold: boolean;
  placementSignals: PlacementSignals | undefined;
  priceRatioOf: CommodityPriceRatioFn;
  levers: StrategyLevers;
  operator: OperatorPermissions;
  toCorpLocal: (amountAnchor: number) => number;
  nationalShare: (
    countryId: string,
    sectorType: CorporationType,
    industryModel?: string | null,
    mediaDiscriminator?: string | null
  ) => number;
  commodityRatioFor: (sector: CorporateSector, extraUnits: number) => number;
  borrowAllowed: boolean;
  sectorEconomicToCorpLocal: (amount: number, sector: CorporateSector) => number;
  totalIncome: number;
  constructionFinanceIntents: NonNullable<NppCorpDecision["constructionFinanceIntents"]>;
  sectorUpdates: NppCorpDecision["sectorUpdates"];
  now: Date;
  reinvestments: NonNullable<NppCorpDecision["reinvestments"]>;
}) {
  if (plants?.enabled && !isStateOwned(corp) && groupDirection?.allowInvestment !== false) {
    // Shared-snapshot pool lookup; see reinvestCandidatePool. The shell builds
    // one for the cohort: the index is a pure function of the pool snapshot, so
    // rebuilding it per corporation walked every unowned row again per corp.
    const poolFor = ctx.reinvestPoolFor ?? createReinvestPoolLookup(unownedByCountry);

    const candidates: ReinvestCandidate[] = [];
    // Autopilot commits at most a fixed share of cash above the floor to new
    // capacity per turn, spread over candidates in ranking order. NPP corps
    // are unbounded here (their own rails apply).
    const autopilotCapexBudgetTurn = autopilot
      ? autopilotCapexBudgetLocal(cashLocal, effectiveCashFloor)
      : Number.POSITIVE_INFINITY;
    let autopilotCapexSpent = 0;
    // `plants` narrowing does not persist into the pool callback below.
    const plantsEraUnitScale = plants.eraUnitScale;
    // Observation for one evaluated reinvestment candidate; see
    // capacityDecisionTelemetry. `readCashLocal` tracks the running balance so
    // unpriced gates observe headroom as current cash.
    const { observe: observeReinvestCandidate, observePriced: observePricedReinvestCandidate } =
      createReinvestCapacityObserver({
        cohort: capacityCohort,
        competitorCountOf: rivalCount,
        cashToAnchor,
        readCashLocal: () => cashLocal,
        poolHeadroomOf: (sector) =>
          reinvestPoolHeadroomUnits(poolFor, sector, corp.countryId, plantsEraUnitScale),
        push: (observation) => capacityObservations.push(observation),
      });

    for (const sp of sectorProfits) {
      const sector = sp.sector;
      if (
        !allowsNppIndustryInvestment(
          operatingCorpType,
          getOperatingSectorType(
            sector.sectorType,
            sector.industryModel,
            sector.mediaDiscriminator
          ),
          primaryIndustryOnly
        )
      )
        continue;
      // Nothing built yet (a newborn founding, or a pre-flip sector still
      // awaiting its transition order): there is no capacity to maintain and no
      // fill telemetry to justify a build.
      const capitalStock = sector.capitalStock ?? 0;
      // Queue-array ceiling — see the constant for why this is not the
      // rationing dial.
      const queueDepth = sector.buildQueue?.length ?? 0;
      // (a) Is it selling what it makes? Persisted units telemetry only — no
      // telemetry means no evidence, and no evidence means no build.
      const produced = sector.producedUnits ?? 0;
      const sold = sector.soldUnits ?? 0;
      const fill = gateFill(
        ctx.productFillStage,
        (sector.producerSettlement as { products?: ProductFillRow[] } | null | undefined)?.products,
        produced,
        sold
      );
      // (b) Is there room in the market to absorb more output? Same unowned
      // pool the founding path sizes and draws against.
      const sectorCountryId = sector.countryId ?? corp.countryId;
      // Pre-sizing gates in precedence order; the first rejection is observed
      // for the capacity funnel instead of silently skipped.
      const preSizingGate = evaluateReinvestPreSizingGate({
        divested: divestedSectorIds.includes(sector._id),
        mothballed: sector.mothballed === true,
        no_capacity: !(capitalStock > 0),
        queue_full: queueDepth >= NPP_REINVEST_MAX_QUEUE_DEPTH,
        no_telemetry: !(produced > 0),
        fill_below_min: produced > 0 && fill < NPP_REINVEST_MIN_FILL,
        state_controlled: stateControlled.has(
          bucketKey(
            sector.stateId,
            sector.sectorType,
            sector.industryModel,
            sector.mediaDiscriminator
          )
        ),
        property_unavailable: !!sector.forSale || hasProtectedConstructionProperty(sector),
        cash_cut_run: cashRunCut || (floorHold && !ctx.shortageGrowthFinance),
      });
      if (preSizingGate) {
        observeReinvestCandidate(preSizingGate, sector, capitalStock, null, 0, null);
        continue;
      }
      // Headroom is a gate on GROWTH, never on REPLACEMENT. A bucket an
      // incumbent fills has ZERO unowned headroom, and depreciation never
      // returns capacity to the pool, so gating the whole build on headroom
      // would block reinvestment exactly where it is needed.
      //   • REPLACEMENT (δ) buys back capacity that wore out in this market. It
      //     adds no world capacity, so it needs no headroom and draws nothing.
      //   • GROWTH (g) is genuine new capacity: headroom-gated, clamped to a
      //     quarter of the pool and drawn out of it, exactly as founding is.
      // This matches the player path: `buildCapacity` (a top-up) is not
      // headroom-gated, while `expandSector` (an entry) draws the pool.
      const headroomUnits = reinvestPoolHeadroomUnits(
        poolFor,
        sector,
        corp.countryId,
        plants.eraUnitScale
      );

      // Sizing: replacement restores worn capacity; growth (below) is a
      // separate cash-and-demand decision that no longer reads targetGrowthRate.
      // fill = MIN_FILL ⇒ 0.5×, fill = 1 (sold out) ⇒ 1×. A sector that is only
      // just clearing its output gets a half-sized build, not zero: it still
      // has to replace what wore out.
      const fillScale =
        0.5 +
        0.5 *
          Math.min(1, Math.max(0, (fill - NPP_REINVEST_MIN_FILL) / (1 - NPP_REINVEST_MIN_FILL)));
      // Replacement is sized off the capacity the plant actually RUNS, not off
      // its nameplate. Under plants a sector's output is throughput- and
      // clearing-bound (measured median utilization 0.85 against 0.996 in the
      // capital arm), so the idle remainder is capacity the corp is already
      // paying IDLE_UPKEEP_FRACTION on for nothing — worth ~4.9 points of
      // margin at the A/B's median. Replacing the nameplate would buy that idle
      // share back every turn in perpetuity; replacing the RUN capacity lets it
      // depreciate away and the plant converges on the size it can actually
      // sell.
      // A funded world takes the settled capacity from the receipt.
      const productionCapacity =
        nppOperatingCapacityUnits(sector, ctx.fundedWorldEpoch) ?? capitalStock;
      const utilizationOfOwnedCapacity =
        productionCapacity > 0
          ? Math.max(0, Math.min(1, (sector.producedUnits ?? 0) / productionCapacity))
          : 0;
      const runUnits = capitalStock * utilizationOfOwnedCapacity;
      // ACCRUAL, not a per-turn slice. A build lands `CAPACITY_BUILD_TURNS`
      // turns after it is placed, and the queue ceiling can stop the corp
      // ordering for a stretch; sizing each order off the depreciation that has
      // accrued since the LAST order makes the capacity bought independent of
      // how often the corp got to order. Capped at one build cycle so a sector
      // that has never ordered (or whose queue just emptied after a long gap)
      // cannot place a giant catch-up build.
      const buildCycle = Math.max(1, CAPACITY_BUILD_TURNS(sector.sectorType));
      const lastOrderTurn = (sector.buildQueue ?? []).reduce(
        (latest, o) => (Number.isFinite(o.startTurn) ? Math.max(latest, o.startTurn) : latest),
        Number.NEGATIVE_INFINITY
      );
      const accrualTurns = Number.isFinite(lastOrderTurn)
        ? Math.min(buildCycle, Math.max(0, ctx.turn - lastOrderTurn))
        : 1;
      // Stranded-plant decay (supply-dislocation P1b): in a state whose own
      // market is deep-glut for this sector's outputs, replace only half of
      // what wears out. Full replacement held every misplaced plant at its
      // built size forever; half lets it shrink toward what its state can
      // absorb while a plant in a starved state replaces in full. Growth is
      // already state-tilted via targetGrowthRate (section 2a).
      // A mine is scored only on the resources its state holds, so a shortage
      // it cannot extract neither props up its replacement nor its growth.
      const statePriceRatioOf = depositAwarePriceRatioOf(
        sector.sectorType,
        sector.stateId,
        placementSignals,
        (commodity, cid) =>
          placementSignals?.statePriceRatioOf?.(commodity, sector.stateId) ??
          priceRatioOf(commodity, cid)
      );
      // A mine is also scored only on what its recipe sells: an oil and gas
      // well must not grow on a coal or rare earth shortage while crude sits
      // at the price floor (rules/plantOutputShortage).
      const stateShortage = plantShortageScore(sector, sectorCountryId, statePriceRatioOf);
      const peakStateShortage = plantPeakShortageScore(sector, sectorCountryId, statePriceRatioOf);
      const criticalShortage = peakStateShortage >= ESSENTIAL_SHORTAGE_SCORE;
      const interventionPriority = fragileReinvestmentPriority(
        sector,
        sectorCountryId,
        placementSignals,
        priceRatioOf,
        ctx.turn
      );
      const strandedDecayScale = stateShortage <= 0.85 ? 0.5 : 1;
      const accruedReplacementUnits =
        runUnits *
        CAPITAL_DEPRECIATION_PER_TURN *
        accrualTurns *
        fillScale *
        strandedDecayScale *
        NPP_REINVEST_AGGRESSION;
      // Two pending builds already cover this plant's current investment
      // cadence. Do not fill the larger storage-only queue with a tiny
      // replacement order every turn: those orders occupied all 20 slots in
      // chronic shortages and prevented the meaningful growth leg from ever
      // reopening. Replacement accrual catches up when a slot lands.
      const replacementUnits =
        queueDepth >= NPP_REINVEST_MAX_GROWTH_QUEUE_DEPTH ? 0 : accruedReplacementUnits;
      // GROWTH — build from nothing, sized by cash and demand, exactly as a
      // player tops up a plant with `buildCapacity`. Demand-side sectors do not
      // use the unowned pool as a hard cap: their proven sell-through is the
      // demand signal and the affordability rail limits the order. Extraction
      // is different. Its physical market is the state's finite deposit, so the
      // deposit headroom signal gates and scales new growth. Without that second
      // gate a rare-earth price spike could make a mine keep adding capacity
      // after the state's geology was already exhausted; production was capped,
      // but the balance sheet and national sector mix kept inflating.
      const utilization = capitalStock > 0 ? runUnits / capitalStock : 0;
      const extractionHeadroom =
        sector.sectorType === "extraction"
          ? extractionGrowthHeadroom(sector, placementSignals, ctx.turn)
          : 1;
      // Growth is bounded by capacity IN FLIGHT, not by how many orders are
      // pending. The old gate counted orders, so two replacement-sized slices
      // (each ~0.05% of the plant, placed while growth was briefly ineligible)
      // shut growth out for a whole build cycle: on the live 1991 world 80% of
      // retail capacity, 87% of real estate and 58% of healthcare sat in plants
      // with a healthy fill and two trivial orders pending, in markets running
      // at 30% of demand. Two full-size growth orders is the in-flight ceiling.
      const pendingUnits = (sector.buildQueue ?? []).reduce(
        (sum, o) => sum + (Number.isFinite(o.unitsOrdered) ? Math.max(0, o.unitsOrdered) : 0),
        0
      );
      const canGrow =
        // Autopilot never grows on a shortage alone: the plant must already earn.
        (sp.isProfitable || (criticalShortage && !autopilot)) &&
        levers.allowGrowthCapex &&
        // Growth only: replacing worn capacity is upkeep, so a placement limit never stops it.
        operatorMay(operator, "grow") &&
        operatorAllowsPlacement(
          operator,
          getOperatingSectorType(
            sector.sectorType,
            sector.industryModel,
            sector.mediaDiscriminator
          ),
          sectorCountryId
        ) &&
        !(ctx.retailExpansionPaused && sector.sectorType === "retail") &&
        stateShortage > NPP_GROWTH_MIN_SHORTAGE &&
        // Utilization is measured on throttled output. In a critical shortage
        // the throttle, not demand, is what holds the run rate down, so the
        // gate would lock out exactly the capacity the market is missing.
        // A price-read shortage cannot override a cell whose incumbents the
        // throttle already holds deep under capacity (rules/marketSaturation).
        (utilization >= NPP_GROWTH_MIN_UTILIZATION ||
          (criticalShortage &&
            !isMarketSaturated(placementSignals?.marketSaturationOf?.(sector)))) &&
        (sector.sectorType !== "extraction" || extractionHeadroom > 0);
      // Existing plants pay the same dominance-tolled list price as players.
      const growthShare =
        capitalStock > 0
          ? Math.min(100, (100 * capitalStock) / (capitalStock + Math.max(0, headroomUnits)))
          : 0;
      const perUnitGrowthLocal = canGrow
        ? toCorpLocal(
            computeBuildCost({
              sectorType: sector.sectorType,
              industryModel: sector.industryModel,
              mediaDiscriminator: sector.mediaDiscriminator,
              units: 1,
              strategyId: sector.strategyId ?? null,
              year: plants.year,
              preset: plants.preset,
              eraUnitScale: plants.eraUnitScale,
              marketSharePercent: growthShare,
              nationalMarketSharePercent: nationalShare(
                sectorCountryId,
                sector.sectorType,
                sector.industryModel,
                sector.mediaDiscriminator
              ),
              primeRate: plants.primeRateOf(sectorCountryId),
              commodityDominanceRatio: commodityRatioFor(sector, 1),
              acumen: NEUTRAL_STAT,
              hostCostOfLivingIndex: plants.costOfLivingOf(sector.stateId),
              founding: false,
            }).totalAnchor
          )
        : 0;
      // A firm behind a dominant sector leader deploys more of its surplus and
      // steps faster. The leader and healthy sectors read 1, so nothing slows.
      // Autopilot is a hands-off owner's money: no catch-up boost.
      const challengerPull = autopilot
        ? 1
        : Math.max(1, ctx.challengerBoostOf?.(sector.sectorType, corp._id.toString()) ?? 1);
      const growthBudgetLocal = autopilot
        ? autopilotCapexBudgetTurn * AUTOPILOT_CAPEX_SIZING_SLACK
        : Math.max(0, cashLocal - effectiveCashFloor) *
          Math.min(1, NPP_GROWTH_DEPLOY_FRACTION * challengerPull);
      // Demand anchor: grow by at most this share of proven throughput a turn
      // (at least one unit for demand-side sectors), not the whole treasury
      // at once. Extraction growth is additionally scaled by finite deposit
      // headroom and never floors up to a facility when the deposit cannot
      // support one.
      const growthStepOfRun = autopilot
        ? AUTOPILOT_GROWTH_STEP_OF_RUN
        : Math.min(1, NPP_GROWTH_MAX_STEP_OF_RUN * challengerPull);
      const growthStepUnits =
        sector.sectorType === "extraction"
          ? Math.floor(runUnits * growthStepOfRun * extractionHeadroom)
          : existingPlantGrowthStep(runUnits, growthStepOfRun);
      const growthCapUnits = Math.min(
        growthStepUnits,
        Math.floor(
          growthStepUnits *
            (autopilot
              ? AUTOPILOT_MAX_INFLIGHT_GROWTH_STEPS
              : NPP_REINVEST_MAX_GROWTH_QUEUE_DEPTH) -
            pendingUnits
        )
      );
      // Existing-site top-ups use the player's one-unit minimum. Keep the
      // throughput step, in-flight ceiling and protected cash reserve; a full
      // facility minimum belongs to greenfield entry, not an operating plant.
      const affordableGrowthUnits =
        canGrow && perUnitGrowthLocal > 0
          ? Math.floor(
              Math.min(
                growthBudgetLocal / perUnitGrowthLocal,
                growthCapUnits,
                MAX_BUILD_UNITS_PER_ORDER
              )
            )
          : 0;
      let growthUnits = existingPlantGrowthUnits(affordableGrowthUnits, growthCapUnits);
      const shortageSizing =
        ctx.shortageGrowthFinance && !autopilot && borrowAllowed && canGrow && sp.isProfitable
          ? sizeShortageGrowthFinance(ctx.shortageGrowthFinance, sector, {
              sectorProfitLocal: sectorEconomicToCorpLocal(sp.income, sector),
              operatingCapacityUnits: productionCapacity,
              perUnitBuildCostLocal: perUnitGrowthLocal,
              stepCapUnits: Math.min(growthCapUnits, MAX_BUILD_UNITS_PER_ORDER),
              cashLocal,
              cashFloorLocal: effectiveCashFloor,
            })
          : null;
      if (shortageSizing) growthUnits = Math.max(growthUnits, shortageSizing.growthUnits);
      // Market-throttle and input-starvation evidence (rules/growthEvidenceGate)
      // refuse the growth leg; replacement of worn capacity still goes through.
      const evidenceGate =
        growthUnits > 0
          ? growthEvidenceGate(sector, { autopilot, fundedWorldEpoch: ctx.fundedWorldEpoch })
          : null;
      if (evidenceGate) {
        growthUnits = 0;
        observeReinvestCandidate(
          evidenceGate,
          sector,
          capitalStock,
          headroomUnits,
          replacementUnits,
          null
        );
      }
      // Autopilot builds only where the plant already earns, the market has
      // room and the order repays itself; a refused growth leg still lets the
      // replacement leg through.
      let autopilotGate: ReturnType<typeof evaluateAutopilotGrowthGate> = null;
      if (autopilot && growthUnits > 0) {
        growthUnits = autopilotBoundGrowthUnits(growthUnits, headroomUnits);
        autopilotGate = evaluateAutopilotGrowthGate({
          sectorProfitLocal: sectorEconomicToCorpLocal(sp.income, sector),
          operatingCapacityUnits: productionCapacity,
          corpEarningsLocal: totalIncome,
          growthUnits,
          growthCostLocal: perUnitGrowthLocal * growthUnits,
          demandHeadroomUnits: headroomUnits,
        });
        if (autopilotGate) {
          growthUnits = 0;
          // Recorded even when the replacement leg still places, so a refused
          // growth leg is never invisible in the capacity funnel.
          observeReinvestCandidate(
            autopilotGate,
            sector,
            capitalStock,
            headroomUnits,
            replacementUnits,
            null
          );
        }
      }
      const rawUnits = replacementUnits + growthUnits;
      // Whole plants: an NPP orders whole plants, at least one.
      const units =
        plants?.wholePlants && rawUnits > 0
          ? Math.max(
              plantSizeForSector(sector),
              floorUnitsToPlants(rawUnits, plantSizeForSector(sector))
            )
          : rawUnits;
      if (!(units > 0)) {
        if (!autopilotGate && !evidenceGate) {
          observeReinvestCandidate(
            "below_minimum_order",
            sector,
            capitalStock,
            headroomUnits,
            units,
            null
          );
        }
        continue;
      }

      candidates.push({
        sector,
        units,
        growthUnits,
        fill,
        headroomUnits,
        interventionPriority,
        shortageGrowth: growthUnits > 0 ? shortageSizing?.shortageGrowth : undefined,
      });
    }

    // The governed treatment first reallocates the existing build slot to a
    // critically short fragile market. Normal ranking then uses sell-through
    // and headroom, including the build size so replacement candidates differ.
    candidates.sort(
      (a, b) =>
        Number(groupDirection?.regions.includes(b.sector.stateId) ?? false) -
          Number(groupDirection?.regions.includes(a.sector.stateId) ?? false) ||
        Number(b.interventionPriority > 0) - Number(a.interventionPriority > 0) ||
        b.interventionPriority - a.interventionPriority ||
        b.fill * (b.headroomUnits + b.units) - a.fill * (a.headroomUnits + a.units)
    );

    let placed = 0;
    for (const candidate of candidates) {
      if (placed >= NPP_REINVEST_MAX_SECTORS_PER_TURN) break;
      const { sector, units } = candidate;

      // Price on the harsher of local footprint and national sector share.
      const capitalStock = sector.capitalStock ?? 0;
      const bucketTotal = capitalStock + candidate.headroomUnits;
      const marketSharePercent = bucketTotal > 0 ? (100 * capitalStock) / bucketTotal : 0;

      // Keep the breakdown for capacity-decision telemetry.
      const reinvestPrice = computeBuildCost({
        sectorType: sector.sectorType,
        industryModel: sector.industryModel,
        mediaDiscriminator: sector.mediaDiscriminator,
        units,
        strategyId: sector.strategyId ?? null,
        year: plants.year,
        preset: plants.preset,
        eraUnitScale: plants.eraUnitScale,
        marketSharePercent,
        nationalMarketSharePercent: nationalShare(
          sector.countryId ?? corp.countryId,
          sector.sectorType,
          sector.industryModel,
          sector.mediaDiscriminator
        ),
        // Replacement units re-lay capacity that is wearing out; only the
        // growth part raises the firm's potential output.
        commodityDominanceRatio: commodityRatioFor(sector, candidate.growthUnits),
        primeRate: plants.primeRateOf(sector.countryId ?? corp.countryId),
        // An NPP CEO is an NPP, not a Character — no Business Acumen to read.
        acumen: NEUTRAL_STAT,
        hostCostOfLivingIndex: plants.costOfLivingOf(sector.stateId),
        // NOT a founding build: this plant already exists, so the founding
        // discount does not apply. An NPP topping up capacity pays the same
        // list price a player pays through `buildCapacity`.
        founding: false,
      });
      const costAnchor = reinvestPrice.totalAnchor;
      const costLocal = toCorpLocal(costAnchor);

      // Affordability. Nobody builds free — this is also the SOE capex
      // discipline: a state enterprise pays cash for its builds like anyone
      // else, and the CIP it creates is what the remittance pass amortizes
      // (CAPEX_AMORTIZATION_PER_TURN) instead of being swept to the treasury.
      //
      // Two rails, because the two legs are different decisions. A build with a
      // GROWTH leg is a discretionary bet and faces the same entry floor the
      // founding path uses. A REPLACEMENT-ONLY build is maintenance, rationed
      // as a share of cash (see NPP_REINVEST_MAINTENANCE_CASH_SHARE).
      // A zero or negative charge is not a buildable quote: observe it as a
      // sizing rejection, the same outcome as sizing to non-positive units.
      if (!(costLocal > 0)) {
        observeReinvestCandidate(
          "below_minimum_order",
          sector,
          capitalStock,
          candidate.headroomUnits,
          units,
          null
        );
        continue;
      }
      // Autopilot's per-turn capex ceiling, shared by every growth order in
      // ranking order. A refused order frees the budget for the next candidate.
      if (
        autopilot &&
        candidate.growthUnits > 0 &&
        autopilotCapexSpent + costLocal > autopilotCapexBudgetTurn
      ) {
        observePricedReinvestCandidate(
          "autopilot_capex_cap",
          sector,
          capitalStock,
          candidate.headroomUnits,
          units,
          costAnchor,
          reinvestPrice.dominanceMultiplier,
          cashToAnchor(cashLocal)
        );
        continue;
      }
      const affordable =
        candidate.growthUnits > 0
          ? cashLocal - costLocal >= effectiveCashFloor
          : costLocal <= Math.max(0, cashLocal) * NPP_REINVEST_MAINTENANCE_CASH_SHARE &&
            cashLocal - costLocal > 0;
      const buildTurns = Math.max(1, CAPACITY_BUILD_TURNS(sector.sectorType));
      const order: SectorBuildOrder = {
        unitsOrdered: units,
        strategyId: sector.strategyId ?? null,
        costPaidAnchor: costAnchor,
        startTurn: ctx.turn,
        onlineTurn: ctx.turn + buildTurns,
        smooth: true,
        ...(plants?.wholePlants ? { plantUnits: plantSizeForSector(sector) } : {}),
      };
      if (!affordable) {
        const cashContributionLimitLocal =
          candidate.growthUnits > 0
            ? Math.max(0, cashLocal - effectiveCashFloor)
            : Math.max(0, Math.min(cashLocal, cashLocal * NPP_REINVEST_MAINTENANCE_CASH_SHARE));
        // An operator barred from borrowing never queues a financing request.
        if (borrowAllowed) {
          constructionFinanceIntents.push({
            sector,
            order,
            costLocal,
            cashContributionLimitLocal,
            growthUnits: candidate.growthUnits,
            priority: candidate.interventionPriority,
            fill: candidate.fill,
            shortageGrowth: candidate.growthUnits > 0 ? candidate.shortageGrowth : undefined,
          });
        }
        observePricedReinvestCandidate(
          "insufficient_cash",
          sector,
          capitalStock,
          candidate.headroomUnits,
          units,
          costAnchor,
          reinvestPrice.dominanceMultiplier,
          cashToAnchor(cashLocal - costLocal)
        );
        continue;
      }

      // ─── The queue write is a DELTA, never a whole-array `$set` ───────────
      //
      // `sector.buildQueue` is a snapshot read at the top of this turn phase.
      // A `$set` of the recomputed array would land AFTER `sectorTurn`'s own
      // `$pull` of the orders that completed this turn (bulkWrite is ordered,
      // and the NPP ops are appended last), resurrecting every landed order —
      // the capacity would be delivered again on the next tick. It would also
      // erase any order a player CEO placed during the phase. `$push` touches
      // only what this decision actually owns, and composes with both.
      // Same rule, same reason as `sectorTurn`'s C4 note.
      sectorUpdates.push({
        filter: {
          _id: sector._id,
          corporationId: corp._id,
          ...unprotectedConstructionPropertyFilter(),
        },
        update: {
          $set: { updatedAt: now },
          $push: { buildQueue: order },
        },
      });
      // Growth builds from nothing — a plant top-up does not draw the unowned
      // pool, exactly as a player's `buildCapacity` does not. The pool is not a
      // finite budget builds are rationed against; capacity is created by paying
      // for it. (Market share stays well-defined: owned capacity rises, so the
      // owner's share of owned+headroom rises, without touching the pool.)
      cashLocal -= costLocal;
      autopilotCapexSpent += costLocal;
      reinvestments.push({
        sectorId: sector._id,
        sectorType: sector.sectorType,
        units,
        costAnchor,
        costLocal,
        onlineTurn: order.onlineTurn,
      });
      // Observed after the spend: headroom is cash after the charged cost,
      // the same post-cost headroom the player path records.
      observePricedReinvestCandidate(
        "placed",
        sector,
        capitalStock,
        candidate.headroomUnits,
        units,
        costAnchor,
        reinvestPrice.dominanceMultiplier,
        cashToAnchor(cashLocal)
      );
      placed += 1;
    }
  }
  return { cashLocal };
}
