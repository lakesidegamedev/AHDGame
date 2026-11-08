import type { CommodityType } from "@/lib/constants/commodities";
import type { CrisisEffect } from "@/lib/db/types/crisis";
import { clamp, type CrisisInstance, type CrisisStage, type EffectModuleRef } from "./types";

/**
 * Effect modules turn (instance, severity, stage) into intents aimed at real
 * systems. A module never writes anything: the shell collects the intents and
 * routes each to the owning system's own write path.
 *
 * Targets default to the crisis's own countries and regions (see
 * `EffectContext`); an intent names its own only when it reaches somewhere else.
 */
export type EffectIntent =
  /** Multiplies plant output or capacity; `factor` -0.1 is a 10% cut. */
  | { kind: "plantCapacity"; sectorType?: string; factor: number; scope: "output" | "capacity" }
  | { kind: "commoditySupply"; commodity: CommodityType; factor: number }
  | { kind: "commodityDemand"; commodity: CommodityType; factor: number }
  /** Share of population moving; `toRegionId` absent = out of the affected area. */
  | { kind: "migration"; fraction: number; fromRegionId?: string; toRegionId?: string }
  | { kind: "bankStress"; delta: number }
  | { kind: "bondYield"; deltaBps: number }
  /** Points of approval, narrowed to a demographic group when named. */
  | { kind: "approval"; delta: number; group?: string; officeRole?: string }
  /** Points of vote share swing against the incumbent. */
  | { kind: "electionSwing"; deltaPoints: number; incumbentOnly?: boolean }
  /** Pass-through of a legacy flat/tick effect on a metric board field. */
  | { kind: "metric"; category: string; field: string; delta: number }
  | { kind: "profitMargin"; sectorType: string | null; points: number; physical: boolean }
  | { kind: "inflation"; delta: number }
  /** Fraction of regional GDP destroyed. */
  | { kind: "gdpLoss"; fraction: number }
  | { kind: "stat"; statKey: string; delta: number };

export interface EffectContext {
  instance: Pick<CrisisInstance, "startTurn" | "stage" | "stageStartTurn">;
  /** Severity after this turn's step, on 0..100. */
  severity: number;
  stage: CrisisStage;
  turn: number;
  countryIds: readonly string[];
  regionIds: readonly string[];
}

export type EffectParams = NonNullable<EffectModuleRef["params"]>;

export interface EffectModule {
  id: string;
  evaluate(ctx: EffectContext, params: EffectParams): EffectIntent[];
}

export type EffectModuleRegistry = ReadonlyMap<string, EffectModule>;

export function createEffectRegistry(mods: readonly EffectModule[]): EffectModuleRegistry {
  const registry = new Map<string, EffectModule>();
  for (const mod of mods) {
    if (registry.has(mod.id)) throw new Error(`duplicate effect module ${mod.id}`);
    registry.set(mod.id, mod);
  }
  return registry;
}

export interface EffectEvaluation {
  intents: EffectIntent[];
  /** Module ids a definition referenced that the registry does not hold. */
  missing: string[];
}

/** Runs every module a definition lists. A resolved crisis emits nothing. */
export function evaluateEffectModules(
  refs: readonly EffectModuleRef[],
  registry: EffectModuleRegistry,
  ctx: EffectContext
): EffectEvaluation {
  const intents: EffectIntent[] = [];
  const missing: string[] = [];
  if (ctx.stage === "resolved") return { intents, missing };
  for (const ref of refs) {
    const mod = registry.get(ref.moduleId);
    if (!mod) {
      missing.push(ref.moduleId);
      continue;
    }
    intents.push(...mod.evaluate(ctx, ref.params ?? {}));
  }
  return { intents, missing };
}

export interface LegacyEffectOptions {
  /** Crisis length the old engine ramped tick effects down over. Null = no ramp. */
  durationTurns: number | null;
  /**
   * `fixed` reproduces the old snapshot values exactly. `severity` scales each
   * value by severity / `referenceSeverity`, so an unchecked crisis bites harder
   * and a contained one barely at all.
   */
  scaling?: "fixed" | "severity";
  referenceSeverity?: number;
}

/** Same linear ramp the old engine used: 1 at onset, 0 at expiry. */
export function legacyTickRamp(turn: number, startTurn: number, duration: number | null): number {
  if (duration === null || duration <= 0) return 1;
  return clamp(1 - (turn - startTurn) / duration, 0, 1);
}

function effectToIntent(effect: CrisisEffect, value: number): EffectIntent | null {
  switch (effect.targetType) {
    case "metric":
      if (!effect.metricCategory || !effect.metricField) return null;
      return {
        kind: "metric",
        category: effect.metricCategory,
        field: effect.metricField,
        delta: value,
      };
    case "approval":
      return { kind: "approval", delta: value };
    case "profitMargin":
      return {
        kind: "profitMargin",
        sectorType: effect.sectorType,
        points: value,
        physical: effect.physicality === "physical",
      };
    case "inflation":
      return { kind: "inflation", delta: value };
    case "gdpLoss":
      return { kind: "gdpLoss", fraction: value };
    case "stat":
      return effect.statKey ? { kind: "stat", statKey: effect.statKey, delta: value } : null;
  }
}

/**
 * Expresses old-style flat/tick/decay effects as a module so existing template
 * content can run on v2 unchanged.
 *
 * - `flat`: once, on the crisis's start turn.
 * - `tick`: every turn, ramped down linearly over the crisis duration.
 * - `decay`: every turn, halving each turn after the start. The old engine
 *   skipped these; here they fade instead of being dropped.
 */
export function createLegacyEffectModule(
  id: string,
  effects: readonly CrisisEffect[],
  options: LegacyEffectOptions
): EffectModule {
  const scaling = options.scaling ?? "fixed";
  const reference = options.referenceSeverity ?? 100;
  return {
    id,
    evaluate(ctx) {
      const elapsed = ctx.turn - ctx.instance.startTurn;
      if (elapsed < 0) return [];
      const severityFactor = scaling === "severity" ? clamp(ctx.severity / reference, 0, 2) : 1;
      const intents: EffectIntent[] = [];
      for (const effect of effects) {
        let factor: number;
        if (effect.effectType === "flat") {
          if (elapsed !== 0) continue;
          factor = 1;
        } else if (effect.effectType === "tick") {
          factor = legacyTickRamp(ctx.turn, ctx.instance.startTurn, options.durationTurns);
        } else {
          factor = 0.5 ** elapsed;
        }
        const value = effect.value * factor * severityFactor;
        if (value === 0) continue;
        const intent = effectToIntent(effect, value);
        if (intent) intents.push(intent);
      }
      return intents;
    },
  };
}
