import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import { plantLaborShare } from "@/lib/corporations/plantCosts/rules";
import { stagedLaborShare } from "@/lib/market/marketRecoveryStages";
import type { CorporateSector } from "@/lib/db/types";
import {
  accumulateAutomationIndex,
  accumulateWageIndex,
  clampWageLevel,
  computeSectorLaborCost,
  getSectorLaborShare,
  makeAutomationIndexAccumulator,
  makeWageIndexAccumulator,
  minWageFloorMultiplier,
  type LabourContext,
  WAGE_LEVEL_MIN,
} from "@/lib/labour/laborCost";
import {
  STRIKE_MARGIN_PENALTY_PP,
  STRIKE_REVENUE_THROTTLE,
  lawAdjustedUnionizationThreshold,
  stepStrike,
  trendWorkerExpectation,
} from "@/lib/labour/strikes";
import {
  realWageIndex,
  trendUnionization,
  unionPremium,
  unionizationDriftTarget,
} from "@/lib/labour/unionization";
import {
  undergroundDensityAfterBanTurn,
  undergroundOutputFactor,
  undergroundSectorKey,
} from "@/lib/unions/undergroundEffects";
import { servicesStrikeSoftening } from "@/lib/unions/unionServices";
import { displacedWorkers } from "@/lib/societyPressures/rules/automation";
import {
  accumulateLabourDemand,
  filledWorkers,
  glideStaffingFactor,
  relativeWageBid,
  staffingFactorFromTightness,
  type LabourDemandByState,
} from "@/lib/labour/labourMarket";
import { calculateWorkers } from "@/lib/constants/corporations";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import type { SectorTurnEnv } from "./sectorTurnTypes";

export interface SectorLabourProductionEffects {
  strikeActive: boolean;
  outputFactor: number;
  strikeMarginModifier: number;
  /**
   * Pro rata share of desired headcount the sector's state can actually supply,
   * 0 to 1. Exactly 1 wherever the labour market is not oversubscribed.
   */
  staffingFactor: number;
}

/**
 * Resolve labour action effects once for every revenue path in sectorTurn.
 * The legacy revenue anchor and plants output are alternatives, so both consume
 * the same factor. Plants idle-upkeep also receives it only to classify action-
 * idled capacity as involuntary rather than owner-idled capacity.
 */
export function resolveSectorLabourProductionEffects(
  labour: LabourContext,
  sector: Pick<
    CorporateSector,
    "_id" | "sectorType" | "strikeStartedAtTurn" | "labourStaffingFactor" | "wageLevel"
  >,
  stateLabourTightness?: number,
  stateDemandWageIndex?: number,
  sectorCountryId?: string
): SectorLabourProductionEffects {
  const protectedByAgreement =
    labour.noStrikeProtectedSectorIds?.has(sector._id.toString()) === true;
  const banned =
    sectorCountryId !== undefined && labour.unionsBannedByCountry?.has(sectorCountryId) === true;
  // Settlement takes effect before this turn's revenue is calculated. The
  // strike state machine clears persisted state later in the same sector pass,
  // but labor peace must also suppress the production hit immediately.
  const strikeActive =
    labour.unionsEnabled === true &&
    sector.strikeStartedAtTurn != null &&
    !protectedByAgreement &&
    !banned;
  const rawIndustrialActionFactor =
    labour.unionsEnabled === true
      ? labour.industrialActionOutputFactorBySectorId?.get(sector._id.toString())
      : undefined;
  const industrialActionFactor =
    typeof rawIndustrialActionFactor === "number" && Number.isFinite(rawIndustrialActionFactor)
      ? Math.max(0, Math.min(1, rawIndustrialActionFactor))
      : 1;
  const strikeFactor = strikeActive ? 1 - STRIKE_REVENUE_THROTTLE : 1;
  const undergroundStrength =
    banned && labour.fullEnabled
      ? (labour.undergroundStrengthByCountrySector?.get(
          undergroundSectorKey(sectorCountryId, sector.sectorType)
        ) ?? 0)
      : 0;

  // Phase 2 labour rationing. A state's sectors cannot collectively staff more
  // people than the state has, so each fills the same pro rata share of what it
  // asked for and the capacity it could not staff does not produce.
  //
  // Folded into `outputFactor` rather than returned as a separate leg because
  // that factor is already threaded through every revenue and production path
  // in sectorTurn; a separate leg would have to be remembered at four call
  // sites and would be silently dropped at whichever one was missed. It is
  // exactly the same shape as the strike throttle sitting beside it: labour the
  // sector does not have does not make output.
  // Glided from last turn's value rather than snapped to target, so a state
  // that newly reads oversubscribed loses output over ten turns instead of one.
  // See LABOUR_STAFFING_MAX_TURN_MOVE for why this is not capacityHaircutFactor.
  const sectorWage = labour.wagesEnabled ? clampWageLevel(sector.wageLevel ?? 1) : 1;
  const stateWage = labour.wagesEnabled ? stateDemandWageIndex : 1;
  // Pay above the state's going rate fills openings faster, not only a larger share.
  const staffingFactor = glideStaffingFactor(
    staffingFactorFromTightness(stateLabourTightness, sectorWage, stateWage),
    sector.labourStaffingFactor,
    labour.wagesEnabled ? relativeWageBid(sectorWage, stateWage) : 1
  );

  return {
    strikeActive,
    outputFactor:
      strikeFactor *
      industrialActionFactor *
      staffingFactor *
      undergroundOutputFactor(undergroundStrength),
    strikeMarginModifier: strikeActive ? STRIKE_MARGIN_PENALTY_PP : 0,
    staffingFactor,
  };
}

