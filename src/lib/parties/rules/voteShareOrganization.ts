/**
 * Opening regional organization for a party seeded from an election result.
 * Multi-party countries seed organization from vote share: no vote leaves a
 * minimal presence, half the vote or more is a dominant machine.
 */
export const VOTE_SHARE_ORG_FLOOR = 5;
export const VOTE_SHARE_ORG_CEILING = 70;
const DOMINANT_VOTE_SHARE = 50;

/** Organization (5 to 70) for a regional vote share given in percent. */
export function organizationFromVoteShare(voteShare: number): number {
  const scaled =
    VOTE_SHARE_ORG_FLOOR +
    (voteShare / DOMINANT_VOTE_SHARE) * (VOTE_SHARE_ORG_CEILING - VOTE_SHARE_ORG_FLOOR);
  return Math.min(Math.max(Math.round(scaled), VOTE_SHARE_ORG_FLOOR), VOTE_SHARE_ORG_CEILING);
}
