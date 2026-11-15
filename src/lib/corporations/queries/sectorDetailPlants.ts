/** The plants section of the sector detail view. */
import type { PlantIdleCause, SectorPlantsSection, PlantBuildOrderView } from "./sectorPlantsTypes";
import type { CorporateSector, SectorBuildOrder } from "@/lib/db/types";
import { COMMODITY_LABELS } from "@/lib/constants/commoditiesCore";
import { SOLD_OUT_FILL } from "@/lib/turn/corporation/demandThrottle";
import { type OperatingSectorType, TURNS_PER_DAY } from "@/lib/constants/corporations";
import {
  type GovernorGlide,
  governorAnchorTurn,
  CAPITAL_DEPRECIATION_PER_TURN,
} from "@/lib/market/capital";
import {
  type CommodityTollModel,
  worstTollRatioForOrder,
} from "@/lib/corporations/rules/commodityDominanceRamp";
import type { RetoolHint } from "@/lib/corporations/retoolHint";
import {
  type PlantAccountInput,
  plantAccountTotals,
} from "@/lib/corporations/rules/plantAccountTotals";
import type { PolicyStackRow } from "@/lib/corporations/plantsPnlBasis";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { ownSiteDeliveries } from "@/lib/corporations/ownSiteDeliveries";
import {
  activeCapacityFraction,
  hasSettledOperatingHistory,
} from "@/lib/corporations/investment/rules";
import { bankIdleCapacity } from "@/lib/corporations/rules/bankIdleCapacity";
import { STRIKE_REVENUE_THROTTLE } from "@/lib/labour/strikes";
import {
  deliveredFraction,
  steadyUnitsPerTurn,
  nextArrivalTurn,
  queueUndeliveredCost,
} from "@/lib/corporations/buildDelivery";
import {
  computeBuildCost,
  MOTHBALL_UPKEEP_FRACTION,
  IDLE_UPKEEP_FRACTION,
  techBuildTurns,
  CAPACITY_BUILD_TURNS,
  laborIntensity,
} from "@/lib/constants/capacityEconomy";
import { idleUpkeepUnitPrice } from "@/lib/corporations/physicalPnl";
import { sectorOutputCommodities } from "@/lib/corporations/commodityDominanceContext";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import {
  inManualRestartGrace,
  manualRestartGraceEndsTurn,
} from "@/lib/turn/npp/nppCorporationTuning";
import { IDLE_RETIRE_GRACE_TURNS } from "@/lib/turn/corporation/rules/idleCapacityRetirement";

import { fundedIdleWeights, type IdleWeight } from "./sectorFundedIdle";
export { fundedIdleWeights, type IdleWeight } from "./sectorFundedIdle";

// ─── Plants tier (marketSystemMode >= "plants") ──────────────────────────────

/**
 * Build the plants-tier section. Pure: every DB-derived input is passed in, so
 * this is directly testable and adds no read to the sector-detail query beyond
 * the prime rate the caller already has to resolve.
 */