/**
 * Resolve a sector's headcount for the turn: what it WANTS at its current
 * revenue, and what its state's labour market lets it actually STAFF.
 *
 * Owns workforce-skill resolution because skill only exists here to size
 * headcount. Playable regions resolve skill from the political board
 * (`education.adultSkills`, 0-100 higher-better) when the state has no
 * metric-engine reading.
 *
 * Records DESIRED headcount into the per-state demand accumulator, never the
 * staffed figure: next turn's tightness sums that accumulator, so recording the
 * rationed result would drive the reading toward 1 and switch rationing back
 * off. Accumulation happens here, not in `resolveSectorLabourEconomics`, because
 * that function early-returns when `labour.wagesEnabled` is off.
 */
export function resolveSectorHeadcount(args: {
  revenue: number;
  stateId: string;
  rawWorkforceSkillByState: Map<string, number>;
  politicalBoard: Record<string, number> | undefined;
  staffingFactor: number;
  labourDemandByState: LabourDemandByState;
  labourDemandWageIndexByState?: Map<string, import("@/lib/labour/laborCost").WageIndexAccumulator>;
  wageLevel?: number;
  /**
   * Funded producer turn: the plant's own staffed headcount at its funded run.
   * It replaces the revenue-implied figure, so the labour market sees the
   * workers the plan actually employs rather than nameplate staffing.
   */
  fundedHeadcount?: { desiredWorkers: number; workers: number };
  /**
   * 2027 world: crew per unit relative to a conventional plant, below 1 for
   * automation methods. A funded headcount already carries it.
   */
  labourPerUnitFactor?: number;
  /** 2027 world: per-state workers automation no longer employs. */
  automationDisplacedByState?: Map<string, number>;
}): { desiredWorkers: number; workers: number } {
  const rawSkill =
    args.rawWorkforceSkillByState.get(args.stateId) ??
    args.politicalBoard?.["education.adultSkills"] ??
    null;
  const factor = args.labourPerUnitFactor ?? 1;
  const desiredWorkers = args.fundedHeadcount
    ? args.fundedHeadcount.desiredWorkers
    : factor < 1
      ? Math.max(1, Math.round(calculateWorkers(args.revenue, rawSkill) * factor))
      : calculateWorkers(args.revenue, rawSkill);
  accumulateLabourDemand(args.labourDemandByState, args.stateId, desiredWorkers);
  if (args.automationDisplacedByState) {
    accumulateLabourDemand(
      args.automationDisplacedByState,
      args.stateId,
      displacedWorkers(desiredWorkers, factor)
    );
  }
  if (args.labourDemandWageIndexByState) {
    let wageDemand = args.labourDemandWageIndexByState.get(args.stateId);
    if (!wageDemand) {
      wageDemand = makeWageIndexAccumulator();
      args.labourDemandWageIndexByState.set(args.stateId, wageDemand);
    }
    accumulateWageIndex(wageDemand, desiredWorkers, clampWageLevel(args.wageLevel ?? 1), 1);
  }
  return {
    desiredWorkers,
    workers: args.fundedHeadcount
      ? args.fundedHeadcount.workers
      : filledWorkers(desiredWorkers, args.staffingFactor),
  };
}

