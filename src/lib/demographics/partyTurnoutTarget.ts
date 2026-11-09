import { bucketLabel } from "./bucketLabels";
import type { PartyTurnoutTarget, TurnoutTargetSection } from "./turnoutTargets";

export interface PartyTurnoutTargetCategory {
  id: string;
  label: string;
}

/**
 * Player-facing party target catalog: the country's census buckets, in the
 * same order as the region Demographics tabs.
 */
export function buildPartyTurnoutTargetCatalog(sections: TurnoutTargetSection[]): {
  categories: PartyTurnoutTargetCategory[];
  targets: PartyTurnoutTarget[];
} {
  // Keep this flattening client-local. Importing the server resolver here would
  // drag every international Layer-1 model into the party page's browser graph.
  const targets = sections.flatMap((section) =>
    section.options.map((option) => ({
      category: section.dim,
      group: option.id.startsWith(`${section.dim}:`)
        ? option.id.slice(section.dim.length + 1)
        : option.id,
      label: option.label,
      economicLean: option.economicLean,
      socialLean: option.socialLean,
    }))
  );
  const categories: PartyTurnoutTargetCategory[] = sections.map((section) => ({
    id: section.dim,
    label: section.dimLabel,
  }));
  return { categories, targets };
}

/** Display a saved party target by its census bucket label. */
export function partyTurnoutTargetLabel(
  countryId: string,
  category: string,
  group: string
): string {
  return bucketLabel(`${category}:${group}`, countryId);
}
