import type { CommodityType } from "@/lib/constants/commodities";
import type { EffectContext, EffectIntent, EffectModule, EffectParams } from "./effectModule";
import { clamp, type CrisisStage } from "./types";

/**
 * Effect modules that aim a crisis at the systems around it. Each emits
 * intents sized by severity and stage; the shell routes them to the system
 * that owns the write.
 */

const STAGE_WEIGHT: Record<CrisisStage, number> = {
  signal: 0.15,
  onset: 0.6,
  peak: 1,
  aftermath: 0.4,
  resolved: 0,
};

/** 0..1 share of a module's full per-turn effect for this severity and stage. */
export function crisisPressure(ctx: Pick<EffectContext, "severity" | "stage">): number {
  return clamp(ctx.severity / 100, 0, 1) * STAGE_WEIGHT[ctx.stage];
}

function numberParam(params: EffectParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringParam(params: EffectParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const EPSILON = 1e-4;

/** Cuts what plants produce. `maxCut` is the share lost at full pressure. */
export const productionShockModule: EffectModule = {
  id: "rotdm.production",
  evaluate(ctx, params) {
    const factor = -numberParam(params, "maxCut", 0.2) * crisisPressure(ctx);
    if (Math.abs(factor) < EPSILON) return [];
    return [
      {
        kind: "plantCapacity",
        sectorType: stringParam(params, "sectorType"),
        factor,
        scope: params.scope === "capacity" ? "capacity" : "output",
      },
    ];
  },
};

/** Squeezes the supply of one commodity and shifts demand for it. */
export const commodityShockModule: EffectModule = {
  id: "rotdm.commodity",
  evaluate(ctx, params) {
    const commodity = stringParam(params, "commodity") as CommodityType | undefined;
    if (!commodity) return [];
    const pressure = crisisPressure(ctx);
    const intents: EffectIntent[] = [];
    const supply = -numberParam(params, "maxSupplyCut", 0) * pressure;
    if (Math.abs(supply) >= EPSILON)
      intents.push({ kind: "commoditySupply", commodity, factor: supply });
    const demand = numberParam(params, "maxDemandShift", 0) * pressure;
    if (Math.abs(demand) >= EPSILON)
      intents.push({ kind: "commodityDemand", commodity, factor: demand });
    return intents;
  },
};

/** Pushes people out of the affected regions. `maxFraction` is the share of the pull at full pressure. */
export const migrationPushModule: EffectModule = {
  id: "rotdm.migration",
  evaluate(ctx, params) {
    const fraction = numberParam(params, "maxFraction", 0.002) * crisisPressure(ctx);
    if (fraction < EPSILON / 10) return [];
    if (ctx.regionIds.length === 0) return [{ kind: "migration", fraction }];
    return ctx.regionIds.map((fromRegionId) => ({ kind: "migration", fraction, fromRegionId }));
  },
};

/** Panics banks. `max` is the panic length, in turns, at full pressure. */
export const bankStressModule: EffectModule = {
  id: "rotdm.bankStress",
  evaluate(ctx, params) {
    const delta = numberParam(params, "max", 3) * crisisPressure(ctx);
    return delta < 0.05 ? [] : [{ kind: "bankStress", delta, sustained: true }];
  },
};

/** Widens the government's borrowing premium. `maxBps` is the widening at full pressure. */
export const bondPressureModule: EffectModule = {
  id: "rotdm.bondPressure",
  evaluate(ctx, params) {
    const deltaBps = numberParam(params, "maxBps", 100) * crisisPressure(ctx);
    return deltaBps < 0.5 ? [] : [{ kind: "bondYield", deltaBps }];
  },
};

/** Drags approval of the government, optionally for one group. */
export const approvalDragModule: EffectModule = {
  id: "rotdm.approval",
  evaluate(ctx, params) {
    const delta = -numberParam(params, "max", 0.4) * crisisPressure(ctx);
    if (Math.abs(delta) < EPSILON) return [];
    return [{ kind: "approval", delta, group: stringParam(params, "group") }];
  },
};

/** Swings votes against the incumbent. */
export const electionSwingModule: EffectModule = {
  id: "rotdm.electionSwing",
  evaluate(ctx, params) {
    const deltaPoints = numberParam(params, "maxPoints", 0.3) * crisisPressure(ctx);
    return deltaPoints < EPSILON
      ? []
      : [{ kind: "electionSwing", deltaPoints, incumbentOnly: true }];
  },
};

export const ROTDM_EFFECT_MODULES: readonly EffectModule[] = [
  productionShockModule,
  commodityShockModule,
  migrationPushModule,
  bankStressModule,
  bondPressureModule,
  approvalDragModule,
  electionSwingModule,
];
