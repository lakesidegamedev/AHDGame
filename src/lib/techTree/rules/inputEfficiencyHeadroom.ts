import {
  CORP_LANE_EFFECT_SCALE,
  TECH_INPUT_EFFICIENCY_CAP,
  type TechEffect,
} from "@/lib/constants/techTree/effects";

/** The part of a node's input reduction that still lowers this corporation's inputs. */
export interface InputEfficiencyHeadroom {
  /** What the node adds before the cap, as a fraction. */
  contribution: number;
  /** Room left under the cap, as a fraction. */
  remaining: number;
  /** What the node would actually add after the cap, as a fraction. */
  applied: number;
  /** True when nothing the node does can change this corporation any more. */
  noRemainingBenefit: boolean;
}

/**
 * How much of a node's input reduction survives the aggregate cap, given what
 * research already provides. A node whose every effect is an input reduction
 * and whose room is zero has no remaining benefit.
 */
export function inputEfficiencyHeadroom(
  effects: readonly Pick<TechEffect, "kind" | "pct">[],
  lane: "generic" | "sector",
  researchedBonus: number
): InputEfficiencyHeadroom {
  const scale = lane === "generic" ? CORP_LANE_EFFECT_SCALE : 1;
  const contribution =
    effects
      .filter((effect) => effect.kind === "inputEfficiency")
      .reduce((sum, effect) => sum + effect.pct, 0) * scale;
  const remaining = Math.max(0, TECH_INPUT_EFFICIENCY_CAP - researchedBonus);
  const applied = Math.min(contribution, remaining);
  const onlyInputReduction = effects.every((effect) => effect.kind === "inputEfficiency");
  return {
    contribution,
    remaining,
    applied,
    noRemainingBenefit: contribution > 0 && onlyInputReduction && remaining <= 1e-9,
  };
}
