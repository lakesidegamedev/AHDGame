/** Descriptive 1991 current-law references, never enactment authority. */
import references from "./openingLawReferences.json";
import type { ResetCountry } from "./fundingOwner";
import { fitReviewedOpeningClaims1991 } from "@/lib/resetFinance/rules/openingSourceClaims1991";
import { buildIeOpeningLawReferences1991 } from "@/lib/countries/ie/resetLegislation/openingIeReferences1991";
import { RESET_V2_OPENING_COUNTRIES } from "@/lib/resetVersions/rules";

export interface OpeningLawReference {
  key: string;
  country: ResetCountry;
  scope: "national" | "regional";
  familyId: string;
  status: string;
  currentLaw: string;
  legalNote: string;
  sourceComponents: readonly {
    sourceId: string;
    selectedOption: string;
    optionIndex: number;
    historicalDisposition: string;
    fiscalOwner: string;
    fiscalRole: string;
    annualBooked: number;
    treatment: string;
    replacementRestriction?: "protected-transfer";
  }[];
}

const reviewedReferences = [
  ...(references as OpeningLawReference[]),
  ...buildIeOpeningLawReferences1991(),
];

const sourceAllocations = Object.fromEntries(
  RESET_V2_OPENING_COUNTRIES.map((country) => [
    country,
    fitReviewedOpeningClaims1991(country, reviewedReferences).sourceAllocations,
  ])
) as Record<(typeof RESET_V2_OPENING_COUNTRIES)[number], Record<string, number>>;

// Keep the original reviewed cost weights in the JSON crosswalk. Every
// consumer uses this same funded national amount, including later enactment
// and legal-lineage copies. Regional service pools retain their own books.
export const openingLawReferences: readonly OpeningLawReference[] = reviewedReferences.map(
  (reference) => {
    if (reference.scope !== "national") return reference;
    return {
      ...reference,
      sourceComponents: reference.sourceComponents.map((component) => {
        if (component.annualBooked === 0) return { ...component };
        const allocations = sourceAllocations[reference.country as keyof typeof sourceAllocations];
        const annualBooked = allocations?.[component.sourceId];
        if (annualBooked === undefined && component.annualBooked > 0) {
          throw new Error(
            `Unowned 1991 opening fiscal source ${reference.key}:${component.sourceId}`
          );
        }
        return { ...component, annualBooked: annualBooked ?? component.annualBooked };
      }),
    };
  }
);

export function openingLawReference(
  country: ResetCountry,
  scope: "national" | "regional",
  familyId: string
): OpeningLawReference | undefined {
  if (/^T01_capital_(low|middle|high)$/.test(familyId))
    return {
      key: country + ":" + scope + ":" + familyId,
      country,
      scope,
      familyId,
      status: "game-mechanic",
      currentLaw: "Tiered Capital Gains Tax on long-term direct share income",
      legalNote:
        "Initialized from the income-tax tier in this world. Actual player receipts are collected separately from historical macro tax projections.",
      sourceComponents: [],
    };
  if (/^T01_(low|middle|high)$/.test(familyId)) familyId = "T01";
  return openingLawReferences.find(
    (reference) =>
      reference.country === country && reference.scope === scope && reference.familyId === familyId
  );
}

/**
 * Law families added after the 1991 launch. Worlds seeded before a family
 * existed have opening boards without its reference; readers fill it from
 * this crosswalk so the family is proposable without rewriting live boards.
 */
export const POST_LAUNCH_FAMILY_IDS: ReadonlySet<string> = new Set(["L52"]);

/** A stored board's references plus any post-launch family it predates. */
export function withPostLaunchReferences(board: {
  countryId: ResetCountry;
  scope: "national" | "regional";
  references: Record<string, OpeningLawReference>;
}): Record<string, OpeningLawReference> {
  let references = board.references;
  for (const familyId of POST_LAUNCH_FAMILY_IDS) {
    if (references[familyId]) continue;
    const reference = openingLawReference(board.countryId, board.scope, familyId);
    if (!reference) continue;
    if (references === board.references) references = { ...board.references };
    references[familyId] = { ...reference, key: `${board.countryId}:${board.scope}:${familyId}` };
  }
  return references;
}
