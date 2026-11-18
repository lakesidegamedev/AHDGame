/**
 * National name-recognition floor for major-party presidential nominees.
 *
 * In the general election a candidate's reach (sqrt of national influence)
 * multiplies their vote in every state at once. A nominee who won the primary
 * with little national influence of their own was therefore multiplied down
 * everywhere: an influence gap of 26 to 2 handed the better-known nominee about
 * 3.6 times the votes in every state, and a 76/24 result in California. A
 * major party's nominee carries the party's own recognition on the ballot, so
 * their reach never falls below the floor. Influence above the floor still
 * counts in full.
 *
 * "Major" means the party holds at least `MAJOR_PARTY_REGISTRATION_SHARE` of
 * national party registration, population-weighted across states. Minor
 * parties and independents keep their own influence.
 */

/** Minimum national registration share, 0-1, for a party to count as major. */
export const MAJOR_PARTY_REGISTRATION_SHARE = 0.15;

export interface RegistrationRow {
  partyId: string;
  stateId: string;
  /** Registration percent in the state, 0-100. */
  registration?: number;
}

/** Population-weighted national registration share (0-1) per party. */
export function nationalRegistrationShares(
  rows: readonly RegistrationRow[],
  populationByState: ReadonlyMap<string, number>
): Map<string, number> {
  const weighted = new Map<string, number>();
  let totalPop = 0;
  const countedStates = new Set<string>();
  for (const row of rows) {
    if (typeof row.registration !== "number" || !Number.isFinite(row.registration)) continue;
    const pop = Math.max(0, populationByState.get(row.stateId) ?? 0);
    if (!countedStates.has(row.stateId)) {
      countedStates.add(row.stateId);
      totalPop += pop;
    }
    weighted.set(row.partyId, (weighted.get(row.partyId) ?? 0) + (row.registration / 100) * pop);
  }
  const out = new Map<string, number>();
  if (totalPop <= 0) return out;
  for (const [partyId, w] of weighted) out.set(partyId, w / totalPop);
  return out;
}

/**
 * The national influence a nominee carries into the general election. Returns
 * the candidate's own influence unless they are a major-party nominee below
 * the floor. A floor of 0 disables the rule.
 */
export function nomineeNationalInfluence(
  ownInfluence: number,
  partyId: string | null | undefined,
  registrationShareByParty: ReadonlyMap<string, number>,
  floor: number
): number {
  const own = Number.isFinite(ownInfluence) ? ownInfluence : 0;
  if (!(floor > 0) || !partyId || partyId === "independent") return own;
  const share = registrationShareByParty.get(partyId) ?? 0;
  return share >= MAJOR_PARTY_REGISTRATION_SHARE ? Math.max(own, floor) : own;
}
