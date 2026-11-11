/** Plan many-to-one roster changes before touching either unique index. */
export interface RemappedSlate {
  id: string;
  electionId: string;
  countryId: string;
  partyId: string;
}

export function groupRemappedSlates(slates: RemappedSlate[]): RemappedSlate[][] {
  const groups = new Map<string, RemappedSlate[]>();
  for (const slate of slates) {
    const key = JSON.stringify([slate.countryId, slate.partyId, slate.electionId]);
    const group = groups.get(key) ?? [];
    group.push(slate);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => group.sort((a, b) => a.id.localeCompare(b.id)));
}

/** A filed candidacy must never be downgraded to an invitation on a merge. */
export function groupSlateCandidates<T extends { id: string; candidateId: string; status: string }>(
  candidates: T[]
): T[][] {
  const rank: Record<string, number> = {
    filed: 6,
    accepted: 5,
    considering: 4,
    invited: 3,
    declined: 2,
    withdrawn: 1,
  };
  const groups = new Map<string, T[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.candidateId) ?? [];
    group.push(candidate);
    groups.set(candidate.candidateId, group);
  }
  return [...groups.values()].map((group) =>
    group.sort((a, b) => (rank[b.status] ?? 0) - (rank[a.status] ?? 0) || a.id.localeCompare(b.id))
  );
}
