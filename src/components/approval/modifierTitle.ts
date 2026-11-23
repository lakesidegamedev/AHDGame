import type { ActiveModifier } from "@/lib/utils/approvalModifiers";
import { marginEffectForModifier } from "@/lib/states/conditions/marginEffects";

/**
 * Chip presentation for one approval modifier.
 *
 * Kept out of the component so both halves can be pinned by tests: the tone
 * decides a colour and an icon, and the title is player-facing copy. Neither
 * needs a DOM to be wrong.
 */

export type ModifierTone = "positive" | "neutral" | "negative";

const ADDRESS_TITLE = "Temporary boost from an active State of the State address (approval only)";
const METRIC_TITLE =
  "Derived from regional metric thresholds; affects approval and sector profit margins. Lasts while the metric stays past its threshold.";

/**
 * One explanation per war term.
 *
 * The war block is three chips rather than one, so each needs to say what it
 * measures. A single line reading "War" told a player nothing about whether the
 * number in front of them was the front going badly or a public simply tired of
 * a war it is winning, which are opposite problems with opposite answers.
 */
const WAR_TITLES: Record<string, string> = {
  war_effort:
    "How the war is going on the ground, measured against what your side was expected to achieve from where it started. A defender holding the line scores positive; a stalled invasion scores negative. Affects approval only.",
  war_exhaustion:
    "How long the public has carried the war. Opens as a rally behind the government, becomes a cost after about a year of fighting, and heals back toward zero at the same pace once the fighting stops. Carries over into your next war. Affects approval only.",
  alliance_contribution:
    "What you are fielding in this theatre against what your co-belligerents are fielding. Only applies to a country pulled into the war by treaty. Affects approval only.",
  naval_losses:
    "What the naval war is costing you at home. A navy is the most visible thing a country owns, so ships that stop coming back are a public event. A cost only, never a bonus, and nothing at all for a country with no fleet. Affects approval only.",
};

const WAR_FALLBACK_TITLE =
  "How the war is going, and how long the public has carried it. Affects approval only.";

/**
 * Zero is its own tone, not a shade of negative. Only war chips can reach zero
 * and still render; a war term that is currently a wash costs the government
 * nothing.
 */
export function toneFor(effect: number): ModifierTone {
  if (effect > 0) return "positive";
  if (effect < 0) return "negative";
  return "neutral";
}

/** What each fiscal chip measures; the austerity text must never describe a bonus. */
const FISCAL_TITLES: Record<string, string> = {
  fiscal_consolidation:
    "Approval cost of the austerity budget the government enacted to close its deficit, larger for a bigger package. Fades evenly to nothing over one game year.",
  nationalDebt:
    "Public debt at or above 115% of GDP costs 1 approval point. Lasts while debt stays at that level.",
  nationalDeficit:
    "A budget deficit of 2% of GDP costs 1 approval point, and 5% or more costs 3. Lasts while the deficit does.",
  nationalBalancedBudget:
    "A budget in balance or surplus (at least 0.5% of GDP) earns 1 approval point. Lasts while the budget stays there.",
  nationalFiscalDiscipline:
    "A surplus of at least 1% of GDP with debt at or under 90% of GDP earns 1 approval point. Lasts while both hold.",
  regionalDebt:
    "This region's own debt: 0.1 approval points for each percentage point of its GDP, up to a cost of 25. Only this region is affected, not the national rating. Lasts while the debt does.",
  regionalDeficit:
    "This region's own budget deficit: 1 approval point for each percentage point of its GDP, up to a cost of 10. Only this region is affected. Lasts while the deficit does.",
};

