/**
 * Law families added after the 1991 launch. Worlds seeded before a family
 * existed have opening boards without its reference; readers fill it from
 * here so the family is proposable without rewriting stored boards.
 *
 * Kept free of the fitted 1991 crosswalk: a post-launch family has no 1991
 * statute and no booked cost, so its reference is fixed text.
 */
import type { ResetCountry } from "../fundingOwner";
import type { OpeningLawReference } from "../openingLaw";

const POST_LAUNCH_TEXT: Readonly<Record<string, { currentLaw: string; legalNote: string }>> = {
  L52: {
    currentLaw: "No dedicated labour migration law",
    legalNote:
      "Work visas are issued under the general immigration rules; no separate labour migration law.",
  },
};

export const POST_LAUNCH_FAMILY_IDS: ReadonlySet<string> = new Set(Object.keys(POST_LAUNCH_TEXT));

/** A stored board's references plus any post-launch family it predates. */
export function withPostLaunchReferences(board: {
  countryId: ResetCountry;
  scope: "national" | "regional";
  references: Record<string, OpeningLawReference>;
}): Record<string, OpeningLawReference> {
  let references = board.references;
  for (const [familyId, text] of Object.entries(POST_LAUNCH_TEXT)) {
    if (references[familyId]) continue;
    if (references === board.references) references = { ...board.references };
    const key = `${board.countryId}:${board.scope}:${familyId}`;
    references[familyId] =
      board.scope === "national"
        ? {
            key,
            country: board.countryId,
            scope: "national",
            familyId,
            status: "no-dedicated-law",
            ...text,
            sourceComponents: [],
          }
        : {
            key,
            country: board.countryId,
            scope: "regional",
            familyId,
            status: "not-offered",
            currentLaw: "Not a proposed law at this level",
            legalNote: "This is a national power.",
            sourceComponents: [],
          };
  }
  return references;
}
