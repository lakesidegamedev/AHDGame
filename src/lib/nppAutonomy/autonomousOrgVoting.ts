/**
 * Autonomous international-organization voting.
 *
 * Membership proposals and FTAs need UNANIMOUS yes; leadership elections need a simple
 * majority. In a disabled/econ-only country no player casts the vote, and no-vote counts
 * as non-approval, so a single autonomous member silently vetoes every proposal forever.
 * This casts a cooperative "yes" for each autonomy-active eligible voter that has not
 * voted, before the resolvers run.
 *
 * Safety rail: only autonomy-active countries (enabled AND NOT player-enabled) are
 * auto-voted; player-enabled members are never voted for.
 */

import { ObjectId, type Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import type { NPP, NppForeignPolicyMode } from "@/lib/db/types";
import type { ProposalVoteRecord } from "@/lib/db/types/internationalOrganization";
import {
  getOrganizationLeadershipElectionsCollection,
  getOrganizationLegislationCollection,
} from "@/lib/db/collections";
import { getMembers } from "@/lib/internationalOrganizations/service";
import { upsertPendingOrganizationVote } from "@/lib/internationalOrganizations/voteWrite";
import { isNppAutonomyActive } from "./featureFlag";
import { foreignPolicyModeFrom } from "./foreignPolicyRollout";

/** Per-turn caches so we don't re-query autonomy state, members, or voter
 *  identity for the same country/org across multiple pending items. */
interface VotingCaches {
  autonomyByCountry: Map<string, boolean>;
  membersByOrg: Map<string, CountryId[]>;
  voterByCountry: Map<string, { characterId: ObjectId; characterName: string }>;
}

async function isAutonomyActiveCached(
  db: Db,
  caches: VotingCaches,
  countryId: CountryId
): Promise<boolean> {
  const key = String(countryId);
  const cached = caches.autonomyByCountry.get(key);
  if (cached !== undefined) return cached;
  const active = await isNppAutonomyActive(db, countryId);
  caches.autonomyByCountry.set(key, active);
  return active;
}

async function getMembersCached(
  db: Db,
  caches: VotingCaches,
  organizationId: string
): Promise<CountryId[]> {
  const cached = caches.membersByOrg.get(organizationId);
  if (cached !== undefined) return cached;
  // Autonomous voting speaks for countries the game models; a macro-tier member
  // has no government to cast a ballot on behalf of.
  const members = (await getMembers(db, organizationId as Parameters<typeof getMembers>[1])).filter(
    (id): id is CountryId => id in COUNTRY_CONFIGS
  );
  caches.membersByOrg.set(organizationId, members);
  return members;
}

/**
 * Resolve the "who voted" identity for an autonomous country: a representative
 * non-technocrat NPP. Falls back to a synthetic government identity if the
 * country has no NPP (keeps the vote landing rather than re-stalling the org).
 */
async function getVoterIdentityCached(
  db: Db,
  caches: VotingCaches,
  countryId: CountryId
): Promise<{ characterId: ObjectId; characterName: string }> {
  const key = String(countryId);
  const cached = caches.voterByCountry.get(key);
  if (cached) return cached;

  const npp = await db
    .collection<NPP>("npps")
    .findOne(
      { countryId, retiredAt: null, isTechnocrat: { $ne: true } },
      { projection: { _id: 1, name: 1 } }
    );
  const identity = npp
    ? { characterId: npp._id, characterName: npp.name }
    : {
        characterId: new ObjectId(),
        characterName: `${COUNTRY_CONFIGS[countryId]?.name ?? countryId} Government`,
      };
  caches.voterByCountry.set(key, identity);
  return identity;
}

function alreadyVoted(votes: ProposalVoteRecord[] | undefined, countryId: CountryId): boolean {
  return (votes ?? []).some((v) => v.countryId === countryId);
}

/**
 * Cast cooperative autonomous "yes" votes on all pending org items for
 * autonomy-active eligible voters. Returns the number of votes cast.
 */
export async function castAutonomousOrgVotes(db: Db, currentTurn: number): Promise<number> {
  const rollout = await db
    .collection<{ _id: string; nppForeignPolicyMode?: NppForeignPolicyMode }>("gameState")
    .findOne({ _id: "current" }, { projection: { nppForeignPolicyMode: 1 } });
  if (foreignPolicyModeFrom(rollout?.nppForeignPolicyMode) === "active") {
    // The opinion-driven planner owns autonomous ballots in active mode. Keep
    // the legacy cooperative voter only as the shadow-mode comparison baseline.
    return 0;
  }

  const caches: VotingCaches = {
    autonomyByCountry: new Map(),
    membersByOrg: new Map(),
    voterByCountry: new Map(),
  };
  const now = new Date();
  let votesCast = 0;

  const buildVote = async (countryId: CountryId): Promise<ProposalVoteRecord> => {
    const identity = await getVoterIdentityCached(db, caches, countryId);
    return {
      countryId,
      characterId: identity.characterId,
      characterName: identity.characterName,
      vote: "yes",
      castAt: now,
      castOnTurn: currentTurn,
    };
  };

  // Membership proposals are NOT voted on here: admissions are decided by
  // player-enabled members alone, and every country this function speaks
  // for is autonomy-active (and so NOT player-enabled). A ballot cast here
  // could never be counted by the resolver.
  //
  // FTA legislation and leadership elections ARE voted: an FTA is decided
  // by its named parties, and a leadership election by the wider policy
  // roll, which autonomy-active members are on.

  // ── 2. FTA legislation — eligible voters = named parties ────────────────────
  const legislationCol = await getOrganizationLegislationCollection(db);
  const pendingLegislation = await legislationCol.find({ status: "pending" }).toArray();
  for (const item of pendingLegislation) {
    for (const party of item.parties as CountryId[]) {
      if (alreadyVoted(item.votes as ProposalVoteRecord[], party)) continue;
      if (!(await isAutonomyActiveCached(db, caches, party))) continue;
      const res = await upsertPendingOrganizationVote(
        legislationCol,
        item._id,
        await buildVote(party)
      );
      if (res.matchedCount > 0) votesCast++;
    }
  }

  // ── 3. Leadership elections — eligible voters = current members ─────────────
  const electionsCol = await getOrganizationLeadershipElectionsCollection(db);
  const pendingElections = await electionsCol.find({ status: "pending" }).toArray();
  for (const election of pendingElections) {
    const members = await getMembersCached(db, caches, election.organizationId);
    for (const member of members) {
      if (alreadyVoted(election.votes as ProposalVoteRecord[], member)) continue;
      if (!(await isAutonomyActiveCached(db, caches, member))) continue;
      const res = await upsertPendingOrganizationVote(
        electionsCol,
        election._id,
        await buildVote(member)
      );
      if (res.matchedCount > 0) votesCast++;
    }
  }

  if (votesCast > 0) {
    console.log(
      `[nppAutonomy] cast ${votesCast} autonomous intl-org vote(s) on turn ${currentTurn}`
    );
  }
  return votesCast;
}