export function buildSectorPlantsSection(args: {
  /** Commodity-side capacity scale from the corporation's active bank charter. */
  bankingCommodityScale?: number;
  sector: CorporateSector;
  sectorType: OperatingSectorType;
  currentTurn: number;
  currentYear: number;
  governorCap: number;
  governorRampTurns: number;
  /** World flip turn the governor ramp anchors to (see `MarketContext`). */
  worldGovernorAnchorTurn?: number | null;
  governorGlideEndTurn?: number | null;
  governorGlide?: GovernorGlide | null;
  marketSharePercent: number;
  /** Corporation's aggregate share of the host country's sector market. */
  nationalMarketSharePercent?: number;
  /**
   * Rival corps in this (state, type) cell — scales the dominance build toll.
   * Null when the caller could not resolve it, which prices at the full toll.
   */
  competitorCount: number | null;
  primeRate: number;
  ceoAcumen: number;
  hostCostOfLivingIndex: number | null;
  techGrowthCostMultiplier: number;
  /** Tech dominance shield (cuts the dominance build toll). Optional for older fixtures. */
  techDominanceShield?: number;
  /**
   * Commodity-level toll inputs (see `commodityTollModels`): the firm's potential
   * output of each commodity this sector makes against world demand. Empty or
   * absent when nothing is measurable.
   */
  commodityTollModels?: CommodityTollModel[];
  /** The world's era unit-basis scale (`getEraUnitScale(preset)`). */
  eraUnitScale: number;
  preset?: string;
  corpCapitalAnchor: number;
  /** Untapped units in this market — see `unownedHeadroomUnitsOf`. */
  headroomUnits: number;
  /** Expansion appetite; automatic sizing uses measuredDemandGapUnits. */
  demandGapUnits?: number;
  measuredDemandGapUnits?: number | null;
  buildDemand?: import("@/lib/corporations/rules/fundedBuildDemand").BuildDemandRow[];
  buildDemandTurn?: number;
  /** Owned capacity in this (state, sectorType) cell, every producer, units/day. */
  ownedCellCapacityUnits?: number;
  /** Strategy suggestion when the plant's valuable output is oversupplied (computeRetoolHint). */
  retoolHint?: RetoolHint | null;
  workers: number;
  /** ₳/day, all on the same basis as `sector.revenue` normalized to ₳. */
  money: PlantAccountInput;
  /**
   * The modifier stack behind `pnl.policyAnchor`, already in money. Empty when
   * there is no stack to explain. Built by `buildPolicyStackRows` from the same
   * rows the corporation page's margin drilldown shows, so the two agree.
   */
  policyStack?: PolicyStackRow[];
  /** Regulatory burden in margin-pp equivalent (dominance). */
  regulatoryBurdenPp: number;
  /** Active-crisis margin penalty in pp (negative). */
  crisisMarginPenaltyPp: number;
  /** The corporation runs on owner-enabled autopilot. */
  autopilotEnabled?: boolean;
  /** True when this extraction sector is clamped by its state's deposits. */
  depositBound: boolean;
  /**
   * C9: `SECTOR_FX_SPREAD` when the corp's currency differs from the host
   * country's, else 0. Resolved by the caller (which knows both currencies) and
   * passed in so this builder stays pure.
   */
  fxSpreadRate: number;
  investment?: SectorPlantsSection["investment"];
}): SectorPlantsSection {
  const {
    sector,
    sectorType,
    currentTurn,
    currentYear,
    governorCap,
    governorRampTurns,
    marketSharePercent,
    nationalMarketSharePercent = 0,
    competitorCount,
    primeRate,
    ceoAcumen,
    hostCostOfLivingIndex,
    techGrowthCostMultiplier,
    techDominanceShield = 0,
    eraUnitScale,
    preset,
    corpCapitalAnchor,
    headroomUnits,
    demandGapUnits = 0,
    ownedCellCapacityUnits,
    retoolHint = null,
    workers,
    money,
    regulatoryBurdenPp,
    crisisMarginPenaltyPp,
    autopilotEnabled = false,
  } = args;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const nonNeg = (v: number) => (v > 0 ? v : 0);

  const capacityUnits = num(sector.operatingCapacityUnits ?? sector.capitalStock);
  const plantCount =
    Number.isInteger(sector.plantCount) && (sector.plantCount ?? 0) >= 0
      ? (sector.plantCount as number)
      : seedPlantLedger(sector, sector.capitalStock).plantCount;
  const producedUnits = num(sector.producedUnits);
  const soldUnits = num(sector.soldUnits);
  const mothballed = sector.mothballed === true;

  // Output handed free to the company's own sites is used, not unsold: a Kanto plant that fed its owner's US mines read "75 units went
  // unsold, the market is oversupplied" on a fully used turn.
  const ownSite = ownSiteDeliveries(sector.producerSettlement, currentTurn);
  const ownSiteShare = ownSite?.share ?? 0;
  const ownSiteUnits = producedUnits != null ? nonNeg(producedUnits * ownSiteShare) : null;
  const unsoldUnits =
    producedUnits != null && soldUnits != null
      ? nonNeg(producedUnits - soldUnits - (ownSiteUnits ?? 0))
      : null;
  const idleUnits =
    capacityUnits != null && producedUnits != null ? nonNeg(capacityUnits - producedUnits) : null;
  const fillRate =
    producedUnits != null && producedUnits > 0 && soldUnits != null
      ? Math.min(1, nonNeg(soldUnits) / producedUnits)
      : null;

  // Buyers' room is reported against the plant that would receive the build.
  // A sector its own demand throttle held back last turn already has idle
  // capacity that reaches the market first, so its room to build is 0.
  const ownThrottle = num(sector.demandThrottleFactor);
  const roomHeldByOwnIdle = !mothballed && ownThrottle != null && ownThrottle < 0.999;
  // Unclaimed share from the same unowned pool `headroomUnits` measures.
  const ownedCell = num(ownedCellCapacityUnits);
  const unclaimedPool = nonNeg(headroomUnits);
  const unclaimedSharePct =
    ownedCell != null && ownedCell + unclaimedPool > 0
      ? Math.round((unclaimedPool / (nonNeg(ownedCell) + unclaimedPool)) * 1000) / 10
      : null;

  // ─── Idle attribution ──────────────────────────────────────────────────────
  // Every leg the engine applied is a factor in (0, 1]; its loss weight is
  // 1 − factor. The named weights, including the persisted demand throttle,
  // are scaled to fit inside the ACTUAL idle share and any remainder becomes
  // "other", so the meter reconciles exactly rather than asserting a
  // decomposition the engine did not produce.
  const activeFraction = activeCapacityFraction(sector);
  const idleCauses: PlantIdleCause[] = [];
  if (mothballed && capacityUnits != null && capacityUnits > 0) {
    idleCauses.push({ cause: "mothballed", units: capacityUnits });
  } else if (idleUnits != null && idleUnits > 0 && capacityUnits && capacityUnits > 0) {
    const coldUnits = Math.min(idleUnits, capacityUnits * (1 - activeFraction));
    if (coldUnits > 0) idleCauses.push({ cause: "mothballed", units: coldUnits });
    const { units: bankUnits, capacityShare: bankShare } = bankIdleCapacity(
      sectorType,
      capacityUnits,
      idleUnits - coldUnits,
      args.bankingCommodityScale
    );
    if (bankUnits > 0) {
      idleCauses.push({ cause: "bank", units: bankUnits, capacityShare: bankShare });
    }
    const idleShare = (idleUnits - coldUnits - bankUnits) / capacityUnits;
    const weights: IdleWeight[] = [];
    const funded = fundedIdleWeights(sector.producerSettlement, currentTurn);
    if (funded) {
      weights.push(...funded);
    } else {
      const throughput = num(sector.throughputFactor);
      if (throughput != null && throughput < 1) {
        weights.push({ cause: "inputs", w: 1 - Math.max(0, throughput) });
      }
      const demandThrottle = num(sector.demandThrottleFactor);
      if (demandThrottle != null && demandThrottle < 1) {
        const cause = fillRate != null && fillRate >= SOLD_OUT_FILL ? "ramping" : "demand";
        weights.push({ cause, w: 1 - Math.max(0, demandThrottle) });
      }
    }
    if (sector.strikeStartedAtTurn != null) {
      weights.push({ cause: "strike", w: 1 - STRIKE_REVENUE_THROTTLE });
    }
    if (crisisMarginPenaltyPp < 0) {
      // No persisted physical-crisis factor exists; the margin penalty's
      // magnitude is the only honest proxy for how hard the disaster bit.
      weights.push({ cause: "disaster", w: Math.min(1, Math.abs(crisisMarginPenaltyPp) / 100) });
    }
    if ((sector.productionPolicyLevel ?? 0) < 0) {
      weights.push({
        cause: "policy",
        w: Math.min(1, Math.abs(sector.productionPolicyLevel ?? 0) / 10),
      });
    }
    const staffing = num(sector.labourStaffingFactor);
    if (staffing != null && staffing < 1) {
      weights.push({ cause: "staffing", w: 1 - Math.max(0, staffing) });
    }
    // A deposit constraint is only a yes/no signal, not a measured loss.
    // Assigning the entire remaining idle share to it fabricates a quantity,
    // including for output legs whose deposits have ample headroom. Keep
    // unmeasured losses under "other"; the resource panel shows constraints.
    const sumW = weights.reduce((s, x) => s + x.w, 0);
    const scale = sumW > 0 ? Math.min(1, idleShare / sumW) : 0;
    let attributed = coldUnits + bankUnits;
    for (const { cause, w, heldInput } of weights) {
      const units = w * scale * capacityUnits;
      if (units <= 0) continue;
      attributed += units;
      idleCauses.push({ cause, units, ...(heldInput ? { heldInput } : {}) });
    }
    const leftover = nonNeg(idleUnits - attributed);
    if (leftover > 0.0001) idleCauses.push({ cause: "other", units: leftover });
  }

  // ─── Build queue ──────────────────────────────────────────────────────────
  const rawQueue: SectorBuildOrder[] = Array.isArray(sector.buildQueue) ? sector.buildQueue : [];
  const buildQueue: PlantBuildOrderView[] = rawQueue.map((o, orderIndex) => {
    // `progress` is the share of capacity actually DELIVERED so far: a linear
    // ramp for a smooth order, a step (0 then 1) for a legacy all-at-once order.
    const delivered = deliveredFraction(o, currentTurn);
    return {
      orderIndex,
      unitsOrdered: o.unitsOrdered,
      unitsDelivered: o.unitsOrdered * delivered,
      smooth: o.smooth === true,
      unitsPerTurn: steadyUnitsPerTurn(o, currentTurn),
      nextArrivalTurn: nextArrivalTurn(o, currentTurn),
      costPaidAnchor: o.costPaidAnchor,
      startTurn: o.startTurn,
      onlineTurn: o.onlineTurn,
      turnsRemaining: nonNeg(o.onlineTurn - currentTurn),
      progress: delivered,
    };
  });

  // ─── Governor ("market support") ──────────────────────────────────────────
  const plantsStartTurn =
    governorAnchorTurn(
      num(sector.plantsStartTurn),
      args.worldGovernorAnchorTurn,
      args.governorGlide
    ) ?? null;
  const ownTurnsRemaining =
    plantsStartTurn != null
      ? nonNeg(plantsStartTurn + governorRampTurns - currentTurn)
      : governorRampTurns;
  const governorTurnsRemaining =
    args.governorGlideEndTurn != null
      ? Math.min(ownTurnsRemaining, nonNeg(args.governorGlideEndTurn - currentTurn))
      : ownTurnsRemaining;

  // ─── Build quote ──────────────────────────────────────────────────────────
  const tollModels = args.commodityTollModels ?? [];
  const oneUnitInputs = {
    sectorType,
    industryModel: sector.industryModel,
    units: 1,
    // Must match what `buildCapacity` charges, or the quote a player sees is
    // 326.9x off the invoice for a rare-earth sector.
    strategyId: sector.strategyId ?? null,
    year: currentYear,
    preset,
    eraUnitScale,
    marketSharePercent,
    nationalMarketSharePercent,
    competitorCount: competitorCount ?? undefined,
    primeRate,
    acumen: ceoAcumen,
    hostCostOfLivingIndex,
    techGrowthCostMultiplier,
    techDominanceShield,
  };
  // The local/national toll alone, then the full quote for one unit. The
  // commodity toll reads the ratio after the order lands, so the dialog
  // re-prices quantities from `commodityToll` instead of scaling this linearly.
  const localQuote = computeBuildCost({ ...oneUnitInputs, strategyId: oneUnitInputs.strategyId });
  const oneUnit = computeBuildCost({
    ...oneUnitInputs,
    strategyId: oneUnitInputs.strategyId,
    commodityDominanceRatio: worstTollRatioForOrder(tollModels, 1),
  });
  const perUnitAnchor = oneUnit.totalAnchor;
  // C9: the server charges construction cost PLUS the cross-currency spread
  // (buildCapacity.ts). Both the quote and the affordability gate have to price
  // the same thing the server bills, or a foreign build is quoted low and then
  // rejected.
  const safeFxSpreadRate =
    Number.isFinite(args.fxSpreadRate) && args.fxSpreadRate > 0 ? args.fxSpreadRate : 0;
  const perUnitChargedAnchor = perUnitAnchor * (1 + safeFxSpreadRate);

  const upkeepBasis = sector.plantsUpkeepMarginBasisAnchor;
  const upkeepUnitDailyAnchor =
    capacityUnits != null &&
    capacityUnits > 0 &&
    typeof upkeepBasis === "number" &&
    Number.isFinite(upkeepBasis) &&
    typeof money.nameplateRevenueAnchor === "number"
      ? idleUpkeepUnitPrice({
          mixPrice: money.nameplateRevenueAnchor / capacityUnits,
          turnsPerDay: 1,
          anchoredMarginBasis: upkeepBasis,
          liveMarginBasis: upkeepBasis,
        })
      : null;
  // ─── Physical P&L ─────────────────────────────────────────────────────────
  // The engine bills ONE operating number (`maintenanceNet` + labour). These
  // lines split that same number, so the panel can never disagree with the
  // profit the turn actually booked: `otherOperating` is whatever the named
  // physical lines do not explain, which is exactly the residual
  // `physicalPnl.ts` solves for. It is SIGNED, because that residual is signed.
  //
  // The identity every caller may rely on, exactly:
  //   revenue - (inputs + labour + upkeep + compliance + otherOperating
  //              + growthAndBuild) === profit
  const utilization =
    capacityUnits != null && capacityUnits > 0 && producedUnits != null
      ? Math.max(0, Math.min(1, producedUnits / capacityUnits))
      : 1;
  // OWNER-idle share only — the turn charges upkeep on the capacity the owner
  // chose to leave idle, not on capacity the world's input shortage idled (see
  // `ownerIdleUnits`). Reading total idleness here would show players an upkeep
  // line the engine never billed them, and would steal that ₳ from the inputs
  // line it actually belongs to. `throughputFactor` is the involuntary leg this
  // panel can see; disaster/strike/hard-min legs are not persisted per sector,
  // so the split can still over-attribute slightly in those rarer states.
  const involuntaryThrottle = (() => {
    const t = num(sector.throughputFactor);
    return t != null && t > 0 && t <= 1 ? t : 1;
  })();
  const idleShareForBill = Math.max(0, 1 - Math.min(1, utilization / involuntaryThrottle));
  // Invert the plants cost basis (utilization + IDLE × (1 − utilization)) to
  // recover the full-capacity bill, then read the idle slice off it.
  const costBasis = mothballed
    ? MOTHBALL_UPKEEP_FRACTION
    : utilization + IDLE_UPKEEP_FRACTION * idleShareForBill;
  const internalSupplyChargeAnchor = nonNeg(money.internalSupplyChargeAnchor ?? 0);
  const fullMaintenance =
    costBasis > 0 ? (money.maintenanceNetAnchor - internalSupplyChargeAnchor) / costBasis : 0;
  const upkeepAnchor = money.enginePnl
    ? nonNeg(money.enginePnl.upkeep)
    : nonNeg(
        mothballed
          ? money.maintenanceNetAnchor
          : fullMaintenance * IDLE_UPKEEP_FRACTION * idleShareForBill
      );
  const complianceAnchor = money.enginePnl
    ? nonNeg(money.enginePnl.compliance)
    : money.fundedComplianceAnchor != null
      ? nonNeg(money.fundedComplianceAnchor)
      : nonNeg((money.realizedRevenueAnchor * Math.max(0, regulatoryBurdenPp)) / 100);
  // The input bill renders at its real size, and `otherOperating` is the SIGNED
  // remainder that makes the named lines sum back to `maintenanceNet` exactly.
  //
  // A sector's derived operating cost can land BELOW its named physical lines:
  // `solveOtherOpexPerUnit` keeps a NEGATIVE residual, and `derivedMarginPct` is
  // capped at 100. Both reconstruct as a maintenance bill smaller than the wage
  // bill, so `maintenanceNet` can go negative once wages are carved out. That is
  // a credit, not an absence of costs; do not clamp it or squeeze the inputs line
  // to fit, or the lines stop summing to profit.
  //
  // This mirrors the corporation page's signed, unclamped `otherPp` residual.

  // FALLBACK ONLY: when the turn's own lines are on the row (`money.enginePnl`)
  // they are used verbatim and nothing is inverted, because the inversion cannot
  // be right at the margin cap. The engine path also carries upkeep and
  // compliance, which the margin's scope excludes and the profit includes.
  const engine = money.enginePnl ?? null;
  const inputsAnchor = engine ? engine.inputs : nonNeg(money.inputsAnchor);
  const internalSupplyDiscountAnchor = engine?.internalSupplyDiscountAnchor ?? 0;
  const otherOperatingAnchor = money.statement
    ? money.statement.externalCost -
      (money.freightCostAnchor ?? 0) -
      inputsAnchor -
      (engine ? engine.labour : nonNeg(money.labourAnchor)) -
      upkeepAnchor -
      complianceAnchor -
      (engine
        ? nonNeg(
            engine.totalCost -
              engine.operatingCost -
              engine.upkeep -
              engine.compliance -
              engine.inventoryCarry
          )
        : nonNeg(money.growthCostAnchor)) +
      (engine?.policyCredit ?? 0) -
      internalSupplyDiscountAnchor
    : engine
      ? // Financial legs (disaster losses) and inventory carry have no line of
        // their own in the cost chain, so they sit here in the residual.
        engine.otherOpex +
        engine.financialLegs +
        engine.inventoryCarry -
        internalSupplyDiscountAnchor
      : money.maintenanceNetAnchor -
        upkeepAnchor -
        complianceAnchor -
        inputsAnchor -
        internalSupplyChargeAnchor;
  // The whole modifier stack as one signed line: positive is a credit that
  // lowers cost. Rendered as its own row with a drilldown, so a player can see
  // their subsidy or a live crisis as a number in the same units as the wage
  // bill instead of it vanishing inside "other running costs".
  const policyAnchor = engine ? engine.policyCredit : 0;
  const policyPp = engine ? engine.policyPp : 0;
  const financialEventsAnchor = engine
    ? nonNeg(engine.financialLegs - internalSupplyDiscountAnchor)
    : nonNeg((money.realizedRevenueAnchor * Math.abs(Math.min(0, crisisMarginPenaltyPp))) / 100);

  // ─── Truth headline ───────────────────────────────────────────────────────
  // Everything below is per-PRODUCED-unit on purpose. The stored margin divides
  // by sold revenue, so a sector selling 15% of its output can display a fat
  // positive margin while the whole operation loses money. The headline
  // spreads cost and revenue over every unit made, which is the basis the
  // player's bank balance actually moves on.
  // One definition: market sales over units made, the same two numbers the
  // Offered / Sold / Unsold rows print. The engine's soldFraction is only the
  // fallback when the unit counts are missing.
  const soldFraction = fillRate ?? num(sector.soldFraction);
  const soldByCommodity = Object.entries(sector.soldByCommodity ?? {})
    .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]))
    .map(([commodity, fraction]) => ({
      commodity,
      fraction: Math.max(0, Math.min(1, fraction)),
    }));
  // Share of the shortfall that is a DELIVERY failure, not a demand failure.
  // Absent on every sector until the freight pass writes it, so it reads as 0
  // and the surfaces render nothing extra.
  const deliveryLimitedFraction = Math.max(
    0,
    Math.min(1, num(sector.deliveryLimitedFraction) ?? 0)
  );
  const deliveryLimitedFreightClass =
    sector.deliveryLimitedFreightClass === "bulk" ||
    sector.deliveryLimitedFreightClass === "special" ||
    sector.deliveryLimitedFreightClass === "grid"
      ? sector.deliveryLimitedFreightClass
      : null;
  // Full operating bill: maintenanceNet carries inputs, upkeep on idle capacity,
  // compliance and other opex; labour is billed beside it. Floor the SUM, not
  // each leg: maintenanceNet is routinely negative (a credit) under plants, and
  // flooring it alone double-counts wages the credit already offset.
  // When using the engine's own lines, no flooring is needed: a negative total
  // is meaningful there. The fallback keeps the floor because an INVERTED total
  // can go negative for reasons that are artefacts of the inversion.
  const {
    engineGrowthAnchor,
    operatingCostAnchor,
    revenueAnchor,
    ownSiteMemoAnchor,
    statementProfit,
    fillAdjustedMarginPct,
  } = plantAccountTotals(money, (ownSite?.valueAnchor ?? 0) * TURNS_PER_DAY);
  const receivedPerUnitAnchor =
    producedUnits != null && producedUnits > 0 ? revenueAnchor / producedUnits : null;
  const costPerUnitAnchor =
    producedUnits != null && producedUnits > 0 ? operatingCostAnchor / producedUnits : null;
  // Break-even: profit is stored per financial day (TURNS_PER_DAY turns), CIP
  // is a stock. Positive profit pays CIP down in cip / profitPerTurn turns; at
  // zero CIP the sector's own profit sign is the whole story.
  const cipAnchor = Math.max(0, queueUndeliveredCost(rawQueue, currentTurn));
  const profitPerTurnAnchor = statementProfit / TURNS_PER_DAY;
  const breakEven: SectorPlantsSection["truth"]["breakEven"] =
    profitPerTurnAnchor > 0
      ? cipAnchor > 0
        ? { status: "turns", turns: Math.ceil(cipAnchor / profitPerTurnAnchor) }
        : { status: "profitable_now", turns: null }
      : profitPerTurnAnchor === 0 && cipAnchor === 0
        ? { status: "profitable_now", turns: null }
        : { status: "not_at_current_fills", turns: null };

  return {
    plantCount,
    strategyId: sector.strategyId ?? null,
    capacityUnits,
    producedUnits,
    soldUnits,
    ownSiteUnits,
    unsoldUnits,
    idleUnits,
    fillRate,
    idleCauses,
    localMarketOutputs: sectorOutputCommodities(sector, currentTurn)
      .filter(isStateScopedCommodity)
      .map((commodity) => COMMODITY_LABELS[commodity]),
    mothballed,
    ...(autopilotEnabled && !mothballed && inManualRestartGrace(sector, currentTurn)
      ? { autopilotHoldUntilTurn: manualRestartGraceEndsTurn(sector) ?? undefined }
      : {}),
    activeCapacityPercent: activeFraction * 100,
    ...(upkeepUnitDailyAnchor != null
      ? {
          capacityRecovery: {
            coldUpkeepFraction: MOTHBALL_UPKEEP_FRACTION,
            coldUpkeepDailyAnchor:
              upkeepUnitDailyAnchor * (capacityUnits ?? 0) * MOTHBALL_UPKEEP_FRACTION,
          },
          ...(args.investment &&
          !sector.transitionFromStrategyId &&
          sector.plantsPnl?.turn === args.currentTurn &&
          hasSettledOperatingHistory({
            plantsStartTurn: sector.plantsStartTurn,
            clearingStartTurn: sector.clearingStartTurn,
            observedTurn: sector.plantsPnl.turn,
            rampTurns: governorRampTurns,
          })
            ? {
                investment: {
                  ...args.investment,
                },
              }
            : {}),
        }
      : {}),
    buildQueue,
    constructionInProgressAnchor: cipAnchor,
    depreciationPerTurn: CAPITAL_DEPRECIATION_PER_TURN,
    buildTurns: techBuildTurns(CAPACITY_BUILD_TURNS(sectorType), techGrowthCostMultiplier),
    workers,
    workersDesired: num(sector.workersDesired) ?? workers,
    labourStaffingFactor: Math.max(0, Math.min(1, num(sector.labourStaffingFactor) ?? 1)),
    unionizationPct: num(sector.unionization) ?? 0,
    laborIntensity: laborIntensity(
      sectorType,
      currentYear,
      eraUnitScale,
      sector.industryModel,
      sector.mediaDiscriminator,
      sector.strategyId
    ),
    governor: {
      active: governorTurnsRemaining > 0,
      startTurn: plantsStartTurn,
      rampTurns: governorRampTurns,
      turnsRemaining: governorTurnsRemaining,
      cap: governorCap,
    },
    headroomUnits: nonNeg(headroomUnits),
    demandGapUnits: roomHeldByOwnIdle ? 0 : nonNeg(demandGapUnits),
    measuredDemandGapUnits: roomHeldByOwnIdle ? 0 : (args.measuredDemandGapUnits ?? null),
    buildDemand: args.buildDemand,
    buildDemandTurn: args.buildDemandTurn,
    roomHeldByOwnIdle,
    ...(!mothballed && (num(sector.demandIdleTurns) ?? 0) > 0
      ? {
          idleRetirement: {
            turns: num(sector.demandIdleTurns) ?? 0,
            graceTurns: IDLE_RETIRE_GRACE_TURNS,
            retiredUnits: nonNeg(num(sector.idleCapacityRetiredUnits) ?? 0),
          },
        }
      : {}),
    ...(unclaimedSharePct != null ? { unclaimedSharePct } : {}),
    retoolHint,
    currentTurn,
    buildQuote: {
      unitPriceAnchor: oneUnit.unitPriceAnchor,
      expansionMultiplier: oneUnit.expansionMultiplier,
      dominanceMultiplier: oneUnit.dominanceMultiplier,
      localDominanceMultiplier: localQuote.dominanceMultiplier,
      ...(tollModels.length > 0
        ? { commodityToll: { models: tollModels, ratioNow: worstTollRatioForOrder(tollModels, 0) } }
        : {}),
      rateMultiplier: oneUnit.rateMultiplier,
      acumenMultiplier: oneUnit.acumenMultiplier,
      techMultiplier: oneUnit.techMultiplier,
      hostPriceMultiplier: oneUnit.hostPriceMultiplier,
      perUnitAnchor,
      fxSpreadRate: safeFxSpreadRate,
      perUnitChargedAnchor,
      corpCapitalAnchor,
      maxAffordableUnits:
        perUnitChargedAnchor > 0
          ? Math.max(0, Math.floor(corpCapitalAnchor / perUnitChargedAnchor))
          : 0,
    },
    policyStack: args.policyStack ?? [],
    pnl: {
      ...(money.statement ? { statement: money.statement } : {}),
      revenueAnchor,
      inputsAnchor,
      labourAnchor: engine ? engine.labour : nonNeg(money.labourAnchor),
      upkeepAnchor,
      complianceAnchor,
      policyAnchor,
      policyPp,
      otherOperatingAnchor,
      internalSupplyDiscountAnchor,
      ...((money.internalSupplyIncomeAnchor ?? 0) > 0
        ? { internalSupplyIncomeAnchor: money.internalSupplyIncomeAnchor }
        : {}),
      ...(internalSupplyChargeAnchor > 0 ? { internalSupplyChargeAnchor } : {}),
      ...(ownSiteMemoAnchor > 0 ? { ownSiteMemoAnchor } : {}),
      freightCostAnchor: money.freightCostAnchor ?? 0,
      freightIncomeAnchor: money.freightIncomeAnchor ?? 0,
      growthAndBuildAnchor: engine ? nonNeg(engineGrowthAnchor) : nonNeg(money.growthCostAnchor),
      profitAnchor: statementProfit,
      financialEventsAnchor,
      avgSalePriceAnchor:
        soldUnits != null && soldUnits > 0
          ? (revenueAnchor - (money.internalSupplyIncomeAnchor ?? 0)) / soldUnits
          : null,
      profitPerUnitAnchor:
        producedUnits != null && producedUnits > 0 ? statementProfit / producedUnits : null,
    },
    truth: {
      soldFraction,
      soldByCommodity,
      deliveryLimitedFraction,
      deliveryLimitedFreightClass,
      lowFillTurns: num(sector.lowFillTurns) ?? 0,
      sellOutsideFirst: sector.sellOutsideFirst === true,
      inventory: {
        stockpileUnsold: sector.stockpileUnsold === true,
        heldUnits: Object.values(sector.inventoryUnits ?? {}).reduce<number>(
          (s, u) => s + (typeof u === "number" && Number.isFinite(u) ? u : 0),
          0
        ),
        heldValueAnchor: num(sector.inventoryValueAnchor) ?? 0,
        byCommodity: Object.entries(sector.inventoryUnits ?? {})
          .filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0)
          .map(([commodity, units]) => ({ commodity, units })),
        drainedUnits: num(sector.inventoryDrainedUnits) ?? 0,
        spoiledUnits: num(sector.inventorySpoiledUnits) ?? 0,
      },
      receivedPerUnitAnchor,
      costPerUnitAnchor,
      fillAdjustedMarginPct,
      breakEven,
    },
  };
}
