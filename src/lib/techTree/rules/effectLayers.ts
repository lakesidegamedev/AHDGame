import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import {
  TECH_GROWTH_REDUCTION_CAP,
  TECH_INPUT_EFFICIENCY_CAP,
  TECH_LABOR_REDUCTION_CAP,
  TECH_METHOD_OUTPUT_CAP,
  TECH_PLANT_OUTPUT_CAP,
  TECH_SHIELD_CAP,
  type AggregatedTechEffects,
  type TechEffect,
} from "@/lib/constants/techTree/effects";

/**
 * One layer of per-turn effects after its own caps: the plain sums are clamped
 * to their caps and the per-commodity rates are multiplied out. The turn engine
 * never sees a layer directly; `finishTechLayers` folds one or two of them into
 * {@link AggregatedTechEffects}.
 */
interface TechEffectLayer {
  plantOutput: number;
  methodOutput: number;
  inputEfficiency: number;
  growthReduction: number;
  laborReduction: number;
  dominanceShield: number;
  tariffShield: number;
  expansionDiscount: number;
  inputCostMult: Record<string, number>;
  outputRateMult: Record<string, number>;
}

function reduceTechLayer(effects: readonly TechEffect[]): TechEffectLayer {
  let plantOutputPct = 0;
  let methodOutputPct = 0;
  let inputEfficiencyPct = 0;
  let growthCostReductionPct = 0;
  let laborCostReductionPct = 0;
  let dominanceShield = 0;
  let tariffShield = 0;
  let expansionDiscount = 0;
  const inputCostMult: Record<string, number> = {};
  const outputRateMult: Record<string, number> = {};
  for (const effect of effects) {
    if (effect.kind === "plantOutput") {
      if (effect.method) methodOutputPct += effect.pct;
      else plantOutputPct += effect.pct;
    } else if (effect.kind === "inputEfficiency") {
      inputEfficiencyPct += effect.pct;
    } else if (effect.kind === "growthCostReduction") {
      growthCostReductionPct += effect.pct;
    } else if (effect.kind === "laborCostReduction") {
      laborCostReductionPct += effect.pct;
    } else if (effect.kind === "dominanceShield") {
      dominanceShield += effect.pct;
    } else if (effect.kind === "tariffShield") {
      tariffShield += effect.pct;
    } else if (effect.kind === "expansionDiscount") {
      expansionDiscount += effect.pct;
    } else if (effect.kind === "inputCost") {
      const cur = inputCostMult[effect.commodity] ?? 1;
      inputCostMult[effect.commodity] = cur * Math.max(0, 1 - effect.pct);
    } else if (effect.kind === "outputRate") {
      const cur = outputRateMult[effect.commodity] ?? 1;
      outputRateMult[effect.commodity] = cur * (1 + Math.max(0, effect.pct));
    }
  }
  const clamp = (v: number, cap: number) => Math.min(cap, Math.max(0, v));
  return {
    plantOutput: clamp(plantOutputPct, TECH_PLANT_OUTPUT_CAP),
    methodOutput: clamp(methodOutputPct, TECH_METHOD_OUTPUT_CAP),
    inputEfficiency: clamp(inputEfficiencyPct, TECH_INPUT_EFFICIENCY_CAP),
    growthReduction: clamp(growthCostReductionPct, TECH_GROWTH_REDUCTION_CAP),
    laborReduction: clamp(laborCostReductionPct, TECH_LABOR_REDUCTION_CAP),
    dominanceShield: clamp(dominanceShield, TECH_SHIELD_CAP),
    tariffShield: clamp(tariffShield, TECH_SHIELD_CAP),
    expansionDiscount: clamp(expansionDiscount, TECH_SHIELD_CAP),
    inputCostMult,
    outputRateMult,
  };
}

/**
 * Fold a baseline layer (or none) and a researched layer into the engine
 * scalars. See {@link aggregateTechEffectLayers} for the rule.
 */
