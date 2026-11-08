import type { GeneralSpec } from "./generals";
import { SPEC_SEED } from "./generalsTree";

/**
 * Fixed precedence for resolving ties. Deterministic by construction — a general's
 * specialisation must never depend on insertion order or chance.
 */
export const SPEC_ORDER: GeneralSpec[] = ["armor", "offense", "defense", "logi", "naval"];

/**
 * Display metadata for each specialisation — the class label and its accent colour.
 * Carried over from the retired GENSPEC so the profile can style a *derived* spec.
 */
export const SPEC_META: Record<GeneralSpec, { label: string; accent: string }> = {
  armor: { label: "Armor Officer", accent: "#7ba3ec" },
  offense: { label: "Shock & Maneuver", accent: "#ef8a8a" },
  defense: { label: "Defensive Tactician", accent: "#57c98a" },
  logi: { label: "Logistician", accent: "#e0b352" },
  naval: { label: "Fleet Commander", accent: "#4fd1c5" },
};

/**
 * A general's best-fit specialisation, derived from trained tree nodes.
 *
 * Not chosen: it drifts as they train. `fit` is the share of the spec's seed
 * they have trained, read by the profile as "Doctrine Fit".
 *
 * Pure and recomputed on read, never stored (a cache would go stale).
 * A general with no training returns `fit: 0`; callers render that as
 * unassigned, not as a real discipline.
 */
/**
 * Shown instead of a discipline for a general who has not trained into one.
 *
 * NOT "Unassigned" — that sat next to a "Serving" badge on the corps roster and read as
 * a posting, so a player asked what it meant while the general in question was posted
 * to a theater. This label is about the doctrine tree and nothing else.
 */
export const UNASSIGNED_SPEC_LABEL = "No specialisation";

/**
 * The display label for a general's derived specialisation.
 *
 * A general who matches no spec's seed has not specialised, so they are shown as
 * unassigned rather than being credited with the first discipline in `SPEC_ORDER` —
 * every newly commissioned general starts in exactly that state.
 */
export function specLabelOf(d: { spec: GeneralSpec; fit: number }): string {
  return d.fit > 0 ? SPEC_META[d.spec].label : UNASSIGNED_SPEC_LABEL;
}

export function deriveSpec(learned: string[]): { spec: GeneralSpec; fit: number } {
  const have = new Set(learned);
  let best: GeneralSpec = SPEC_ORDER[0];
  let bestFit = 0;

  for (const spec of SPEC_ORDER) {
    const seed = SPEC_SEED[spec] ?? [];
    if (seed.length === 0) continue;
    const matched = seed.filter((id) => have.has(id)).length;
    const fit = matched / seed.length;
    // Strictly greater, so an earlier spec in SPEC_ORDER wins a tie.
    if (fit > bestFit) {
      bestFit = fit;
      best = spec;
    }
  }
  return { spec: best, fit: bestFit };
}
