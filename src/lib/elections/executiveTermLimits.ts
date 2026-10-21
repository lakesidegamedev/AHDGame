import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import type { CareerEvent, Character } from "@/lib/db/types";

export type CharacterExecutiveTermSnapshot = Pick<
  Character,
  "careerHistory" | "executiveTermsServed"
>;

/** Elected or succession executive terms; acting presidencies are not terms. */
export function getExecutiveTermEvents(
  character: CharacterExecutiveTermSnapshot,
  countryId: CountryId
): CareerEvent[] {
  const officeKey = getCountryConfig(countryId).executiveTermLimit?.officeKey;
  if (!officeKey) return [];
  return (
    character.careerHistory?.filter(
      (event) =>
        event.office?.type === officeKey &&
        (event.type === "appointed" || event.type === "elected") &&
        !event.officeLabel?.startsWith("Acting ") &&
        (event.partyCountryId === countryId || event.partyCountryId == null)
    ) ?? []
  );
}

/** Every term seated, founding included: the meaning of the stored counter. */
function getRawExecutiveTermsServed(
  character: CharacterExecutiveTermSnapshot,
  countryId: CountryId
): number {
  const storedTerms = character.executiveTermsServed?.[countryId] ?? 0;
  return Math.max(storedTerms, getExecutiveTermEvents(character, countryId).length);
}

/** Terms counted toward the limit: every seated term except founding ones. */
export function getExecutiveTermsServed(
  character: CharacterExecutiveTermSnapshot,
  countryId: CountryId,
  foundingElectionIds?: ReadonlySet<string>
): number {
  // The stored counter also counted the founding seating, so subtract it from both.
  const foundingTerms = foundingElectionIds?.size
    ? getExecutiveTermEvents(character, countryId).filter(
        (event) => event.electionId && foundingElectionIds.has(event.electionId)
      ).length
    : 0;
  return Math.max(0, getRawExecutiveTermsServed(character, countryId) - foundingTerms);
}

export function getExecutiveTermLimit(countryId: CountryId): number | null {
  return getCountryConfig(countryId).executiveTermLimit?.maxTermsPerCharacter ?? null;
}

export function hasReachedExecutiveTermLimit(
  character: CharacterExecutiveTermSnapshot,
  countryId: CountryId,
  foundingElectionIds?: ReadonlySet<string>
): boolean {
  const maxTerms = getExecutiveTermLimit(countryId);
  return (
    maxTerms !== null &&
    getExecutiveTermsServed(character, countryId, foundingElectionIds) >= maxTerms
  );
}

export function incrementExecutiveTermsServedUpdate(
  character: CharacterExecutiveTermSnapshot,
  countryId: CountryId
): Record<string, number> {
  return {
    [`executiveTermsServed.${countryId}`]: getRawExecutiveTermsServed(character, countryId) + 1,
  };
}
