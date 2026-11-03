export interface FrozenExecutiveResult {
  countryId: string;
  electionType: string;
  candidates: { id: string; name: string; party: string; partyName: string }[];
  summary: { projectedWinner?: string | null };
}

/** Only the explicitly linked, finalized executive winner can identify this tenure. */
export function frozenExecutiveIdentity(
  countryId: string,
  officeType: string,
  snapshot: FrozenExecutiveResult | undefined
): { name: string; party: string; partyLabel: string } | undefined {
  if (!snapshot || snapshot.countryId !== countryId || snapshot.electionType !== officeType) {
    return undefined;
  }
  const winner = snapshot.candidates.find(
    (candidate) => candidate.id === snapshot.summary.projectedWinner
  );
  if (!winner) return undefined;
  return { name: winner.name, party: winner.party, partyLabel: winner.partyName };
}

/** A profile rename is not a new election or appointment. */
export function sameTenureHolder(
  previous: { name: string; profileHref?: string | null; startDate?: Date },
  current: { name: string; profileHref?: string | null; startDate?: Date }
): boolean {
  if (previous.profileHref && current.profileHref)
    return previous.profileHref === current.profileHref;
  // Legacy NPC events can lack a profile id, but retain the same handover time.
  if (
    previous.startDate &&
    current.startDate &&
    previous.startDate.getTime() === current.startDate.getTime()
  )
    return true;
  return previous.name === current.name;
}

export function unrecordedHistoricalParty(party: string | undefined): string | undefined {
  if (!party) return undefined;
  if (party === "independent") return "Independent";
  return /^\d+$/.test(party) ? `Party ${party} (historical name unrecorded)` : party;
}

/** Older events may lack this optional snapshot; never reconstruct it from live identities. */
export function recordedExecutiveIdentity(
  details: Record<string, unknown> | undefined
): { name: string; party?: string; partyLabel?: string } | undefined {
  const identity = details?.officeIdentitySnapshot;
  if (
    !identity ||
    typeof identity !== "object" ||
    !("name" in identity) ||
    typeof identity.name !== "string"
  )
    return undefined;
  return {
    name: identity.name,
    party: "party" in identity && typeof identity.party === "string" ? identity.party : undefined,
    partyLabel:
      "partyLabel" in identity && typeof identity.partyLabel === "string"
        ? identity.partyLabel
        : undefined,
  };
}