function finishTechLayers(
  baseline: TechEffectLayer | null,
  researched: TechEffectLayer
): AggregatedTechEffects {
  const b = baseline;
  // Percent bonuses that cannot reach 100% add (baseline + researched).
  const plantOutputBonus = (b?.plantOutput ?? 0) + researched.plantOutput;
  const methodOutputBonus = (b?.methodOutput ?? 0) + researched.methodOutput;
  const inputEfficiencyBonus = (b?.inputEfficiency ?? 0) + researched.inputEfficiency;
  // Cost multipliers multiply, so two layers of up to 50% each can never make
  // a cost free: (1 - 0.5) * (1 - 0.5) = 0.25.
  const growthCostMultiplier = (1 - (b?.growthReduction ?? 0)) * (1 - researched.growthReduction);
  const laborCostMultiplier = (1 - (b?.laborReduction ?? 0)) * (1 - researched.laborReduction);
  // Shields are shares of a penalty neutralized: the second layer works on what
  // the first left, s = a + b - a*b, so two layers never pass 100%.
  const shield = (own: number, base: number | undefined) =>
    base === undefined ? own : base + own - base * own;
  const inputRateMult: Record<string, number> = { ...(b?.inputCostMult ?? {}) };
  for (const [c, m] of Object.entries(researched.inputCostMult)) {
    inputRateMult[c] = (inputRateMult[c] ?? 1) * m;
  }
  const outputRateMult: Record<string, number> = { ...(b?.outputRateMult ?? {}) };
  for (const [c, m] of Object.entries(researched.outputRateMult)) {
    outputRateMult[c] = (outputRateMult[c] ?? 1) * m;
  }
  // The plant-wide effects fold into the per-commodity maps every consumer
  // already reads (supply, demand, unit yield, world ledger), so no consumer
  // needs a second code path. Applied to every commodity: a rate a recipe does
  // not use is never read.
  if (plantOutputBonus > 0 || methodOutputBonus > 0 || inputEfficiencyBonus > 0) {
    for (const commodity of COMMODITY_TYPES) {
      if (plantOutputBonus > 0 || methodOutputBonus > 0) {
        outputRateMult[commodity] =
          (outputRateMult[commodity] ?? 1) * (1 + plantOutputBonus) * (1 + methodOutputBonus);
      }
      if (inputEfficiencyBonus > 0) {
        inputRateMult[commodity] = (inputRateMult[commodity] ?? 1) * (1 - inputEfficiencyBonus);
      }
    }
  }
  return {
    plantOutputBonus,
    methodOutputBonus,
    inputEfficiencyBonus,
    growthCostMultiplier,
    laborCostMultiplier,
    inputRateMult,
    outputRateMult,
    dominanceShield: shield(researched.dominanceShield, b?.dominanceShield),
    tariffShield: shield(researched.tariffShield, b?.tariffShield),
    expansionDiscount: shield(researched.expansionDiscount, b?.expansionDiscount),
  };
}

/** Reduce a flat list of effects to the per-turn scalars the turn engine applies. */
export function aggregateTechEffects(effects: readonly TechEffect[]): AggregatedTechEffects {
  return finishTechLayers(null, reduceTechLayer(effects));
}

/**
 * Reduce an era baseline layer and a researched layer to the engine scalars.
 * Each layer is clamped to the caps on its own, so the baseline never uses up
 * the room research needs. Then:
 *  - plant output, method output, input efficiency: baseline + researched;
 *  - growth-cost and labor-cost multipliers: the two multipliers multiplied;
 *  - shields and expansion discount: a + b - a*b, never past 100%;
 *  - per-commodity input and output rates: the product of both layers.
 * An empty baseline equals aggregateTechEffects(researched) exactly; nothing
 * researched equals the baseline's own capped aggregate.
 */
export function aggregateTechEffectLayers(
  baseline: readonly TechEffect[],
  researched: readonly TechEffect[]
): AggregatedTechEffects {
  return finishTechLayers(reduceTechLayer(baseline), reduceTechLayer(researched));
}
