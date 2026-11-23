/** Whether the sitting officeholder is on the ballot for their own seat, and if not, why. */

export interface IncumbentCandidacyInput {
  incumbentId: string | null;
  /** Ids a candidacy row can carry for its person: character id and NPP id. */
  candidateIds: ReadonlyArray<{ characterId?: string | null; nppId?: string | null }>;
  termLimited: boolean;
  /** Filing for the race is still open, so a non-filer might yet enter. */
  filingOpen: boolean;
}

export interface IncumbentCandidacy {
  running: boolean;
  /** Plain-language reason when not running; null while running or unknown. */
  reason: string | null;
}

export function incumbentCandidacy(input: IncumbentCandidacyInput): IncumbentCandidacy {
  if (!input.incumbentId) return { running: false, reason: null };
  const id = input.incumbentId;
  const onBallot = input.candidateIds.some((c) => c.characterId === id || c.nppId === id);
  if (onBallot) return { running: true, reason: null };
  if (input.termLimited) return { running: false, reason: "Term limited" };
  return {
    running: false,
    reason: input.filingOpen ? "Has not filed yet" : "Did not file",
  };
}
