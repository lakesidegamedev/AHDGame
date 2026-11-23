/** One-line method note shown beside primary percentages that are not vote counts. */
export const PRIMARY_ESTIMATE_NOTE =
  "Estimates, not votes. Each candidate is scored on party and state fit, favorability and influence, and the scores are turned into shares within their own party's primary. A non-player candidate counts at half strength when a player is in the same primary.";

/** Row-level explanation for a non-player candidate whose score is halved. */
export const NPP_HALF_STRENGTH_NOTE =
  "Non-player candidate: half strength against a player in this primary.";

/** Whether a non-player candidate's score is halved in this primary. */
export function nppCandidateIsHalved(
  candidate: { isNPP?: boolean },
  candidates: readonly { isNPP?: boolean }[]
): boolean {
  return candidate.isNPP === true && candidates.some((other) => !other.isNPP);
}
