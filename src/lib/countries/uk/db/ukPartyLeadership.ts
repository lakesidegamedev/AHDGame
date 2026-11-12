import type { Db } from "mongodb";
import type {
  UKPartyLeadership,
  LeadershipChallenge,
} from "@/lib/countries/uk/leadership/leadershipTypes";
import { ukPartyLeadershipCollection } from "@/lib/db/repositories/ukPartyLeadership";
import { ukLeadershipChallengesCollection } from "@/lib/db/repositories/ukLeadershipChallenges";

/** Per-party UK leadership-removal state (ticket #861). */
export function getUKPartyLeadershipCollection(db: Db) {
  return ukPartyLeadershipCollection<UKPartyLeadership>(db);
}

/** Leadership challenges (letters/nominations + ballots) for UK parties. */
export function getUKLeadershipChallengesCollection(db: Db) {
  return ukLeadershipChallengesCollection<LeadershipChallenge>(db);
}
