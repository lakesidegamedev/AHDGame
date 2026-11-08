import { getJointSittingOfficeTypes } from "@/lib/legislature/chamberOfficeType";
import type { CountryId } from "@/lib/constants/countries";
import type { ConcurrentVoteStage } from "../types";

/**
 * The concurrent bicameral vote, shared by every national config: both chambers
 * vote at once into separate tallies and the bill passes only if every voting
 * chamber clears the bar. Defined once so configs cannot drift.
 *
 * ⚠️ Chambers MUST come from `getJointSittingOfficeTypes`, NEVER
 * `legislature.bicameral`. Germany's `1953-default` override sets
 * `bicameral: true` over an appointed Bundesrat with no `upperElectionSystem`,
 * which opens a chamber with no electable members and fails every German bill.
 * The helper gates on an upper chamber with actual voters and is
 * preset-sensitive. Bloc conflict-entry and war-declaration resolutions
 * produce `active_both` bills so every elected chamber decides on one clock.
 */
export const CONCURRENT_VOTE_STAGE: ConcurrentVoteStage = {
  kind: "concurrentVote",
  status: "active_both",
  chambersFor: (b) => getJointSittingOfficeTypes((b.countryId ?? "US") as CountryId, b.preset),
  voteFieldFor: (b, officeType) =>
    officeType === getJointSittingOfficeTypes((b.countryId ?? "US") as CountryId, b.preset)[0]
      ? "votes"
      : "otherChamberVotes",
  // Simple majority is the stage default for bloc conflict entry. The close path
  // resolves provision-specific supersedes per bill, including the two-thirds rule
  // for declarations of war.
  passRule: "simpleMajority",
  requireAll: true,
  onPassStatus: "signed",
  votingDurationHours: 24,
  // Int-org and join-conflict provisions skip the executive; anything else that adopts
  // this stage in a presidential country still routes to the President.
  execActionCheckOnPass: true,
};
