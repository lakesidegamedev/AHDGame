/** Per-sector growth, production, mothballing and wage policy for an NPP corporation's turn decision. */
import type { SectorProfitInfo } from "@/lib/turn/npp/sectorProfitability";
import type { ObjectId } from "mongodb";
import type {
  NppPlantsContext,
  NppCorpDecision,
  NppCorpDecisionContext,
} from "@/lib/turn/npp/corpDecisionTypes";
import type { NppDecisionConstraint } from "@/lib/corporations/nppOperatorTelemetry/rules";
import {
  type PlacementSignals,
  type CommodityPriceRatioFn,
  sectorShortageScore,
  computeMacroProductionPolicy,
  sectorInputPressure,
} from "@/lib/turn/npp/marketSignals";
import type { CorporateSector } from "@/lib/db/types";
import { allowsNppIndustryInvestment } from "./rules/investmentProtection";
import { getOperatingSectorType, STRATEGY_COOLDOWN_TURNS } from "@/lib/constants/sectorStrategies";
import { CHRONIC_LOW_FILL_THRESHOLD } from "@/lib/turn/npp/strategyExpectedRevenue";
import { GROWTH_COST_MARGIN_SHARE } from "@/lib/turn/npp/nppCorporationTuning";
import { buildNppGlutMothballUpdates } from "@/lib/turn/npp/glutMothballing";
import { operatorMay } from "./rules/operatorPolicy";
import { chooseTransitionConversion } from "@/lib/turn/npp/rules/transitionConversion";
import { industryConversionFields } from "@/lib/corporations/retooling/conversion";
import { hasConversionBudget } from "@/lib/market/producerMarket/transitionRules";
import { pushFundedZeroSalesMothballs } from "@/lib/turn/npp/fundedZeroSalesMothball";
import { glutStaggerEligible } from "@/lib/turn/npp/cohort";
import { chooseNppStrategyRetool } from "@/lib/turn/npp/strategyRetooling";
import { pushNppWageUpdates } from "@/lib/turn/npp/nppWagePolicy";

