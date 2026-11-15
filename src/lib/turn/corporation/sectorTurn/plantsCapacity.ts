/* Plants tier: capacity is AUTHORITATIVE. First plants turn adopts
 * capacity := max(capitalStock, impliedOutputUnits(nameplate)). Capacity
 * then only depreciates here; build orders arrive in P3. Paid basis tracks
 * (book + landed cash) scaled by the same factor, so per-unit basis stays
 * flat. Pure: no reads or writes. */
import { governorAnchorTurn, type GovernorGlide } from "@/lib/market/capital";
import { activeCapacityFraction } from "@/lib/corporations/investment/rules";
import { getStrategyForOperatingModel } from "@/lib/constants/sectorStrategies";
import { seedCapitalStock } from "@/lib/market/capital";
import { unitYieldForSupply } from "@/lib/constants/capacityEconomy";
import type { CorporationType } from "@/lib/constants/corporations";
import { COMMODITY_BASE_PRICES, type CommodityType } from "@/lib/constants/commodities";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import { advanceCapitalStock } from "@/lib/market/capital";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { applyPlantChange } from "@/lib/corporations/wholePlants/rules";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import { healRetoolStockBasis, type RetoolStockBasisHeal } from "@/lib/corporations/retoolRescale";
import {
  retoolOperatingCapacityRatio,
  retoolMeasurementRatio,
} from "@/lib/corporations/retooling/rules";
import type { CorporationLookups } from "../types";

export interface PlantsCapacityInput {
  sector: Pick<
    CorporateSector,
    | "capitalStock"
    | "mothballed"
    | "activeCapacityPercent"
    | "capacityBookAnchor"
    | "plantsStartTurn"
    | "transitionFromStrategyId"
    | "strategyId"
    | "sectorType"
    | "industryModel"
    | "mediaDiscriminator"
    | "transitionStartTurn"
    | "retoolRescaleApplied"
    | "operatingCapacityTurn"
    | "autoStrategyAdoptedAtTurn"
    | "otherOpexPerUnitAnchor"
    | "plantUnitRemainder"
    | "plantWearUnits"
  >;
  corp: Pick<Corporation, "ceoType">;
  /**
   * Active-capacity percent the turn runs the plant at (the NPP/autopilot
   * operating target when one applies). Falls back to the stored field, so the
   * caller can keep the sector document immutable instead of cloning it for
   * one override.
   */
  activeCapacityPercent?: number | null;
  plantsEnabled: boolean;
  isFlipTurn: boolean;
  preFlipNameplateRevenue: number;
  strategySupply: Partial<Record<CommodityType, number>> | undefined;
  eraUnitScale: CorporationLookups["eraUnitScale"];
  landedBuildUnits: number;
  landedBuildCostAnchor: number;
  capacityUnitPriceAnchor: number;
  /** Legacy revenue base; the fallback nameplate outside priced mixes. */
  newRevenue: number;
  currentTurn: number;
  governorRampTurns: number;
  /** World flip turn (see `MarketContext.worldGovernorAnchorTurn`). */
  worldGovernorAnchorTurn?: number | null;
  /** Proportional governor glide (see `MarketContext.governorGlide`). */
  governorGlide?: GovernorGlide | null;
  embargoLegacyMothball: boolean;
  /**
   * Country recession capacity factor for this turn (countryRecession.ts),
   * applied as extra depreciation so the paid basis falls with it. Absent = 1.
   */
  recessionCapacityFactor?: number;
  /**
   * gameConfig.wholePlantsStage on: depreciation and recession become wear,
   * and the stock stays a whole number of plants (corporations/wholePlants).
   */
  wholePlants?: boolean;
}

