/**
 * Canada's opening law board separates national and regional baseline slots.
 * canadianModeledReferences creates country-owned modeled references with empty
 * source components and explicit labels for unmapped Canadian seed laws.
 */
import type { OpeningLawReference } from "@/lib/resetLegislation/openingLaw";
import { resetLawFamilies } from "@/lib/resetLegislation/catalog";

export function canadianModeledReferences(): OpeningLawReference[] {
  const familyIds = [
    ...resetLawFamilies.map((f) => f.id),
    "T01",
    "T02",
    "T03",
    "T04",
    "T05",
    "T06",
    "T07",
    "T08",
    "T09",
  ];
  return (["national", "regional"] as const).flatMap((scope) =>
    familyIds.map((familyId) => ({
      key: `CA:${scope}:${familyId}`,
      country: "CA",
      scope,
      familyId,
      status: "modeled-unmapped",
      currentLaw: `2027-default: no mapped Canadian seed law for ${familyId}`,
      legalNote:
        "Modeled Canadian game-seed baseline, not a sourced statutory crosswalk. Unmapped spending remains continuity; federal and provincial funding retain separate owners.",
      sourceComponents: [],
    }))
  );
}