/** Sets growth, production, mothballing and wage levers for each held sector. */
export function applyNppSectorPolicies({
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
}: {
  sectorProfits: SectorProfitInfo[];
  divestedSectorIds: ObjectId[];
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
  plants: NppPlantsContext | undefined;
  sectorUpdates: NppCorpDecision["sectorUpdates"];
  now: Date;
  constraintFlags: Partial<Record<NppDecisionConstraint, boolean>>;
  modifiers: CeoArchetypeModifiers;
  levers: StrategyLevers;
  corp: Corporation;
  placementSignals: PlacementSignals | undefined;
  priceRatioOf: CommodityPriceRatioFn;
  ctx: NppCorpDecisionContext;
  sectors: CorporateSector[];
  operator: OperatorPermissions;
}) {
  for (const sp of sectorProfits) {
    // Skip sectors being divested
    if (divestedSectorIds.includes(sp.sector._id)) continue;
    if (
      !allowsNppIndustryInvestment(
        operatingCorpType,
        getOperatingSectorType(
          sp.sector.sectorType,
          sp.sector.industryModel,
          sp.sector.mediaDiscriminator
        ),
        primaryIndustryOnly
      )
    ) {
      if (!plants?.enabled && (sp.sector.targetGrowthRate ?? 2) > 0) {
        sectorUpdates.push({
          filter: { _id: sp.sector._id },
          update: { $set: { targetGrowthRate: 0, updatedAt: now } },
        });
      }
      continue;
    }
    // A mothballed plant is deliberately idle (section 2c): growth targets are
    // meaningless while it's cold, and its stale margin would only add noise.
    if (sp.sector.mothballed === true) continue;
    // Plants: growth targets are vestigial — sectorTurn zeroes them every
    // turn, so adjusting them here is write churn with no reader. The AI
    // grows via section 6 reinvestment build orders instead.
    if (plants?.enabled) continue;

    // Fill-awareness (t899): lagged soldFraction is only set under clearing
    // mode. A sector that sold < CHRONIC_LOW_FILL_THRESHOLD of its output last
    // turn must not expand — more output would just go unsold. The strategy
    // brain (extractionAutoStrategy pass 2) handles re-pointing it at higher
    // expected revenue; here we only stop it digging deeper.
    const chronicLowFill =
      sp.sector.soldFraction != null && sp.sector.soldFraction < CHRONIC_LOW_FILL_THRESHOLD;

    let targetGrowth = sp.sector.targetGrowthRate ?? 2;

    // Growth must pay for itself. The category ladder below keys on MARGIN, but
    // margin alone does not tell you whether expanding is affordable: growth
    // cost is charged as a share of revenue, so a sector can hold a healthy
    // 25% margin and still lose money once a 21%-of-revenue growth bill lands
    // on top of 75% maintenance. Measured mid-run, that is exactly where firms
    // sat — margin 25, growth cost 21%, income negative — and because 25 reads
    // as "strong" the governor kept ADDING growth every turn, deepening the
    // loss it was supposed to correct.
    //
    // So: never increase growth when the sector's own growth bill already eats
    // its margin, and back off when it clearly exceeds it. A firm with real
    // headroom still expands; one paying more to grow than it earns stops.
    const sectorRevenue = sp.sector.revenue ?? 0;
    const growthCostShare =
      sectorRevenue > 0 ? (100 * (sp.sector.currentGrowthCost ?? 0)) / sectorRevenue : 0;
    // Growth may consume at most HALF the gross margin. Comparing it to the
    // whole margin was too permissive: measured mid-run at margin 27.2 with
    // growth cost 21.4% of revenue, the test passed (21.4 < 27.2) while the
    // firm was plainly losing money — maintenance takes (100 - margin) = 72.8%,
    // so margin plus growth already consumed 94.2% of revenue before any
    // corporate overhead, and average income sat at -13.4k with 67% of firms
    // loss-making. Requiring real headroom is what makes the governor bite: as
    // growth falls its cost falls, so the rule is self-correcting rather than a
    // fixed target.
    const growthUnaffordable = growthCostShare >= sp.margin * GROWTH_COST_MARGIN_SHARE;

    if (growthUnaffordable) {
      constraintFlags.growth_unaffordable = true;
      targetGrowth = Math.max(0, targetGrowth - 1);
    } else if (sp.marginCategory === "loss") {
      constraintFlags.loss_margin = true;
      targetGrowth = Math.max(0, targetGrowth - 2);
    } else if (sp.marginCategory === "strong") {
      targetGrowth = Math.min(5, targetGrowth + 2 + modifiers.growthDelta + levers.growthDelta);
    } else if (sp.marginCategory === "healthy") {
      targetGrowth = Math.min(5, targetGrowth + 1 + modifiers.growthDelta + levers.growthDelta);
    }
    // Thin margin → keep current target

    // State-resolution shortage (supply-dislocation P1b): the country blend
    // hid exactly the dislocation this tilt exists to correct — a plant in a
    // glutted state kept growing because OTHER states' shortage pulled the
    // national ratio up. Score the plant's own state, country fallback.
    const shortage = sectorShortageScore(
      sp.sector.sectorType,
      sp.sector.countryId ?? corp.countryId,
      (commodity, cid) =>
        placementSignals?.statePriceRatioOf?.(commodity, sp.sector.stateId) ??
        priceRatioOf(commodity, cid)
    );
    if (shortage >= 1.15 && sp.marginCategory !== "loss" && !growthUnaffordable) {
      targetGrowth = Math.min(5, targetGrowth + 1);
    } else if (shortage <= 0.85) {
      constraintFlags.glut_signal = true;
      targetGrowth = Math.max(0, targetGrowth - 1);
    }

    // Chronic low fill overrides every upward signal: never grow a sector
    // that can't sell what it already makes.
    if (chronicLowFill) {
      constraintFlags.chronic_low_fill = true;
      targetGrowth = Math.min(targetGrowth, sp.sector.targetGrowthRate ?? 2, 1);
    }

    if (targetGrowth !== (sp.sector.targetGrowthRate ?? 2)) {
      sectorUpdates.push({
        filter: { _id: sp.sector._id },
        update: { $set: { targetGrowthRate: targetGrowth, updatedAt: now } },
      });
    }
  }

  // ── 2b. Macro-aware production policy ─────────────────────────────────────
  // Ramp output of scarce/premium commodities. Glut response is growth-only
  // (section 2a) — see computeMacroProductionPolicy for why negative policy
  // is forbidden here. Trends 1pt/turn toward the target via the turn engine.
  for (const sp of sectorProfits) {
    if (divestedSectorIds.includes(sp.sector._id)) continue;
    if (sp.sector.mothballed === true) continue;
    const sectorCountryId = sp.sector.countryId ?? corp.countryId;
    let target = computeMacroProductionPolicy(sp.sector.sectorType, sectorCountryId, priceRatioOf);
    if (target == null) continue;
    // Fill-awareness (t899): under chronic low fill, cap the production policy
    // at 0 — a shortage price signal is no reason to ramp output this sector
    // demonstrably cannot sell.
    if (sp.sector.soldFraction != null && sp.sector.soldFraction < CHRONIC_LOW_FILL_THRESHOLD) {
      target = Math.min(target, 0);
    }
    if (target !== (sp.sector.productionPolicy ?? 0)) {
      sectorUpdates.push({
        filter: { _id: sp.sector._id },
        update: { $set: { productionPolicy: target, updatedAt: now } },
      });
    }
  }

  // ── 2c. Glut mothballing (plants only) ────────────────────────────────────
  const mothballUpdates = buildNppGlutMothballUpdates({
    corporation: corp,
    turn: ctx.turn,
    now,
    plantsEnabled: plants?.enabled === true,
    sectorProfits,
    divestedSectorIds,
    priceRatioOf,
    marketSaturationOf: placementSignals?.marketSaturationOf,
    fundedWorldEpoch: ctx.fundedWorldEpoch,
  });
  sectorUpdates.push(...mothballUpdates);
  const newlyMothballedIds = new Set(
    mothballUpdates
      .filter(({ update }) => update.$set?.mothballed === true)
      .map(({ filter }) => filter._id.toString())
  );

  // 2d. Transition package: free conversion of one losing, over-built sector
  // toward the country's real shortage (funded market only). The owner's
  // retool permission gates it.
  let conversionCharge: { countryId: string; cost: number } | undefined;
  let conversionApplied: { sectorId: string; set: Partial<(typeof sectors)[number]> } | null = null;
  if (ctx.transitionFirstFundedTurn != null && operatorMay(operator, "retool")) {
    const choice = chooseTransitionConversion({
      sectors,
      incomeBySectorId: new Map(sectorProfits.map((p) => [p.sector._id.toString(), p.income])),
      turn: ctx.turn,
      firstFundedTurn: ctx.transitionFirstFundedTurn,
      shortageOf: (lane, countryId) => sectorShortageScore(lane, countryId, priceRatioOf),
      inputPressureOf: (lane, countryId) => sectorInputPressure(lane, countryId, priceRatioOf),
      allowedLanes: operator.sectorTypes,
      excludedSectorIds: newlyMothballedIds,
    });
    const target = choice && sectors.find((s) => s._id.toString() === choice.sectorId);
    const fields = target && industryConversionFields(target, choice.lane);
    if (
      target &&
      fields?.ok &&
      hasConversionBudget(
        ctx.conversionBudgetOf?.(String(target.countryId ?? corp.countryId ?? ""))
      )
    ) {
      sectorUpdates.push({
        filter: { _id: target._id, cutoverConvertedAtTurn: { $exists: false } },
        update: {
          $set: {
            ...fields.set,
            cutoverConvertedAtTurn: ctx.turn,
            transitionCooldownUntilTurn: ctx.turn + STRATEGY_COOLDOWN_TURNS,
            updatedAt: now,
          },
        },
      });
      newlyMothballedIds.add(target._id.toString());
      conversionApplied = { sectorId: target._id.toString(), set: fields.set };
      conversionCharge = {
        countryId: String(target.countryId ?? corp.countryId ?? ""),
        cost: target.capacityBookAnchor ?? 0,
      };
    }
  }

  // ── 2e. Funded market: AI-run corporations reopen and mothball by zero sales.
  pushFundedZeroSalesMothballs({
    ctx,
    operator,
    sectors,
    divestedSectorIds,
    newlyMothballedIds,
    sectorUpdates,
    now,
  });

  // Strategy shifts use the 2c cohort independently: an input-squeeze
  // mothball and a shift never target a sector scheduled to go cold this
  // decision. Only one shift per corp per turn. SOEs are exempt for 2c's
  // reason. Autopilot and parent-owned corps leave retooling to the owner.
  if (
    !corp.countryOwnerId &&
    operatorMay(operator, "retool") &&
    glutStaggerEligible(corp._id.toString(), ctx.turn)
  ) {
    const retool = chooseNppStrategyRetool({
      corp,
      sectors: sectors.filter((sector) => !newlyMothballedIds.has(sector._id.toString())),
      divestedSectorIds,
      turn: ctx.turn,
      now,
      currentYear: ctx.currentYear ?? 0,
      techTreesEnabled: ctx.techTreesEnabled ?? false,
      sectorResearchByLane: ctx.sectorResearchByLane,
      techDiffusion: ctx.techDiffusion,
      plantsEnabled: plants?.enabled === true,
      priceRatioOf,
    });
    if (retool) {
      sectorUpdates.push({
        filter: { _id: retool.sectorId },
        update: { $set: retool.updates },
      });
    }
  }

  // ── 2d. Wage policy (labour wages+) ───────────────────────────────────────
  // Stepped toward shortage/glut targets one tick at a time; see nppWagePolicy.
  if (ctx.labourWagesEnabled) {
    pushNppWageUpdates({
      corp,
      sectorProfits,
      divestedSectorIds,
      priceRatioOf,
      now,
      sectorUpdates,
    });
  }
  return { conversionApplied, conversionCharge };
}