export interface PlantsCapacityResult {
  /** D12: a mothballed sector's plants are cold. */
  mothballed: boolean;
  activeFraction: number;
  plantsBaseStock: number;
  plantLedger: ReturnType<typeof seedPlantLedger> | null;
  /** Whole-plant wear after this turn's depreciation. Null with the stage off. */
  plantWearUnits: number | null;
  plantsPrevStock: number;
  plantsOwnedCapacity: number;
  plantsCapacityDepreciationFactor: number;
  priorCapacityBookAnchor: number;
  capacityBookAnchor: number;
  plantsMixPriceYield: number;
  plantsMixPrice: number;
  storedOtherOpexAnchor: number | null;
  healedOpex: RetoolStockBasisHeal | null;
  retoolCapacityRatio: number;
  priorProductionUnitRatio: number;
  plantsCapacity: number;
  plantsNameplateRevenue: number;
  plantsStartTurn: number | undefined | null;
  /**
   * THE plants transition ramp, λ ∈ [0, 1]. 0 on the flip turn, reaching 1
   * over `governorRampTurns`. SINGLE SOURCE OF TRUTH for the plants ramp —
   * every P3a leg that CHANGES a sector's steady-state economics fades in on
   * this, or the flip turn is not a no-op.
   */
  plantsRampLambda: number;
}

function recessionFactorOf(factor: number | undefined): number {
  return typeof factor === "number" && Number.isFinite(factor) && factor > 0 && factor <= 1
    ? factor
    : 1;
}

