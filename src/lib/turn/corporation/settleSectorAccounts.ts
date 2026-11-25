import type { CorporateSector } from "@/lib/db/types";

import type { CommodityType } from "@/lib/constants/commodities";

import {
  commodityMixWeights,
  mixWeightFor as mixWeightFrom,
} from "@/lib/market/rules/commodityMixWeights";

import { TURNS_PER_DAY } from "@/lib/constants/corporations";
import { writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";

import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { fundedSizeCostPp } from "@/lib/corporations/rules/fundedSizeCost";

import { sectorVintageYear } from "@/lib/energyTransition/policies";

import { blendVintageYear } from "@/lib/energyTransition/rules";

import { STRATEGY_TRANSITION_TURNS } from "@/lib/constants/sectorStrategies";
import type { SectorUpdateOp } from "@/lib/turn/corporation/types";

import { decomposePhysicalCosts } from "@/lib/turn/corporation/sectorTurn/sectorCosts";

import {
  sectorOutputUnmetShare,
  shortageBuildSpeedupOps,
} from "@/lib/turn/corporation/sectorTurn/shortageBuildSpeedup";

import { advanceSectorInventory } from "@/lib/corporations/sectorInventory";
import type { SectorTurnResult } from "@/lib/turn/corporation/sectorTurnTypes";
import {
  legacyRevenueShadowTelemetry,
  marketTelemetry,
} from "@/lib/turn/corporation/sectorTelemetry";

import { plantThroughputMultiplier } from "@/lib/corporations/rules/plantThroughput";

import {
  inputBasketCostIndex,
  recordCostPlusBasis,
  supportsCostPlusPricing,
} from "@/lib/market/costPlusPricing/rules";
import { buildManufacturedSectorOutput } from "@/lib/products/rules/manufacturingRules";
import { getManufacturingProductKind } from "@/lib/products/manufacturingCatalog";
import { isLegalManufacturingProductForPlant } from "@/lib/products/rules/manufacturingEligibility";

import type { ProcessSectorStageContext } from "@/lib/turn/corporation/sectorTurn";

export function settleSectorAccounts(context: ProcessSectorStageContext): SectorTurnResult {
  // ─── P3.5: physical cost decomposition (plants only) ──────────────────────
  // Pure computation in `sectorTurn/sectorCosts.ts`; names are unchanged.
  const physicalCostInput = {
    groupAllocations: context.market.groupSupplyInputsBySector?.get(context.sectorId),
    plantsEnabled: context.plantsEnabled,
    internalSupplyDiscountCost: context.market.internalSupplyDiscountCostBySectorId?.get(
      context.sectorId
    ),
    explicitPlantCostsEnabled: context.explicitPlantCostsEnabled,
    embargoLegacyMothball: context.embargoLegacyMothball,
    profitMargin: context.sector.profitMargin,
    totalMarginMod: context.totalMarginMod,
    commodityMod: context.commodityMod,
    surplusMod: context.surplusMod,
    disasterMarginMod: context.disasterMarginMod,
    nationalizedMarginPenalty: context.nationalizedMarginPenalty,
    hourlyRevenue: context.hourlyRevenue,
    maintenance: context.maintenance,
    sectorLaborCost: context.sectorLaborCost,
    plantsUpkeepCost: context.plantsUpkeepCost,
    regulatoryBurden: context.regulatoryBurden,
    hourlyGrowthCost: context.hourlyGrowthCost,
    plantsNameplateRevenue: context.plantsNameplateRevenue,
    effectiveDemand: context.effectiveDemand,
    sectorCountryId: context.sectorCountryId,
    priceRatioByCommodity: context.lookups.priceRatioByCommodity,
    reachableInputPriceRatiosByCountry: context.lookups.reachableInputPriceRatiosByCountry,
    plantsCapacity: context.plantsCapacity,
    activeFraction: context.activeFraction,
    producedUnits: context.producedUnits,
    retoolCapacityRatio: context.retoolCapacityRatio,
    newPolicyLevel: context.newPolicyLevel,
    policyHeadroomFactor: context.policyHeadroomFactor,
    mothballed: context.mothballed,
    stateId: context.sector.stateId,
    inputProductivityMultiplier: plantThroughputMultiplier(
      context.sector,
      context.currentTurn,
      context.lookups.preset
    ),
    landedPremiumByState: context.lookups.landedPremiumByState,
    shippingCostMultiplier: context.shippingCostMultiplier,
    storedOtherOpexAnchor: context.storedOtherOpexAnchor,
    healedOtherOpexPerUnitAnchor: context.healedOpex?.otherOpexPerUnitAnchor,
    otherOpexAnchorMarginBasis: context.sector.otherOpexAnchorMarginBasis,
    capitalEnabled: context.market.capitalEnabled,
    prevCapitalBookAnchor: context.sector.capitalBookAnchor,
    freightNetHourly: context.freightBilling.credit - context.freightBilling.charge,
  };
  const {
    plantsPhysicalEnabled,
    plantsPolicyPp,
    plantsPolicyNeutralBasis,
    solvedOtherOpexPerUnit,
    physicalPnl,
    sectorNPV,
    capitalBookAnchor,
    inputUnitsByCommodity,
  } = decomposePhysicalCosts(physicalCostInput);

  const productProject = context.lookups.productLinesV2Enabled
    ? context.lookups.manufacturingProductByCorpId?.get(context.corpId)
    : undefined;
  const productAllocation = productProject?.allocations.find(
    (allocation) => allocation.sectorId === context.sectorId
  );
  const productKind = productProject
    ? getManufacturingProductKind(productProject.kindId)
    : undefined;
  const productOutput =
    context.plantsEnabled &&
    productProject &&
    productKind &&
    productAllocation &&
    isLegalManufacturingProductForPlant(productProject.kindId, {
      sectorId: context.sectorId,
      corporationId: context.corpId,
      sectorType: context.sector.sectorType,
      strategyId: context.sector.strategyId,
      capitalStock: context.sector.capitalStock ?? 0,
      plantCount: context.sector.plantCount ?? 0,
      mothballed: context.sector.mothballed,
    })
      ? buildManufacturedSectorOutput({
          outputAnchor: context.producedUnits * context.plantsMixPrice,
          supplyRates: (context.strategyRates.supply ?? {}) as Partial<
            Record<CommodityType, number>
          >,
          allocationShare: productAllocation.share,
          stage: productProject.stage,
          outputCommodity: productKind.outputCommodity,
          basePrices: context.basePrices,
          currentSectorQualityByCommodity: Object.fromEntries(
            [
              ...new Set([
                ...Object.keys(context.strategyRates.supply ?? {}),
                productKind.outputCommodity,
              ]),
            ].map((commodity) => [
              commodity,
              context.lookups.productSectorQualityById?.get(context.sectorId),
            ])
          ) as Partial<Record<CommodityType, number>>,
          paidDevelopmentAnchor: productProject.developmentPaidAnchor,
          paidThresholdAnchor: productProject.paidThresholdAnchor,
          productBrand: productProject.productBrand,
          elapsedThresholdTurns: productProject.elapsedThresholdTurns,
        })
      : null;
  // (moved to decomposePhysicalCosts: inputs bill + financial legs)
  // (moved to decomposePhysicalCosts: calibration solve + residual)
  // (moved to decomposePhysicalCosts: P&L assembly, profit, NPV, book anchor)

  // Build sector update — include transition advancement if applicable.
  // ── Inventory of unsold storable output (design-realization-legs §6 v1) ────
  // Plants + clearing only: soldFraction is the accrual signal and mixPrice the
  // valuation basis, neither exists below those tiers. The drained revenue and
  // carrying cost ride the sector's normal rails below: revenue into
  // `realizedRevenue` and the result's `hourlyRevenue` (taxed and aggregated
  // like operating income), carry into the result's `costs`.
  const inventoryTurn =
    context.plantsEnabled &&
    context.market.clearingEnabled &&
    context.clearing &&
    context.plantsMixPrice > 0
      ? advanceSectorInventory({
          inventory: (context.sector.inventoryUnits ?? {}) as Partial<
            Record<CommodityType, number>
          >,
          stockpileEnabled: context.sector.stockpileUnsold === true,
          producedUnits: context.producedUnits,
          soldUnits: context.soldUnits,
          soldFraction: context.clearing.soldFraction,
          soldByCommodity: context.clearing.soldByCommodity ?? {},
          supplyRates: (context.strategyRates.supply ?? {}) as Partial<
            Record<CommodityType, number>
          >,
          mixPriceAnchor: context.plantsMixPrice,
          outputUnitsByCommodity: productOutput?.outputUnitsByCommodity,
          outputAnchorByCommodity: productOutput?.outputAnchorByCommodity,
        })
      : null;
  const hourlyInventoryRevenue = inventoryTurn
    ? inventoryTurn.drainedRevenueAnchor / TURNS_PER_DAY
    : 0;
  const hourlyInventoryCarry = inventoryTurn ? inventoryTurn.carryCostAnchor / TURNS_PER_DAY : 0;

  // Persist countryId so API endpoints don't need to re-derive it from the state.
  // newRevenue / newGrowthCost are ₳ (computed from anchor inputs); convert
  // back to the sector's HOST-state functional currency for storage (the market
  // it operates in, not the parent corp's home currency). Sectors with no
  // resolvable host currency passthrough in the helper, preserving ₳-on-disk.
  const sectorUpdate: Record<string, unknown> &
    Pick<Partial<CorporateSector>, "plantsPnl" | "internalSupplyReceipt"> = {
    // Under plants the nameplate stops compounding and is restated from owned
    // capacity instead (see `plantsNameplateRevenue`); `newRevenue` outside it.
    // Realized earnings live in `realizedRevenue` below, in both modes.
    revenue: writeCorpEconomicLocal(
      context.plantsNameplateRevenue,
      context.sectorCurrencyCode,
      context.sectorFxRate
    ),
    // Realized (post-realization-leg) revenue on the same DAILY basis + home
    // currency as `revenue` (#3001/#3002). `hourlyRevenue` is nameplate × every
    // realization leg (production policy, capacity haircut, clearing/soldFraction,
    // throughput, capital, strike, total-embargo); scale it back to daily to
    // match `revenue`. Persisting it exactly, per-sector, every turn lets the
    // corp Financials query drop the blended-ratio approximation that smeared one
    // corp-wide ratio across heterogeneous sectors (a $0 embargoed sector now
    // reads $0, not corp-average). Never read back into the economy.
    realizedRevenue: writeCorpEconomicLocal(
      (context.hourlyRevenue + hourlyInventoryRevenue) * TURNS_PER_DAY,
      context.sectorCurrencyCode,
      context.sectorFxRate
    ),
    // P1 units telemetry (buildable sectors): the units-denominated twin of
    // `realizedRevenue`, on the same DAILY basis but currency-free. Produced =
    // nameplate output units × the production-side legs; sold = produced ×
    // soldFraction when the clearing pre-pass ran. See computeSectorOutputUnits
    // for the exact identity. Display/analytics only — never read back into the
    // economy.
    producedUnits: Math.round(context.producedUnits * 100) / 100,
    soldUnits: Math.round(context.soldUnits * 100) / 100,
    ...(productOutput
      ? {
          outputUnitsByCommodity: productOutput.outputUnitsByCommodity,
          outputAnchorByCommodity: productOutput.outputAnchorByCommodity,
          productQualityByCommodity: productOutput.productQualityByCommodity,
          productOutputCapacityUnits: context.plantsCapacity,
        }
      : {}),
    ...(context.market.plantsEnabled &&
    context.clearing?.productProjectId &&
    context.clearing.productOutputTurn === context.turn
      ? {
          productLineProjectId: context.clearing.productProjectId,
          productLineOutputTurn: context.clearing.productOutputTurn,
          productLineOutputUnitsByCommodity: context.clearing.projectOutputUnitsByCommodity ?? {},
          productLineSoldUnitsByCommodity: context.clearing.projectSoldUnitsByCommodity ?? {},
          productLineQualityByCommodity: context.clearing.projectQualityByCommodity ?? {},
        }
      : {}),
    // Ceiling the supply-agreement damages leg clamps a contracted volume to,
    // so a supplier is never billed for output it could not physically have
    // made. See the derivation beside `contractAchievableUnits` above.
    contractAchievableUnits: Math.round(context.contractAchievableUnits * 100) / 100,
    // Demand-aware production telemetry. This is display-only: it records the
    // deliberate run-rate cap so the sector page can distinguish market demand
    // from physical input shortages and the residual "other" bucket.
    demandThrottleFactor: context.plantsEnabled
      ? Math.round(context.demandThrottleFactor * 1000) / 1000
      : null,
    currentGrowthRate: context.newCurrentGrowthRate,
    // Persisted so the brake is durable: without this the next turn's trend
    // simply pulls the rate straight back toward the old, unaffordable target.
    targetGrowthRate: context.brakedTargetRate,
    currentGrowthCost: writeCorpEconomicLocal(
      context.newGrowthCost,
      context.sectorCurrencyCode,
      context.sectorFxRate
    ),
    workers: context.computedWorkers,
    workersDesired: context.desiredWorkers,
    labourStaffingFactor: context.staffingFactor,
    productionPolicyLevel: context.newPolicyLevel,
    negativeProductionSustainedTurns: context.newNegativeProductionTurns,
    // Sprawl margin (pp) the turn applied, for the sector page (SOEs pay on the state's holdings).
    sprawlMarginPp: Math.round(context.sprawlMod * 100) / 100,
    // Dominance margin penalty (pp) the turn actually applied, for the sector page.
    dominanceMarginPenaltyPp: Math.round(context.dominanceMarginPenalty * 100) / 100,
    countryId: context.sectorCountryId,
    // Surfaced to the corporation UI/API so a $0 sector reads as "suspended
    // by embargo" rather than looking like a bug.
    embargoSuspended: context.embargoSuppressed,
    // Under the trade-exposure model, the export-exposed revenue share the
    // embargo stripped this turn (0 under legacy mothball / when unembargoed).
    // Lets the UI show "trade-restricted — N% of output was exported".
    embargoExportExposure: context.embargoTradeExposureActive ? context.embargoExportExposure : 0,
    updatedAt: context.now,
  };
  // Persist extraction capacity utilization + binding resource for display and
  // for next turn's ramp anchor / notification edge detection. Only written for
  // extraction sectors.
  if (context.sector.sectorType === "extraction") {
    sectorUpdate.capacityUtilization = Math.round(context.capacityUtil.utilization * 1000) / 1000;
    sectorUpdate.capacityBindingResource = context.capacityUtil.bindingResource ?? null;
    sectorUpdate.capacityHaircutStartTurn = context.capacityHaircutStartTurn ?? null;
  }
  // Price-realization telemetry: persisted for sector-detail display only,
  // never read back into the economy. Only written when the mode is on.
  if (context.market.realizationEnabled && !context.market.clearingEnabled) {
    // Under clearing the realization term lives inside clearingFactor —
    // writing both would double-report the price leg.
    sectorUpdate.priceRealization = Math.round(context.priceRealization * 1000) / 1000;
  }
  // Capital state + telemetry: stock persists (it IS the state), the
  // gating factor is display-only.
  if (context.market.capitalEnabled) {
    // Under plants, `capitalStock` holds the authoritative plant capacity and
    // `capitalUtilization` reports how hard those plants ran (produced ÷
    // capacity, i.e. the production legs) rather than a capacity haircut.
    // Plants capacity is persisted RAW — it is authoritative state, and rounding
    // it breaks the invertibility of the retool unit conversion. Capital mode's
    // derived stock keeps its 2dp rounding exactly as before.
    sectorUpdate.capitalStock = context.plantsEnabled
      ? context.persistedOwnedCapacity
      : Math.round(context.newCapitalStock * 100) / 100;
    sectorUpdate.capitalUtilization =
      Math.round(
        (context.plantsEnabled
          ? context.plantsCapacity > 0
            ? context.producedUnits / context.plantsCapacity
            : 0
          : context.capitalFactor) * 1000
      ) / 1000;
    sectorUpdate.capitalBookAnchor = Math.round(capitalBookAnchor);
    // P5 paid basis. Plants only: below plants there is no build path, so there
    // is no discount wedge between what capacity costs and what it books at,
    // and stamping the field would only give the exit paths a number to drift
    // from. Written RAW for the same reason `capitalStock` is — the two are a
    // ratio (per-unit basis) that has to survive round-tripping.
    if (context.plantsEnabled) {
      sectorUpdate.operatingCapacityUnits = context.plantsCapacity;
      sectorUpdate.operatingCapacityTurn = context.currentTurn;
      sectorUpdate.capacityBookAnchor = context.persistedCapacityBookAnchor;
      sectorUpdate.plantCount = context.persistedPlantLedger?.plantCount ?? 0;
      sectorUpdate.plantUnitRemainder = context.persistedPlantLedger?.plantUnitRemainder ?? 0;
      if (context.idleWholePlants)
        sectorUpdate.plantWearUnits = context.idleWholePlants.plantWearUnits;
    }
  }
  // Plants ramp anchor (stamped once, on the flip turn).
  if (context.plantsEnabled) {
    sectorUpdate.plantsStartTurn = context.plantsStartTurn ?? null;
    sectorUpdate.demandIdleTurns = context.idleRetirement.streak;
    sectorUpdate.lossRunShare = context.lossRun.share;
    sectorUpdate.lossRunStreak = context.lossRun.streak;
    sectorUpdate.plantCrewShare = context.plantCrew;
    sectorUpdate.idleCapacityRetiredUnits = context.idleCapacityRetiredUnits;
    // Stamp the idle-upkeep margin basis ONCE, from the live margin, and then
    // hold it — the anti-spiral half of the upkeep fix above. Written on the
    // first plants turn the sector runs, so the value stamped IS the value the
    // old `(1 − margin_now)` expression would have used that turn: the stamping
    // turn is unchanged, and only later turns stop tracking a falling margin.
    if (context.plantsUpkeepMarginBasisAnchor == null) {
      sectorUpdate.plantsUpkeepMarginBasisAnchor = context.plantsUpkeepMarginBasisLive;
    }
    // P3a/C4: the queue is updated by a `$pull` below. CIP is derived by this
    // turn from the post-delivery queue.
    // Keep an independent capital-mode counterfactual so a plants rollback
    // restores the old compounding series instead of a plants-derived value.
    Object.assign(
      sectorUpdate,
      legacyRevenueShadowTelemetry({
        sector: context.sector,
        isFlipTurn: context.isFlipTurn,
        preFlipNameplateRevenue: context.preFlipNameplateRevenue,
        brakedTargetRate: context.brakedTargetRate,
        newCurrentGrowthRate: context.newCurrentGrowthRate,
        embargoLegacyMothball: context.embargoLegacyMothball,
        sectorCurrencyCode: context.sectorCurrencyCode,
        sectorFxRate: context.sectorFxRate,
      })
    );
    // Legacy growth fields are vestigial under plants: capacity is the only
    // thing that moves output, and the flip credit above compensates any
    // in-flight paid ramp. Zeroing the target lets `currentGrowthRate` trend to
    // 0 over the following turns (no cliff — this turn's growth cost is still
    // charged in full, so the flip turn itself is unchanged).
    // The policy computation above is NOT dead, only its revenue leg: the
    // trended rate still bills the decaying `hourlyGrowthCost` through the
    // physical PnL, seeds next turn's trend, and seeds `legacyRevenueShadow`
    // on the flip turn. Do not "clean up" the compute-then-zero into a skip
    // without rehoming all three.
    sectorUpdate.targetGrowthRate = 0;
    sectorUpdate.currentGrowthCost = 0;
    // NOT written back: `mothballed` is derived here purely from the stored
    // field, so echoing it is a no-op that can only do harm — the turn
    // processor's snapshot is taken at turn start, so a player who mothballs
    // while the turn is running would have the toggle silently reverted. The
    // flag is owned by the build command alone.
  }
  Object.assign(
    sectorUpdate,
    marketTelemetry({
      clearingEnabled: context.market.clearingEnabled,
      clearing: context.clearing,
      clearingFactor: context.clearingFactor,
      currentTurn: context.currentTurn,
      clearingStartTurn: context.clearingStartTurn,
      mothballed: context.mothballed,
      sector: context.sector,
      inventoryTurn: inventoryTurn ?? undefined,
    })
  );
  // Throughput telemetry + ramp anchor (display + next turn's fade-in).
  if (context.market.throughputEnabled) {
    sectorUpdate.throughputFactor = Math.round(context.throughputFactor * 1000) / 1000;
    sectorUpdate.throughputBindingInput = context.throughputRaw.bindingInput ?? null;
    sectorUpdate.throughputStartTurn = context.throughputStartTurn ?? null;
  }
  // Freight seam telemetry (t225): the share of output that was wanted and
  // still could not be delivered, sat next to `soldFraction` above, which
  // measures the opposite thing. A glut is NOT in this number: it is attributed
  // in the sourcing pass against residual unmet demand, because the sector
  // surface reads it as "buyers still wanted it" and tells the player to fix
  // freight rather than cut output.
  // Only settlement worlds populate the map, so a world with settlement off
  // writes nothing new, except to clear a value it wrote while settlement was
  // on, which would otherwise sit stale on the sector forever.
  const deliveryLimited = context.market.deliveryLimitedBySectorId?.get(context.sectorId);
  if (deliveryLimited != null || typeof context.sector.deliveryLimitedFraction === "number") {
    sectorUpdate.deliveryLimitedFraction = Math.round((deliveryLimited ?? 0) * 1000) / 1000;
    sectorUpdate.deliveryLimitedFreightClass =
      deliveryLimited != null && deliveryLimited > 0
        ? (context.market.deliveryLimitedClassBySectorId?.get(context.sectorId) ?? null)
        : null;
  }
  // Canonical freight billing: persist both legs as named daily lines (or
  // clear stale ones); see `resolveSectorFreightBillingLegs`.
  Object.assign(sectorUpdate, context.freightBilling.sectorUpdate);
  // Labour telemetry: persist the per-turn labor cost on a daily basis (like
  // `revenue`), in the sector's host-state currency. Display/analytics only;
  // never read back into the economy. Only written when the labour system is on.
  if (context.labour.wagesEnabled || context.explicitPlantCostsEnabled) {
    // Per-turn labor cost (daily basis, host currency) — display/analytics
    // only, never read back into the economy.
    sectorUpdate.laborCost = writeCorpEconomicLocal(
      context.sectorLaborCost * TURNS_PER_DAY,
      context.sectorCurrencyCode,
      context.sectorFxRate
    );
  }
  // Persist the physical P&L the turn actually booked (ticket 1122). Display
  // and decision telemetry, on the same daily basis and in the same currency as
  // `revenue` / `laborCost`. NPP behavior reads it on the following turn, but
  // it never feeds physical settlement back into itself.
  //
  // Read surfaces used to rebuild these numbers by inverting
  // `effectiveProfitMargin`, which is this P&L's OUTPUT and is capped at 100.
  // At the cap the inversion recovers a zero operating cost from a genuinely
  // NEGATIVE one and reports profit == revenue, and it drops upkeep and
  // compliance in every case because they sit outside the margin's scope.
  // Writing the lines is the only way a reader can have the real ones.
  if (physicalPnl) {
    const daily = (anchorPerTurn: number) =>
      writeCorpEconomicLocal(
        anchorPerTurn * TURNS_PER_DAY,
        context.sectorCurrencyCode,
        context.sectorFxRate
      );
    sectorUpdate.plantsPnl = {
      ...(context.explicitPlantCostsEnabled
        ? { costModel: "explicit" as const, plantOverhead: daily(physicalPnl.otherOpex) }
        : {}),
      // Inventory sell-down earns beside operating revenue and its carry lands
      // in costs (see the `costs` leg of this function's return), so both are
      // in the revenue and profit reported here. That makes `revenue` equal
      // `realizedRevenue` exactly and `profit` the figure the corp booked.
      revenue: daily(context.hourlyRevenue + hourlyInventoryRevenue),
      inventoryRevenue: daily(hourlyInventoryRevenue),
      inventoryCarry: daily(hourlyInventoryCarry),
      inputs: daily(physicalPnl.inputsCost),
      labour: daily(physicalPnl.laborCost),
      upkeep: daily(physicalPnl.upkeep),
      compliance: daily(physicalPnl.complianceCost),
      otherOpex: daily(physicalPnl.otherOpex),
      otherOpexCreditCapped: physicalPnl.otherOpexCreditCapped,
      otherOpexUncapped: daily(physicalPnl.otherOpexUncapped),
      financialLegs: daily(physicalPnl.financialLegs),
      internalSupplyDiscountCost: daily(
        context.market.internalSupplyDiscountCostBySectorId?.get(context.sectorId) ?? 0
      ),
      policyCredit: daily(physicalPnl.policyCredit),
      policyPp: Math.round(plantsPolicyPp * 100) / 100,
      operatingCost: daily(physicalPnl.operatingCost),
      totalCost: daily(physicalPnl.totalCost + hourlyInventoryCarry),
      profit: daily(physicalPnl.profit + hourlyInventoryRevenue - hourlyInventoryCarry),
      turn: context.currentTurn,
    };
  }
  // Persist effective margin for display and NPP profitability decisions.
  // Below plants it is the modifier stack; under plants it is derived from the
  // physical P&L. Public-enterprise remittance recomputes its own value.
  // A sector with NO revenue this turn (mothballed, fully embargoed) has no
  // ratio to derive from — profit ÷ 0 is not "0% margin", it is undefined. Such
  // a sector keeps reporting the modifier stack, which is what its margin WOULD
  // be if it ran, and is what the P3a mothball-upkeep pricing already reads.
  const marginIsRealized = Boolean(physicalPnl) && context.hourlyRevenue > 0;
  const reportedEffectiveMargin = marginIsRealized
    ? (physicalPnl as NonNullable<typeof physicalPnl>).derivedMarginPct
    : context.effectiveMargin;
  sectorUpdate.effectiveMarginModelled = !marginIsRealized;
  if (context.market.plantsEnabled)
    sectorUpdate.internalSupplyReceipt = {
      ...(context.market.internalSupplyReceiptsBySectorId?.get(context.sectorId) ?? {
        turn: context.currentTurn,
        received: {},
        reserved: {},
      }),
      discountCostAnchor:
        (context.market.internalSupplyDiscountCostBySectorId?.get(context.sectorId) ?? 0) *
        TURNS_PER_DAY,
    };
  sectorUpdate.effectiveProfitMargin = Math.round(reportedEffectiveMargin * 100) / 100;
  // P3.5: stamp the solved calibration residual and the margin basis it was
  // solved at. Written once, on the sector's first producing physical-P&L turn,
  // and never rewritten — the anchor is the thing that is HELD while the
  // physical lines move. (Era-indexing it is a later wave; the field is the
  // hook.)
  if (solvedOtherOpexPerUnit != null) {
    sectorUpdate.otherOpexPerUnitAnchor = solvedOtherOpexPerUnit;
    sectorUpdate.otherOpexAnchorMarginBasis = plantsPolicyNeutralBasis;
  } else if (
    !context.explicitPlantCostsEnabled &&
    context.healedOpex?.otherOpexPerUnitAnchor != null
  ) {
    // Persist the rebasing this turn's P&L already used. Skip when this is
    // also the first calibration (branch above): that sector had no leftover
    // residual to rebase.
    sectorUpdate.otherOpexPerUnitAnchor = context.healedOpex.otherOpexPerUnitAnchor;
  }
  if (
    context.explicitPlantCostsEnabled &&
    physicalPnl &&
    supportsCostPlusPricing(context.sector.sectorType)
  ) {
    const basis = recordCostPlusBasis({
      inputsCost: physicalPnl.inputsCost,
      // Every operating line the P&L bills, so zero markup breaks even on a
      // full fill. Disaster legs and a net policy penalty are charged per
      // revenue; leaving them out quoted a 5% markup that netted a loss. The
      // internal supply discount rides `financialLegs` but settles between
      // sibling sectors, so it stays out of the quote.
      fixedCost:
        physicalPnl.laborCost +
        physicalPnl.otherOpex +
        physicalPnl.upkeep +
        physicalPnl.complianceCost +
        physicalPnl.financialLegs -
        (context.market.internalSupplyDiscountCostBySectorId?.get(context.sectorId) ?? 0) +
        Math.max(0, -physicalPnl.policyCredit),
      nominalProducedRevenue:
        context.plantsCapacity > 0
          ? ((context.plantsNameplateRevenue / TURNS_PER_DAY) * context.producedUnits) /
            context.plantsCapacity
          : 0,
      // Bounds the fixed-cost spread at the demand throttle's 10% floor, so a
      // throttled plant cannot raise its quote into a spiral (#4352).
      nominalFullRunRevenue: context.plantsNameplateRevenue / TURNS_PER_DAY,
      inputCostIndex: inputBasketCostIndex(
        context.effectiveDemand ?? {},
        context.lookups.reachableInputPriceRatiosByCountry?.get(context.sectorCountryId) ??
          context.lookups.priceRatioByCommodity
      ),
      turn: context.currentTurn,
    });
    if (basis) sectorUpdate.costPlusCostBasis = basis;
  }
  if (!context.explicitPlantCostsEnabled && context.healedOpex) {
    sectorUpdate.retoolRescaleApplied = true;
  }

  // v3 Phase 5: persist the trended unionization level. Only written when
  // unions are enabled, so it's inert (and absent → 0 fallback elsewhere) otherwise.
  if (context.newUnionization !== undefined) {
    sectorUpdate.unionization = context.newUnionization;
  }
  // Per-worker daily pay: union dues and services are priced as a share of it,
  // and nothing wrote it before, so every union's average annual wage was 0
  // (dues ceiling 0, no dues approval penalty, free services). Written whenever
  // the wage leg ran and the sector has a headcount.
  if (context.wagePerWorker !== undefined) {
    sectorUpdate.wagePerWorker = context.wagePerWorker;
  }
  // v3 Phase 6: persist the worker-expectation trend + strike state. Only
  // written when the strike computation actually ran above (requires both
  // wagesEnabled and unionsEnabled - see the labour output factor near
  // hourlyRevenue for why unionsEnabled alone does not imply that).
  // Explicit `null` clears strikeStartedAtTurn/strikeCooldownUntilTurn on
  // resolution — matches the transitionFromStrategyId = null precedent
  // below (Mongo $set with a literal null sets BSON null, not unset).
  if (context.newWorkerExpectationIndex !== undefined) {
    sectorUpdate.workerExpectationIndex = context.newWorkerExpectationIndex;
    sectorUpdate.strikeStartedAtTurn = context.newStrikeStartedAtTurn ?? null;
    sectorUpdate.strikeCooldownUntilTurn = context.newStrikeCooldownUntilTurn ?? null;
  }
  // Advance strategy transition: if transition complete, finalize it
  // Clear both transition fields AND the cooldown timer.
  // Also clear isReversing if a reversal just finished.
  if (
    context.sector.transitionFromStrategyId &&
    context.sector.transitionStartTurn != null &&
    context.turn != null
  ) {
    const elapsed = context.turn - context.sector.transitionStartTurn;
    if (elapsed >= STRATEGY_TRANSITION_TURNS) {
      sectorUpdate.transitionFromStrategyId = null;
      sectorUpdate.transitionStartTurn = null;
      sectorUpdate.transitionCooldownUntilTurn = null;
      if (context.sector.isReversing) {
        sectorUpdate.isReversing = false;
      }
    }
  }

  // C4: CIP is written absolutely from the queue result each turn, repairing
  // stale and negative stored values without a sequence of rounded increments.
  const sectorUpdateDoc: SectorUpdateOp["updateOne"]["update"] = { $set: sectorUpdate };
  if (context.plantsEnabled) {
    // A smooth order releases CIP every turn it delivers, not only on the turn
    // it fully lands. The `$pull` still only fires when an order actually came due.
    if (context.landedOrderCount > 0) {
      sectorUpdateDoc.$pull = { buildQueue: { onlineTurn: { $lte: context.currentTurn } } };
    }
    sectorUpdateDoc.$set = {
      ...sectorUpdateDoc.$set,
      constructionInProgressAnchor: Math.max(0, Math.round(context.constructionInProgressAnchor)),
      // Deliveries above cover every turn up to this one; record that in the
      // same update so a replay or a later catch-up starts here.
      buildDeliverySettledTurn: context.currentTurn,
    };
    // Energy transition worlds: new capacity pulls the fleet's build year
    // toward this year, so building or replacing plants resets their ageing.
    const priorVintage =
      context.lookups.energyTransition &&
      context.currentYear != null &&
      context.landedBuildUnits > 0
        ? sectorVintageYear(
            context.sector,
            context.operatingSectorType,
            context.lookups.energyTransition.startingYear
          )
        : null;
    if (priorVintage != null && context.currentYear != null) {
      sectorUpdateDoc.$set = {
        ...sectorUpdateDoc.$set,
        capacityVintageYear: blendVintageYear(
          priorVintage,
          context.sector.capitalStock ?? 0,
          context.currentYear,
          context.landedBuildUnits
        ),
      };
    }
  }
  context.sectorOps.push({
    updateOne: {
      filter: { _id: context.sector._id },
      update: sectorUpdateDoc,
    },
  });
  if (context.operatingCapacityTarget != null) {
    // Preserve an explicit operating choice made after this turn's snapshot.
    context.sectorOps.push({
      updateOne: {
        filter: {
          _id: context.sector._id,
          activeCapacityPercent:
            context.originalActivePercent === undefined
              ? { $exists: false }
              : context.originalActivePercent,
        },
        update: { $set: { activeCapacityPercent: context.operatingCapacityTarget } },
      },
    });
  }
  // Shortage build speed-up: positional per-order updates, after the `$pull`
  // above (bulkWrite is ordered), matched by order identity so an order placed
  // during this phase is never touched.
  if (context.plantsEnabled) {
    context.sectorOps.push(
      ...(shortageBuildSpeedupOps({
        sectorId: context.sector._id,
        outstanding: context.existingQueue.filter((o) => o.onlineTurn > context.currentTurn),
        currentTurn: context.currentTurn,
        unmetShare: sectorOutputUnmetShare(
          context.strategyRates.supply,
          context.wideCommodityBalances
        ),
        now: context.now,
      }) as SectorUpdateOp[])
    );
  }
  // Flip-turn growth credit: a separate op, because `$push` cannot share the
  // `buildQueue` path with the `$pull` above. bulkWrite is ordered by default,
  // so this always lands after the pull. `$push` is additive, so it cannot
  // clobber a concurrently placed order either.
  if (context.plantsEnabled && context.flipGrowthCreditOrder) {
    context.sectorOps.push({
      updateOne: {
        filter: { _id: context.sector._id },
        update: {
          $push: { buildQueue: context.flipGrowthCreditOrder },
          // The credit order is free (costPaidAnchor 0), so CIP is unchanged.
          $set: { updatedAt: context.now },
        },
      },
    });
  }

  const result: SectorTurnResult = {
    // Inventory sell-down earns beside operating revenue and rides the same
    // aggregation/tax rails; carry cost lands in `costs` below. The freight
    // billing credit (canonical freight billing, flag-gated, 0 otherwise) is
    // haulage income and rides the same rails.
    hourlyRevenue: context.hourlyRevenue + hourlyInventoryRevenue + context.freightBilling.credit,
    newCurrentGrowthRate: context.newCurrentGrowthRate,
    // P3.5: under plants this is the DERIVED margin (profit ÷ revenue), not the
    // modifier stack — see `reportedEffectiveMargin`.
    effectiveMargin: reportedEffectiveMargin,
    // Include regulatoryBurden so it flows to corpLevelCosts (apportioned by
    // revenue share for tax) AND to incomePreDividends → earningsHistory →
    // the share-price formula's earningsPower component. Without this, the
    // burden would only hit sectorNPV and would be silently absorbed by
    // corp-level income.
    // Legacy-mothballed (embargoed foreign) sectors carry no operating cost —
    // the corp neither earns nor bleeds while dormant. Under the trade-exposure
    // model the sector still operates, so maintenance (which already scaled down
    // with the reduced hourlyRevenue) and growth/regulatory costs still apply.
    costs: context.embargoLegacyMothball
      ? 0
      : (physicalPnl?.totalCost ??
          context.maintenance +
            context.plantsUpkeepCost +
            context.hourlyGrowthCost +
            context.regulatoryBurden) +
        hourlyInventoryCarry +
        // Canonical freight billing: the shipping bill is a real cost leg
        // (flag-gated, 0 otherwise), the buyer half of the haul transfer.
        context.freightBilling.charge,
    /** P3a: idle-capacity (or mothball) upkeep charged this turn, ₳/turn. */
    plantsUpkeepCost: context.plantsUpkeepCost,
    workers: context.computedWorkers,
    ...(physicalPnl && !context.embargoLegacyMothball
      ? {
          costParts: {
            wages: physicalPnl.laborCost,
            inputs: physicalPnl.inputsCost,
            maintenance: Math.max(0, physicalPnl.otherOpex) + physicalPnl.upkeep,
            managementOverhead: 0,
            dominanceCost: 0,
            freight: context.freightBilling.charge,
          },
        }
      : {}),
    /** P3a: ₳ of paid-but-not-yet-delivered build orders after this turn. */
    constructionInProgressAnchor: context.constructionInProgressAnchor,
    npvContribution: context.market.capitalEnabled ? Math.round(capitalBookAnchor) : sectorNPV,
    ...(context.plantsMixPrice > 0 ? { outputMixPriceAnchor: context.plantsMixPrice } : {}),
    // P3.5: under plants these two modifiers no longer drive cost (input costs
    // are billed physically, surplus is priced on the revenue side). Reporting
    // them as 0 keeps the corp margin diagnostic honest about what actually
    // moved the sector — a non-zero readout for a dead channel is worse than
    // no readout.
    commodityMod: plantsPhysicalEnabled ? 0 : context.commodityMod,
    surplusMod: plantsPhysicalEnabled ? 0 : context.surplusMod,
    exportPremiumMod: context.exportPremiumMod,
    macroMod: context.inflationMod + context.debtToGdpMod + context.deficitMod,
    stateMetricsCappedTotal: context.stateMetricMargin.cappedTotal,
    stateMetricsLegacyTotal: context.stateMetricMargin.legacyTotal,
    hourlyGrowthCost: context.hourlyGrowthCost,
    regulatoryBurden: context.embargoLegacyMothball ? 0 : context.regulatoryBurden,
    // Funded turns charge the size and regulatory legs on the revenue the plant
    // sold, with the plants fade complete (dominance is tolled at build time).
    fundedSizeCostPp: fundedSizeCostPp({
      stateOwned: isStateOwned(context.corp),
      overheadStage: context.lookups.fundedOverheadStage ?? 0,
      overheadMod: context.fundedSizeLegs.overhead,
      sprawlMod: context.fundedSizeLegs.sprawl,
      dominancePenalty: context.fundedSizeLegs.dominance,
    }),
    fundedRegulatoryBurdenRate: context.embargoLegacyMothball
      ? 0
      : context.fundedRegulatoryBurdenRate,
    fundedDominancePenaltyPp:
      context.dominanceCostPct > 0 ? -context.dominanceCostPct : context.fundedSizeLegs.dominance,
    // Revenue effects and the dominance cost: absent when off.
    ...(!context.embargoLegacyMothball &&
    (context.lookups.revenueEffects?.enabled === true ||
      context.lookups.revenueEffects?.monopolyCharge === true)
      ? {
          fundedRevenueLegs: context.revenueEffectLegs,
          fundedSubsidyPp:
            context.lookups.revenueEffects?.enabled === true ? context.subsidyMod : 0,
        }
      : {}),
    ...(!context.embargoLegacyMothball && context.dominanceCostPct > 0
      ? { fundedDominanceCostPct: context.dominanceCostPct }
      : {}),
    nameplateHourlyGrowthCost: context.embargoLegacyMothball
      ? 0
      : context.nameplateHourlyGrowthCost,
    nameplateHourlyRevenue: context.nominalHourlyRevenue,
    // O1c: paid growth cost this turn (0 only under legacy mothball — froze, paid
    // nothing; the trade-exposure model keeps investing on the domestic remainder).
    growthInvestmentAnchor: context.embargoLegacyMothball ? 0 : context.hourlyGrowthCost,
    stateId: context.sector.stateId,
    countryId: context.sectorCountryId,
  };
  if (
    (context.market.internalSupplyTrades?.length || context.market.groupSupplyDiscountsEnabled) &&
    physicalPnl
  ) {
    if (context.market.groupSupplyDiscountsEnabled) {
      // One mix table for every output leg instead of one full mix total per
      // commodity.
      const outputMixWeights = commodityMixWeights(
        context.strategyRates.supply ?? {},
        context.basePrices
      );
      const outputUnits = Math.max(0, context.mothballed ? 0 : context.producedUnits);
      result.groupSupplyOutputUnits = new Map(
        Object.keys(context.strategyRates.supply ?? {}).map((commodity) => [
          commodity,
          outputUnits * mixWeightFrom(outputMixWeights, commodity as CommodityType),
        ])
      );
    }
    const internalInputUnits = new Map<CommodityType, number>();
    for (const [commodity, units] of inputUnitsByCommodity)
      internalInputUnits.set(commodity, units * TURNS_PER_DAY * context.lookups.eraUnitScale);
    result.internalSupplyInputUnits = internalInputUnits;
    result.applyInternalSupplyDiscount = (cost) => {
      const recalculated = decomposePhysicalCosts({
        ...physicalCostInput,
        internalSupplyDiscountCost: cost,
      });
      const pnl = recalculated.physicalPnl!;
      result.costs += cost;
      result.effectiveMargin =
        context.hourlyRevenue > 0 ? pnl.derivedMarginPct : context.effectiveMargin;
      result.npvContribution = context.market.capitalEnabled
        ? Math.round(recalculated.capitalBookAnchor)
        : recalculated.sectorNPV;
      sectorUpdate.effectiveProfitMargin = Math.round(result.effectiveMargin * 100) / 100;
      if (context.market.capitalEnabled)
        sectorUpdate.capitalBookAnchor = Math.round(recalculated.capitalBookAnchor);
      const daily = (amount: number) =>
        writeCorpEconomicLocal(
          amount * TURNS_PER_DAY,
          context.sectorCurrencyCode,
          context.sectorFxRate
        );
      const recorded = sectorUpdate.plantsPnl!;
      recorded.internalSupplyDiscountCost = daily(cost);
      recorded.financialLegs = daily(pnl.financialLegs);
      recorded.operatingCost = daily(pnl.operatingCost);
      recorded.totalCost = daily(pnl.totalCost + hourlyInventoryCarry);
      recorded.profit = daily(pnl.profit + hourlyInventoryRevenue - hourlyInventoryCarry);
      if (sectorUpdate.internalSupplyReceipt)
        sectorUpdate.internalSupplyReceipt.discountCostAnchor = cost * TURNS_PER_DAY;
    };
  }
  return result;
}