export interface SectorLabourEconomicsInput {
  labour: LabourContext;
  sector: CorporateSector;
  sectorCountryId: string;
  currentTurn: number;
  currentYear?: number;
  hourlyRevenue: number;
  grossMaintenance: number;
  /** Explicit physical costs distinguish semiconductor fabs from service technology. */
  explicitPlantCostsEnabled?: boolean;
  /** Market recovery stage; stage 1 relieves four service payroll rates. */
  marketRecoveryStage?: number;
  computedWorkers: number;
  techLaborCostMultiplier: number;
  /** 2027 world: wage bill multiplier from the hiring subsidy; absent is 1. */
  employerWageCostMultiplier?: number;
  costOfLivingIndex?: number;
  unemploymentRate?: number;
  wageIndexByState: SectorTurnEnv["wageIndexByState"];
  automationIndexByState: SectorTurnEnv["automationIndexByState"];
  pendingStrikeEvents: SectorTurnEnv["pendingStrikeEvents"];
}

export interface SectorLabourEconomicsResult {
  maintenance: number;
  sectorLaborCost: number;
  /**
   * Pay for ONE worker in this sector, per real day, which is what union dues
   * and services are priced against (`annualWageFromDaily` in
   * `src/lib/unions/unionServices.ts`).
   *
   * `sectorLaborCost` is this sector's labour bill for one turn, so per-worker
   * per-turn is that over headcount, and a day is {@link TURNS_PER_DAY} turns.
   * Read back annually (`perTurn * TURNS_PER_YEAR`) it matches the labour bill's
   * own basis, so dues are a true share of pay. Undefined when the sector has
   * no workers, so it contributes no wage rather than Infinity.
   */
  wagePerWorker?: number;
  newUnionization?: number;
  newWorkerExpectationIndex?: number;
  newStrikeStartedAtTurn?: number | null;
  newStrikeCooldownUntilTurn?: number | null;
}

/**
 * Own the complete wage, unionization, and strike state transition for one
 * sector. The caller supplies already-derived revenue and workforce inputs;
 * this module owns labour policy reads, indexes, and next-turn state.
 */
