/** One-click attitudes for an NPP operator, each a bundle of per-action permissions. */
import type { CorpOperatorAction, CorpOperatorPermission } from "@/lib/db/types/corporation";

export type OperatorAttitude = "default" | "growth" | "cost_cutter" | "advise_only";

export interface OperatorPreset {
  id: OperatorAttitude;
  label: string;
  blurb: string;
  /** Actions the attitude sets; the rest keep the role default. Empty clears the policy. */
  actions: Partial<Record<CorpOperatorAction, CorpOperatorPermission>>;
}

export const OPERATOR_PRESETS: readonly OperatorPreset[] = [
  {
    id: "default",
    label: "Standard",
    blurb: "The usual behavior for this kind of operator.",
    actions: {},
  },
  {
    id: "growth",
    label: "Growth",
    blurb:
      "Keeps founding new plants and growing the ones that sell. Never sells or closes plants.",
    actions: { found: "allow", grow: "allow", divest: "never" },
  },
  {
    id: "cost_cutter",
    label: "Cost cutter",
    blurb: "No new plants and no growth. Keeps what you have running and pays out profit.",
    actions: { found: "never", grow: "never", divest: "never", dividends: "allow" },
  },
  {
    id: "advise_only",
    label: "Advise only",
    blurb: "Touches no budgets, dividends or plants. Reports what it would sell or research.",
    actions: {
      found: "never",
      grow: "never",
      budgets: "never",
      dividends: "never",
      divest: "ask",
      research: "ask",
    },
  },
];

/** The preset whose actions exactly match the stored ones, or null for a custom mix. */
export function matchOperatorPreset(
  actions: Partial<Record<CorpOperatorAction, CorpOperatorPermission>> | undefined
): OperatorAttitude | null {
  const stored = Object.entries(actions ?? {}).filter(([, v]) => v != null);
  for (const preset of OPERATOR_PRESETS) {
    const wanted = Object.entries(preset.actions);
    if (
      wanted.length === stored.length &&
      wanted.every(([k, v]) => actions?.[k as CorpOperatorAction] === v)
    ) {
      return preset.id;
    }
  }
  return null;
}
