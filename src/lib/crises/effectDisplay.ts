import type { CrisisEffect } from "@/lib/db/types/crisis";
import { METRIC_DEFS_BY_CATEGORY } from "@/lib/constants/metricDefinitions";
import type { MetricDefinition } from "@/lib/constants/metricDefinitionsTables";
import type { MetricCategoryId } from "@/lib/db/types";
import { formatCrisisEffectTarget, formatCrisisEffectValue } from "@/lib/crises/effectLabels";

export type EffectTone = "bad" | "good" | "neutral";

export interface CrisisEffectDisplay {
  /** The stat that actually moves, e.g. "Property values". */
  target: string;
  /** Signed amount with its real unit, e.g. "-1.2%" or "-0.75 pp". */
  amount: string;
  /** When it lands: once, or every turn while the crisis runs. */
  cadence: string;
  /** Whether the move hurts or helps the people it lands on. */
  tone: EffectTone;
  /** The template's own prose for the effect, kept as secondary context. */
  detail: string;
  /** One line for tooltips and screen readers. */
  text: string;
}

export interface EffectDisplayContext {
  /** Regional GDP in the viewer's currency, to turn a GDP share into money. */
  gdpAmount?: number;
  formatCurrency?: (amount: number) => string;
}

/**
 * Index metrics whose baseline is 100, so one point is one percent of the
 * regional baseline. Every other index reads as plain index points.
 */
const BASELINE_PERCENT_INDEXES = new Set(["propertyValueIndex", "commercialValueIndex"]);

/** Property and commercial value read better as the thing that is worth less. */
const TARGET_OVERRIDES: Record<string, string> = {
  propertyValueIndex: "Property values",
  commercialValueIndex: "Commercial property values",
};

function signed(value: number): string {
  const text = formatCrisisEffectValue(value);
  return value > 0 ? `+${text}` : text;
}

function metricDefinition(effect: CrisisEffect): MetricDefinition | undefined {
  if (!effect.metricCategory || !effect.metricField) return undefined;
  return METRIC_DEFS_BY_CATEGORY[effect.metricCategory as MetricCategoryId]?.[effect.metricField];
}

/** Unit text for a delta on this metric, as the engine applies it (`$inc` in native units). */
function metricUnit(effect: CrisisEffect, definition: MetricDefinition | undefined): string {
  if (effect.metricField && BASELINE_PERCENT_INDEXES.has(effect.metricField)) return "%";
  switch (definition?.unit) {
    case "percent":
      return " pp";
    case "index":
    case "score":
      return " pts";
    case "years":
      return " yrs";
    case "currency":
      return "";
    case "rate":
      return definition.formatSuffix ? definition.formatSuffix.replace(/^\s*/, " ") : " pts";
    default:
      return " pts";
  }
}

function cadenceFor(effect: CrisisEffect): string {
  if (effect.targetType === "gdpLoss") return "once";
  if (effect.effectType === "tick") return "per turn, fading";
  if (effect.effectType === "decay") return "fading";
  return "once";
}

function toneFor(effect: CrisisEffect, definition: MetricDefinition | undefined): EffectTone {
  if (effect.value === 0) return "neutral";
  const up = effect.value > 0;
  switch (effect.targetType) {
    case "gdpLoss":
    case "stat":
      return "bad";
    case "inflation":
      return up ? "bad" : "neutral";
    case "metric": {
      const higherIsBetter = definition?.isHigherBetter;
      if (higherIsBetter === undefined) return "neutral";
      return up === higherIsBetter ? "good" : "bad";
    }
    default:
      return up ? "good" : "bad";
  }
}

function amountFor(
  effect: CrisisEffect,
  definition: MetricDefinition | undefined,
  context: EffectDisplayContext
): string {
  switch (effect.targetType) {
    case "gdpLoss": {
      const percent = `-${formatCrisisEffectValue(Math.abs(effect.value) * 100)}% of GDP`;
      if (context.gdpAmount && context.formatCurrency) {
        const loss = Math.abs(effect.value) * context.gdpAmount;
        return `${percent} (${context.formatCurrency(loss)})`;
      }
      return percent;
    }
    case "approval":
      return `${signed(effect.value)} pts`;
    case "inflation":
      return `${signed(effect.value)} pp`;
    case "profitMargin":
      // A physical halt cuts output by the same number, read as a share.
      return effect.physicality === "physical"
        ? `-${formatCrisisEffectValue(Math.abs(effect.value))}% output`
        : `${signed(effect.value)} pp`;
    case "stat":
      // The engine subtracts the magnitude whatever the sign, so it is always a loss.
      return `-${formatCrisisEffectValue(Math.abs(effect.value))} pts`;
    case "metric":
      return `${signed(effect.value)}${metricUnit(effect, definition)}`;
    default:
      return signed(effect.value);
  }
}

function targetFor(effect: CrisisEffect): string {
  if (effect.targetType === "metric" && effect.metricField) {
    const override = TARGET_OVERRIDES[effect.metricField];
    if (override) return override;
  }
  if (effect.targetType === "profitMargin" && effect.physicality === "physical") {
    const sector = formatCrisisEffectTarget(effect).replace(/ Profit Margin$/, "");
    return `${sector} production`;
  }
  return formatCrisisEffectTarget(effect);
}

/**
 * What one crisis effect really does: the stat it moves, the amount in that
 * stat's own unit, and when it lands. The template's flavour prose is kept
 * as `detail`, never as the label.
 */
export function describeCrisisEffect(
  effect: CrisisEffect,
  context: EffectDisplayContext = {}
): CrisisEffectDisplay {
  const definition = metricDefinition(effect);
  const target = targetFor(effect);
  const amount = amountFor(effect, definition, context);
  const cadence = cadenceFor(effect);
  return {
    target,
    amount,
    cadence,
    tone: toneFor(effect, definition),
    detail: effect.label,
    text: `${target} ${amount}, ${cadence}`,
  };
}

export const EFFECT_TONE_CLASS: Record<EffectTone, string> = {
  bad: "border-error/30 bg-error/5 text-error",
  good: "border-success/30 bg-success/5 text-success",
  neutral: "border-card-border bg-card-elevated text-muted",
};
