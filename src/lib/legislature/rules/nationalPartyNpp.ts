/**
 * National chairs direct one party NPP bill across the entire legislature.
 * pickNationalPartySponsor selects from eligible seated sponsors using an injected rng.
 */
export function pickNationalPartySponsor<T>(candidates: readonly T[], rng: () => number): T | null {
  if (!candidates.length) return null;
  return candidates[
    Math.max(0, Math.min(candidates.length - 1, Math.floor(rng() * candidates.length)))
  ];
}
export const NATIONAL_NPP_IN_FLIGHT = [
  "proposed",
  "active",
  "passed_origin",
  "active_other",
  "active_both",
  "enrolled",
  "vetoed",
  "veto_override",
  "cabinet_review",
  "override_shugiin",
  "filibustered",
] as const;

export function canDirectNationalPartyNpp(input: {
  characterId: string;
  characterPartyId: string | null;
  partyId: string;
  sameCountry: boolean;
  nationalChairId: string | null;
}): boolean {
  return (
    input.sameCountry &&
    input.characterPartyId === input.partyId &&
    input.characterId === input.nationalChairId
  );
}