export function resolveSectorLabourEconomics({
  marketRecoveryStage,
  labour,
  sector,
  sectorCountryId,
  currentTurn,
  currentYear,
  hourlyRevenue,
  grossMaintenance,
  explicitPlantCostsEnabled,
  computedWorkers,
  techLaborCostMultiplier,
  employerWageCostMultiplier = 1,
  costOfLivingIndex,
  unemploymentRate,
  wageIndexByState,
  automationIndexByState,
  pendingStrikeEvents,
}: SectorLabourEconomicsInput): SectorLabourEconomicsResult {
  if (!labour.wagesEnabled) {
    return { maintenance: grossMaintenance, sectorLaborCost: 0 };
  }

  // An active agreement is a floor UNDER the employer's own wage level for the
  // life of the agreement, not a rewrite of it. Persisting the floor into
  // `sector.wageLevel` would make every settlement permanent, nothing lowers
  // the field again when the agreement expires, so the term length would
  // carry no meaning and pay would only ever ratchet up.
  const negotiatedWageFloor =
    labour.collectiveAgreementWageFloorBySectorId?.get(sector._id.toString()) ?? WAGE_LEVEL_MIN;
  const wageLevel = Math.max(clampWageLevel(sector.wageLevel ?? 1), negotiatedWageFloor);
  const floorMultiplier = minWageFloorMultiplier(
    sector.sectorType,
    labour.minWageRatioByCountry?.get(sectorCountryId) ?? 0
  );
  const unionsBanned =
    labour.unionsEnabled && labour.unionsBannedByCountry?.has(sectorCountryId) === true;
  const undergroundStrength =
    unionsBanned && labour.fullEnabled
      ? (labour.undergroundStrengthByCountrySector?.get(
          undergroundSectorKey(sectorCountryId, sector.sectorType)
        ) ?? 0)
      : 0;
  const unionPremiumPercent =
    labour.unionsEnabled && !unionsBanned ? unionPremium(sector.unionization ?? 0) : 0;
  const wageMultiplier =
    wageLevel *
    floorMultiplier *
    techLaborCostMultiplier *
    employerWageCostMultiplier *
    (1 + unionPremiumPercent / 100);

  let wageAccumulator = wageIndexByState.get(sector.stateId);
  if (!wageAccumulator) {
    wageAccumulator = makeWageIndexAccumulator();
    wageIndexByState.set(sector.stateId, wageAccumulator);
  }
  accumulateWageIndex(wageAccumulator, computedWorkers, wageLevel, floorMultiplier);

  let automationAccumulator = automationIndexByState.get(sector.stateId);
  if (!automationAccumulator) {
    automationAccumulator = makeAutomationIndexAccumulator();
    automationIndexByState.set(sector.stateId, automationAccumulator);
  }
  accumulateAutomationIndex(automationAccumulator, computedWorkers, techLaborCostMultiplier);

  const split = computeSectorLaborCost({
    hourlyRevenue,
    grossMaintenance,
    // Explicit plants distinguish production methods; legacy modes keep the lane share.
    laborShare0: stagedLaborShare(
      getOperatingSectorType(sector.sectorType, sector.industryModel, sector.mediaDiscriminator),
      explicitPlantCostsEnabled
        ? plantLaborShare({
            sectorType: getOperatingSectorType(
              sector.sectorType,
              sector.industryModel,
              sector.mediaDiscriminator
            ),
            strategyId: sector.strategyId,
            transitionFromStrategyId: sector.transitionFromStrategyId,
            transitionStartTurn: sector.transitionStartTurn,
            currentTurn,
            year: currentYear,
          })
        : getSectorLaborShare(
            getOperatingSectorType(
              sector.sectorType,
              sector.industryModel,
              sector.mediaDiscriminator
            ),
            currentYear
          ),
      marketRecoveryStage
    ),
    wageMultiplier,
  });
  const result: SectorLabourEconomicsResult = {
    maintenance: split.maintenance,
    sectorLaborCost: split.laborCost,
    // Per-worker daily pay, the basis union dues and services are priced
    // against. See the field docs on SectorLabourEconomicsResult.
    wagePerWorker:
      computedWorkers > 0 && Number.isFinite(split.laborCost)
        ? (split.laborCost / computedWorkers) * TURNS_PER_DAY
        : undefined,
  };

  if (!labour.unionsEnabled) return result;

  const unionLawBias = labour.fullEnabled
    ? labour.unionLawBiasByCountry?.get(sectorCountryId)
    : undefined;
  // Resolve the union via the sector's own `representingUnionId`, never by
  // (countryId, sectorType): rival unions can share an industry, and a sector
  // without an id must not inherit another union's approval.
  const representingUnion =
    labour.fullEnabled && sector.representingUnionId
      ? labour.unionsById?.get(sector.representingUnionId.toString())
      : undefined;
  let newUnionization = unionsBanned
    ? undergroundDensityAfterBanTurn(sector.unionization ?? 0, undergroundStrength)
    : trendUnionization(
        sector.unionization ?? 0,
        unionizationDriftTarget({
          wageLevel,
          costOfLivingIndex,
          unemploymentRate,
          minWageKaitzRatio: labour.minWageRatioByCountry?.get(sectorCountryId),
          unionLawBias,
          representingUnionApproval: representingUnion?.approval,
        })
      );
  const realWage = realWageIndex(wageLevel, costOfLivingIndex);
  const newWorkerExpectationIndex = trendWorkerExpectation(sector.workerExpectationIndex, realWage);
  // Union dues v1: service programmes damp the strike trigger's gap for
  // sectors the running union represents. 0 when unrepresented or every
  // service is off, so an unheld sector's strike math is unchanged.
  const strikeSoftening = representingUnion
    ? servicesStrikeSoftening(representingUnion.activeServices)
    : 0;
  const strikeStep = stepStrike({
    unionization: newUnionization,
    realWage,
    workerExpectation: newWorkerExpectationIndex,
    turn: currentTurn,
    prior: {
      strikeStartedAtTurn: sector.strikeStartedAtTurn ?? null,
      strikeCooldownUntilTurn: sector.strikeCooldownUntilTurn ?? null,
    },
    ...(unionLawBias !== undefined && {
      unionizationThreshold: lawAdjustedUnionizationThreshold(unionLawBias),
    }),
    unionsBanned,
    noStrikeProtected: labour.noStrikeProtectedSectorIds?.has(sector._id.toString()) === true,
    strikeSoftening,
  });
  if (strikeStep.unionizationBump > 0) {
    newUnionization = Math.min(100, newUnionization + strikeStep.unionizationBump);
  }
  if (strikeStep.event) {
    pendingStrikeEvents.push({
      sectorId: sector._id.toString(),
      sectorType: sector.sectorType,
      countryId: sectorCountryId,
      event: strikeStep.event,
    });
  }

  return {
    ...result,
    newUnionization,
    newWorkerExpectationIndex,
    newStrikeStartedAtTurn: strikeStep.next.strikeStartedAtTurn,
    newStrikeCooldownUntilTurn: strikeStep.next.strikeCooldownUntilTurn,
  };
}
