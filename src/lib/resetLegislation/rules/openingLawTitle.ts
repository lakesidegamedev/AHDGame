import type { OpeningLawReference } from "../openingLaw";

/** Name and enacted level of one law that makes up an opening law family. */
export type LawLevelLookup = (
  sourceId: string,
  optionIndex: number
) => { lawName: string; levelName: string } | null;

/**
 * Plain title for a modeled opening law: the laws actually in force at the
 * start, each with the level the Policy page shows. Laws seeded at their
 * no-statute level are left out, so the row never names an unenacted law.
 */
export function openingLawTitle(reference: OpeningLawReference, lookup: LawLevelLookup): string {
  if (reference.status !== "modeled-game-seed" || !reference.sourceComponents.length)
    return reference.currentLaw;
  const inForce = reference.sourceComponents
    .filter((component) => component.optionIndex > 0)
    .map((component) => {
      const law = lookup(component.sourceId, component.optionIndex);
      return law ? `${law.lawName} (${law.levelName})` : component.selectedOption;
    });
  return inForce.length
    ? `In force since the start: ${inForce.join("; ")}`
    : "No law in force since the start";
}