export function computePlantsCapacity(input: PlantsCapacityInput): PlantsCapacityResult {
  const {
    sector,
    corp,
    activeCapacityPercent,
    plantsEnabled,
    isFlipTurn,
    preFlipNameplateRevenue,
    strategySupply,
    eraUnitScale,
    landedBuildUnits,
    landedBuildCostAnchor,
    capacityUnitPriceAnchor,
    newRevenue,
    currentTurn,
    governorRampTurns,
    worldGovernorAnchorTurn,
    governorGlide,
    embargoLegacyMothball,
  } = input;

  // Heal retooled stock basis: in-flight auto-retools and transitions from
  // capital mode can surface under plants with source-basis stock and no
  // rescale flag, letting the blend ratio manufacture unsupported operating
  // capacity. Stamp the flag and convert the stock on the next sector-turn
  // write while transitionFromStrategyId evidence remains.
  const storedOtherOpexAnchor =
    typeof sector.otherOpexPerUnitAnchor === "number" &&
    Number.isFinite(sector.otherOpexPerUnitAnchor)
      ? sector.otherOpexPerUnitAnchor
      : null;
  const healedOpex = healRetoolStockBasis({
    plantsEnabled: plantsEnabled && !embargoLegacyMothball,
    isAutoRetool: corp.ceoType === "npp" || sector.autoStrategyAdoptedAtTurn != null,
    sectorType: sector.sectorType as CorporationType,
    industryModel: sector.industryModel,
    strategyId: sector.strategyId,
    transitionFromStrategyId: sector.transitionFromStrategyId,
    transitionStartTurn: sector.transitionStartTurn,
    plantsStartTurn: sector.plantsStartTurn,
    retoolRescaleApplied: sector.retoolRescaleApplied,
    capitalStock:
      typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
        ? sector.capitalStock
        : undefined,
    otherOpexPerUnitAnchor: storedOtherOpexAnchor ?? undefined,
  });
  // The capacity the advance starts from is on the destination basis: either
  // it was converted at the retool boundary, or the heal above converted it
  // just now. Running the advance off unconverted stock is what mints the
  // unsupported capacity, so the working stock - not just the stamp - moves.
  const storedCapacity =
    typeof sector.capitalStock === "number" && sector.capitalStock > 0 ? sector.capitalStock : 0;
  const workingCapacity =
    healedOpex?.capitalStock != null ? Math.max(0, healedOpex.capitalStock) : storedCapacity;
  const retoolBasis = {
    sectorType: sector.sectorType,
    industryModel: sector.industryModel,
    mediaDiscriminator: sector.mediaDiscriminator,
    strategyId: sector.strategyId,
    transitionFromStrategyId: sector.transitionFromStrategyId,
    transitionStartTurn: sector.transitionStartTurn,
    retoolRescaleApplied: healedOpex?.retoolRescaleApplied ?? sector.retoolRescaleApplied,
    operatingCapacityTurn: sector.operatingCapacityTurn,
    currentTurn,
  };
  const retoolCapacityRatio = plantsEnabled ? retoolOperatingCapacityRatio(retoolBasis) : 1;
  // Flip seed basis: owned stock converts to destination units at the retool
  // boundary, so the seed arm must be destination-basis too while the blend
  // ratio applies. Seeding from the blended recipe mixes bases in the max():
  // the blended count can exceed the converted count and mint capacity the
  // sector never built (measured ~2% on a manufacturing standard to premium
  // flip, far more on extreme pairs). Off-transition the blended recipe is
  // the destination recipe, so this is a no-op there.
  const flipSeedSupply =
    isFlipTurn && retoolCapacityRatio !== 1 && sector.transitionFromStrategyId
      ? (getStrategyForOperatingModel(
          sector.sectorType,
          sector.strategyId ?? "standard",
          sector.industryModel
        ).supply ?? strategySupply)
      : strategySupply;

  // D12: a mothballed sector's plants are cold — they produce nothing, offer
  // nothing (its persisted `producedUnits` is what the clearing pre-pass reads
  // as its offer under plants, so 0 produced ⇒ 0 offered, automatically), and
  // pay only MOTHBALL_UPKEEP_FRACTION of running maintenance.
  const mothballed = plantsEnabled && sector.mothballed === true;
  const activeFraction = plantsEnabled
    ? activeCapacityFraction({
        mothballed: sector.mothballed,
        activeCapacityPercent: activeCapacityPercent ?? sector.activeCapacityPercent,
      })
    : 1;
  // The capacity the advance starts from, hoisted out of the `advanceCapitalStock`
  // call below so the P5 book basis can be scaled by exactly the same
  // depreciation factor the stock takes. See the long comment inside the call.
  const plantsBaseStock = plantsEnabled
    ? isFlipTurn
      ? Math.max(
          workingCapacity,
          seedCapitalStock(
            preFlipNameplateRevenue,
            flipSeedSupply ?? {},
            COMMODITY_BASE_PRICES,
            eraUnitScale
          )
        )
      : workingCapacity
    : 0;
  const plantsPrevStock = plantsBaseStock + landedBuildUnits;
  const continuousOwnedCapacity = plantsEnabled
    ? advanceCapitalStock({
        // max() is a ONE-TIME migration keyed off the absent ramp anchor.
        // Applying it every turn would re-lift capacity to current revenue implies,
        // reintroducing compounding nameplate and cancelling depreciation.
        //
        // CAPITAL_SEED_HEADROOM on the nameplate arm only: capital seeding gives 1.1x
        // slack, so the same factor here keeps post-flip sectors from starting pinned
        // at 100% utilization. `storedCapacity` is not scaled, since stored capital
        // already carries its own headroom history.
        //
        // Capacity from build orders landing this turn is added before the advance so
        // the plant produces its landing turn.
        prevStock: plantsPrevStock,
        currentGrowthRate: 0,
      }) * recessionFactorOf(input.recessionCapacityFactor)
    : 0;
  // Whole plants: the continuous decay above is wear, not lost stock. A plant
  // comes off when the wear reaches one plant; the last plant never wears out.
  const wholePlantChange =
    plantsEnabled && input.wholePlants
      ? applyPlantChange(
          {
            capitalStock: plantsPrevStock,
            plantUnitRemainder: sector.plantUnitRemainder,
            plantWearUnits: sector.plantWearUnits,
          },
          plantSizeForSector(sector),
          { lossUnits: Math.max(0, plantsPrevStock - continuousOwnedCapacity) }
        )
      : null;
  const plantsOwnedCapacity = wholePlantChange
    ? wholePlantChange.capitalStock
    : continuousOwnedCapacity;
  const plantLedger = wholePlantChange
    ? {
        plantCount: wholePlantChange.plantCount,
        plantUnitRemainder: wholePlantChange.plantUnitRemainder,
      }
    : plantsEnabled
      ? seedPlantLedger(sector, plantsOwnedCapacity)
      : null;
  // ─── P5: the PAID BASIS of that capacity ──────────────────────────────────
  //
  //   book_next = (book_prev + cash of the orders that just landed) × (the same
  //               depreciation factor the stock just took)
  //
  // Scaling by the stock's own factor keeps the PER-UNIT basis flat under
  // depreciation: a plant half worn out books at half what was paid for it,
  // never at half the LIST price.
  //
  // Seed for a sector with no recorded basis is the list value of its starting
  // stock. Pre-plants capacity was bought at exactly `capacityPricePerUnit`,
  // so the stamp is a no-op for valuation on the turn it happens.
  //
  // Free capacity (R&D breakthrough, world grant, autoSectorSeed multiplier)
  // adds units without adding cash, so it DILUTES the per-unit basis. That is
  // deliberate: free capacity has no paid basis and must not be exitable for
  // cash it never cost. Whole plants: basis falls by the share of plants that
  // came off, so credit converted into a plant (free) dilutes rather than
  // inflates it.
  const plantsCapacityDepreciationFactor = wholePlantChange
    ? wholePlantChange.bookRetention
    : plantsPrevStock > 0
      ? plantsOwnedCapacity / plantsPrevStock
      : 1;
  const priorCapacityBookAnchor =
    typeof sector.capacityBookAnchor === "number" &&
    Number.isFinite(sector.capacityBookAnchor) &&
    sector.capacityBookAnchor >= 0
      ? sector.capacityBookAnchor
      : plantsBaseStock * capacityUnitPriceAnchor;
  const capacityBookAnchor = plantsEnabled
    ? Math.max(
        0,
        (priorCapacityBookAnchor + landedBuildCostAnchor) * plantsCapacityDepreciationFactor
      )
    : 0;
  // Price per output unit of the sector's mix — the inverse of the Σ rate/base
  // term impliedOutputUnits applies, so `units × mixPrice` recovers the revenue
  // those units imply. 0 only for a sector whose output mix genuinely prices to
  // nothing (no output commodity with a positive rate AND a positive base).
  //
  // Derived from unit yield, not `revenue / nameplateUnits`: that ratio is the
  // same number whenever revenue > 0, but 0/0 at a founding sector (capitalStock
  // 0 plus a starter build) is an absorbing zero. Yield is scale-free, so it
  // matches the positive-revenue case and keeps working at revenue 0.
  const plantsMixPriceYield = plantsEnabled
    ? unitYieldForSupply(strategySupply ?? {}, eraUnitScale)
    : 0;
  const plantsMixPrice = plantsMixPriceYield > 0 ? 1 / plantsMixPriceYield : 0;
  const plantsCapacity = plantsOwnedCapacity * retoolCapacityRatio;
  const priorProductionUnitRatio = plantsEnabled ? retoolMeasurementRatio(retoolBasis) : 1;
  // Nameplate plants writes back to `sector.revenue`: owned capacity at mix
  // prices. It must NOT be the realized figure. `sector.revenue` is re-read as
  // next turn's anchor AND the commodity supply base, so persisting realized
  // revenue compounds each realization once per turn (−7%/turn at 0.93
  // realization). Capacity-implied revenue is invariant thanks to plantsMixPrice.
  // Sectors with no priced mix (nameplateUnits 0) hold the un-compounded anchor.
  const plantsNameplateRevenue =
    plantsEnabled && plantsMixPrice > 0 ? plantsCapacity * plantsMixPrice : newRevenue;
  // Governor ramp anchor: stamped on the sector's FIRST plants turn and never
  // moved, mirroring clearingStartTurn.
  const plantsStartTurn = plantsEnabled
    ? (sector.plantsStartTurn ?? currentTurn)
    : sector.plantsStartTurn;
  // The stamp above is persisted as-is (it also marks the flip turn); the ramp
  // itself runs from the earlier of it and the world's flip, so a sector born
  // after the flip joins the world's ramp instead of restarting it.
  const rampAnchorTurn = governorAnchorTurn(
    plantsStartTurn,
    worldGovernorAnchorTurn,
    governorGlide
  );
  const plantsRampLambda =
    !plantsEnabled || rampAnchorTurn == null || governorRampTurns <= 0
      ? 1
      : Math.max(0, Math.min(1, (currentTurn - rampAnchorTurn) / governorRampTurns));
  return {
    mothballed,
    activeFraction,
    plantsBaseStock,
    plantLedger,
    plantWearUnits: wholePlantChange ? wholePlantChange.plantWearUnits : null,
    plantsPrevStock,
    plantsOwnedCapacity,
    plantsCapacityDepreciationFactor,
    priorCapacityBookAnchor,
    capacityBookAnchor,
    plantsMixPriceYield,
    plantsMixPrice,
    storedOtherOpexAnchor,
    healedOpex,
    retoolCapacityRatio,
    priorProductionUnitRatio,
    plantsCapacity,
    plantsNameplateRevenue,
    plantsStartTurn,
    plantsRampLambda,
  };
}
