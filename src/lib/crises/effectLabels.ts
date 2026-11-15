import type { CrisisEffect } from "@/lib/db/types/crisis";
import { getMetricShortName } from "@/lib/constants/metricDefinitions";

/**
 * Round a crisis effect magnitude for display: at most two decimals, no
 * trailing zeros. Effect values are floats with binary-rounding tails (e.g.
 * 0.44999999999999996), so every surface that prints one needs this. The
 * sign is the caller's to add, since some surfaces colour it instead.
 */
export function formatCrisisEffectValue(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function camelToTitle(s: string): string {
  return s
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function slugToTitle(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Resolve a crisis effect to the canonical game stat it moves.
 *
 * The effect's `label` is freeform flavor prose, not a real stat. The mechanical
 * target is the already alias-resolved `(targetType, metricCategory, metricField)`
 * tuple; this maps it to the player-facing stat name so effect chips link to a
 * recognizable stat. Several template concepts alias onto one metric (e.g.
 * investor/consumer confidence -> Small Business Formation; segmented approval
 * labels all collapse onto `approvalRating`). Keep the prose as a tooltip.
 */
export function formatCrisisEffectTarget(effect: CrisisEffect): string {
  switch (effect.targetType) {
    case "approval":
      return "Government Approval";
    case "inflation":
      return "Inflation Rate";
    case "gdpLoss":
      return "Regional GDP";
    case "profitMargin": {
      const parts: string[] = [];
      if (effect.sectorType) parts.push(slugToTitle(effect.sectorType));
      if (effect.strategyId) parts.push(slugToTitle(effect.strategyId));
      return parts.length ? `${parts.join(" → ")} Profit Margin` : "All Sectors Profit Margin";
    }
    case "metric":
      if (effect.metricField) {
        return getMetricShortName(effect.metricField) ?? camelToTitle(effect.metricField);
      }
      return "Metric";
    case "stat":
      if (effect.statKey) {
        return effect.statKey.charAt(0).toUpperCase() + effect.statKey.slice(1);
      }
      return "Character Stat";
    default:
      return "Effect";
  }
}