const ID_TITLES: Record<string, string> = {
  national_performance:
    "How national outcome metrics have moved from their opening values, applied to the whole country.",
  national_performance_smoothing:
    "Approval moves toward its target a little each turn, so part of the gap between the target and the shown rating has not been applied yet.",
  approval_smoothing:
    "Approval moves toward its target by at most 2 points a turn, so this is the part of the target that has not been applied yet. It shrinks each turn until the rating catches up.",
  approval_positive_cap:
    "Positive effects stack only up to +8 in total. This line removes the excess.",
  approval_bounds: "Approval cannot go below 0 or above 100. This line is the amount cut off.",
  approval_events:
    "Combined approval change from events, crises and government decisions. It stays until the decision is reversed or expires.",
  cabinet_none:
    "Penalty for cabinet seats left empty. The whole cabinet empty costs 7.5; the cost is shared across the seats.",
  cabinet_acting: "Each acting (unconfirmed) secretary costs 0.5 approval until confirmed.",
  public_expectations:
    "A new head of government starts with no expectations to meet; they build up to a full cost of 5 over the length of their term.",
  cabinet_service_response:
    "Approval gained from cabinet services delivering results in the field.",
};

/** The chip's hover text: what this modifier measures. */
export function buildModifierTitle(modifier: ActiveModifier): string {
  if (FISCAL_TITLES[modifier.id]) return FISCAL_TITLES[modifier.id];
  if (ID_TITLES[modifier.id]) return ID_TITLES[modifier.id];
  if (modifier.id.startsWith("org_statement:"))
    return "Approval from an international organization's joint statement about this country. Lasts for a fixed period, then lapses.";
  if (modifier.id === "regional_adjustment")
    return "Reconciles effect limits, stored approval smoothing and rounding. Affects approval only.";
  if (modifier.source === "address") return ADDRESS_TITLE;
  if (modifier.source === "banking")
    return "Taxpayer-funded bank failure backstop relative to GDP. Approval cost fades over one game year; confidence is measured separately.";
  if (modifier.source === "market")
    return "Approval cost of a market adjustment: plants losing money across the economy and unemployment above its level when the adjustment began. Measured, never a reward for a response; fades over one game year after it ends.";
  if (modifier.source === "fiscal") return FISCAL_TITLES.fiscal_consolidation;
  if (modifier.source === "war") return WAR_TITLES[modifier.id] ?? WAR_FALLBACK_TITLE;
  return METRIC_TITLE;
}

const BOOKKEEPING_IDS = new Set([
  "approval_smoothing",
  "approval_positive_cap",
  "approval_bounds",
  "national_positive_cap",
  "national_performance_smoothing",
  "regional_adjustment",
]);

/** Lines that reconcile the stack rather than name a cause. */
export function isBookkeepingLine(id: string): boolean {
  return BOOKKEEPING_IDS.has(id);
}

/** Margin swing shown beside a chip: 0 when the effect is approval only, null for bookkeeping. */
export function chipMargin(modifier: ActiveModifier): number | null {
  if (isBookkeepingLine(modifier.id)) return null;
  if (modifier.source === "address") return 0;
  return modifier.marginEffect ?? marginEffectForModifier(modifier.effect, modifier.id);
}

/** Every line the chip's detail view shows, in order. */
export function buildModifierExplanation(modifier: ActiveModifier): string[] {
  const lines: string[] = [];
  const effect = Math.round(modifier.effect * 10) / 10;
  lines.push(
    `${effect > 0 ? "+" : ""}${effect} approval: points added to or taken off the approval rating.`
  );
  const margin = chipMargin(modifier);
  if (margin !== null) {
    lines.push(
      margin === 0
        ? "0pp: no effect on sector profit margins (approval only)."
        : `${margin > 0 ? "+" : ""}${margin}pp: profit margin change for businesses in the region, in percentage points (all conditions together are capped at 3).`
    );
  }
  lines.push(buildModifierTitle(modifier));
  if (modifier.detail) lines.push(`Source: ${modifier.detail}`);
  if (modifier.sinceTurn != null) lines.push(`Started turn ${modifier.sinceTurn}.`);
  if (modifier.expiresTurn != null) lines.push(`Ends turn ${modifier.expiresTurn}.`);
  return lines;
}
