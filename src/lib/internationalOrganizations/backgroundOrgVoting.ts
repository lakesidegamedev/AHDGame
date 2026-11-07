/**
 * Background countries' organisation ballots (#5702).
 *
 * A background country keeps its memberships but has no government that can
 * vote, so before this every ballot it sat on simply went without it. Each
 * turn, before the resolvers run, this casts the scripted vote
 * (`rules/backgroundOrgVote.ts`) for every background member that has not yet
 * voted on a pending resolution or chair election. A background member votes
 * once, on the first turn it sees the ballot, and the resolver then seats it on
 * the roll exactly like any other voter.
 *
 * Admissions, war declarations and war entries stay player-only, as for NPP
 * governments (`ballotIsPlayerOnly`).
 *
 * Cost: one tier read, then nothing at all in a world with no background
 * countries or no pending ballot. Otherwise a fixed handful of reads and one
 * bulk write per ballot collection, whatever the number of voters.
 */
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { CountryAlignment } from "@/lib/db/types/countryAlignment";
import type {
  OrganizationLeadershipElection,
  OrganizationLegislation,
  ProposalVoteRecord,
} from "@/lib/db/types/internationalOrganization";
import {
  getOrganizationLeadershipElectionsCollection,
  getOrganizationLegislationCollection,
  getOrganizationMembershipsCollection,
} from "@/lib/db/collections";
import { MACRO_COUNTRIES_COLLECTION } from "@/lib/db/collections/macroCountries";
import { loadCountryTiers, type CountryTierSnapshot } from "@/lib/country/countryTier";
import { pendingOrganizationVoteOp } from "@/lib/internationalOrganizations/voteWrite";
import {
  backgroundVotesOn,
  scriptBackgroundOrgVote,
  type AlignmentShares,
  type BackgroundBallot,
  type BackgroundVoterProfile,
} from "@/lib/internationalOrganizations/rules/backgroundOrgVote";
import type { OrganizationResolutionType } from "@/lib/db/types/internationalOrganization";

const RESOLUTION_KINDS: OrganizationResolutionType[] = [
  "free_trade_agreement",
  "sanctions",
  "directive",
  "joint_statement",
  "aid_package",
  "set_dues",
  "set_posture",
  "fund_agency",
  "declare_war",
  "join_conflict",
];

/** Resolution kinds a background member votes on. */
export const BACKGROUND_VOTED_RESOLUTIONS = RESOLUTION_KINDS.filter(backgroundVotesOn);

/**
 * The slice of a macro document the script reads. `nationalPolitics` is
 * written by the background politics model when it runs; absent, the vote
 * simply has no ideology term.
 */
interface BackgroundVoterDoc {
  entityId: string;
  displayName?: string;
  tradeExposure?: number;
  fiscalCapacity?: number;
  nationalPolitics?: {
    parties?: { partyId: string; economic?: number }[];
    governmentPartyIds?: string[];
    head?: { name?: string };
  };
}

/** Ruling party economic position, or null when the politics model has not run. */
export function rulingEconomicPosition(doc: BackgroundVoterDoc | undefined): number | null {
  const leadId = doc?.nationalPolitics?.governmentPartyIds?.[0];
  if (!leadId) return null;
  const party = doc?.nationalPolitics?.parties?.find((p) => p.partyId === leadId);
  return typeof party?.economic === "number" && Number.isFinite(party.economic)
    ? party.economic
    : null;
}

function voterProfile(
  countryId: string,
  doc: BackgroundVoterDoc | undefined
): BackgroundVoterProfile {
  return {
    countryId,
    tradeExposure: doc?.tradeExposure ?? 0.3,
    fiscalCapacity: doc?.fiscalCapacity ?? 0.35,
    rulingEconomic: rulingEconomicPosition(doc),
  };
}

function voterName(countryId: string, doc: BackgroundVoterDoc | undefined): string {
  const head = doc?.nationalPolitics?.head?.name;
  if (head) return head;
  const name = doc?.displayName ?? COUNTRY_CONFIGS[countryId as CountryId]?.name ?? countryId;
  return `${name} Government`;
}

function legislationBallot(item: OrganizationLegislation): BackgroundBallot {
  return {
    id: item._id.toString(),
    kind: item.type,
    proposerId: item.proposingCountryId ?? null,
    subjectId:
      item.type === "sanctions"
        ? (item.sanctionsTargetCountryId ?? null)
        : item.type === "joint_statement"
          ? (item.jointStatementSubjectCountryId ?? null)
          : null,
    stance: item.jointStatementStance ?? null,
    sanctionsAll: item.sanctionsCommodity === "all",
    aidDonorId: item.aidDonorCountryId ?? null,
    aidRecipientId: item.aidRecipientCountryId ?? null,
    votes: item.votes ?? [],
  };
}

function electionBallot(item: OrganizationLeadershipElection): BackgroundBallot {
  return {
    id: item._id.toString(),
    kind: "leadership_election",
    proposerId: item.nominatedByCountryId ?? null,
    candidateCountryId: item.candidateCountryId ?? null,
    votes: item.votes ?? [],
  };
}

function hasVoted(votes: readonly { countryId: string }[] | undefined, countryId: string): boolean {
  return (votes ?? []).some((v) => v.countryId === countryId);
}

/**
 * Background members among `memberIds`. Used by the resolver and the panels to
 * seat them on the ballots they vote on.
 */
export function backgroundMembersOf(
  memberIds: readonly string[],
  tiers: Pick<CountryTierSnapshot, "backgroundIds">
): CountryId[] {
  if (tiers.backgroundIds.length === 0) return [];
  const background = new Set<string>(tiers.backgroundIds);
  return memberIds.filter((id): id is CountryId => background.has(id));
}

/**
 * Cast the scripted vote of every background member on every pending ballot it
 * sits on and has not voted. Returns the number of votes cast.
 */
export async function castBackgroundOrgVotes(
  db: Db,
  currentTurn: number,
  tierSnapshot?: CountryTierSnapshot
): Promise<number> {
  const tiers = tierSnapshot ?? (await loadCountryTiers(db));
  if (tiers.backgroundIds.length === 0) return 0;

  const legislationCol = await getOrganizationLegislationCollection(db);
  const electionsCol = await getOrganizationLeadershipElectionsCollection(db);
  const [legislation, elections] = await Promise.all([
    legislationCol
      .find({ status: "pending", type: { $in: BACKGROUND_VOTED_RESOLUTIONS } })
      .toArray(),
    electionsCol.find({ status: "pending" }).toArray(),
  ]);
  if (legislation.length === 0 && elections.length === 0) return 0;

  const orgIds = [
    ...new Set([
      ...legislation.map((item) => item.organizationId),
      ...elections.map((item) => item.organizationId),
    ]),
  ];
  const membershipsCol = await getOrganizationMembershipsCollection(db);
  const memberships = await membershipsCol
    .find(
      { organizationId: { $in: orgIds }, countryId: { $in: tiers.backgroundIds } },
      { projection: { organizationId: 1, countryId: 1 } }
    )
    .toArray();
  if (memberships.length === 0) return 0;

  const backgroundByOrg = new Map<string, string[]>();
  for (const m of memberships) {
    const list = backgroundByOrg.get(m.organizationId) ?? [];
    list.push(m.countryId);
    backgroundByOrg.set(m.organizationId, list);
  }
  for (const list of backgroundByOrg.values()) list.sort();

  // Who still has to vote on what. An FTA is voted by its named parties only.
  const legislationVoters = legislation.map((item) => {
    const members = backgroundByOrg.get(item.organizationId) ?? [];
    const eligible =
      item.type === "free_trade_agreement"
        ? members.filter((id) => (item.parties as string[]).includes(id))
        : members;
    return eligible.filter((id) => !hasVoted(item.votes, id));
  });
  const electionVoters = elections.map((item) =>
    (backgroundByOrg.get(item.organizationId) ?? []).filter((id) => !hasVoted(item.votes, id))
  );
  const voters = new Set<string>([...legislationVoters.flat(), ...electionVoters.flat()]);
  if (voters.size === 0) return 0;

  const related = new Set<string>(voters);
  for (const item of legislation) {
    for (const id of [
      item.proposingCountryId,
      item.sanctionsTargetCountryId,
      item.jointStatementSubjectCountryId,
      item.aidRecipientCountryId,
    ]) {
      if (id) related.add(id);
    }
  }
  for (const item of elections) {
    related.add(item.candidateCountryId);
    related.add(item.nominatedByCountryId);
  }

  const [macroDocs, alignments] = await Promise.all([
    db
      .collection<BackgroundVoterDoc>(MACRO_COUNTRIES_COLLECTION)
      .find(
        { entityId: { $in: [...voters] } },
        {
          projection: {
            entityId: 1,
            displayName: 1,
            tradeExposure: 1,
            fiscalCapacity: 1,
            "nationalPolitics.parties.partyId": 1,
            "nationalPolitics.parties.economic": 1,
            "nationalPolitics.governmentPartyIds": 1,
            "nationalPolitics.head.name": 1,
          },
        }
      )
      .toArray(),
    db
      .collection<CountryAlignment>("countryAlignments")
      .find(
        { entityId: { $in: [...related] as CountryAlignment["entityId"][] } },
        { projection: { entityId: 1, shares: 1, nonAligned: 1 } }
      )
      .toArray(),
  ]);
  const macroById = new Map(macroDocs.map((doc) => [doc.entityId, doc]));
  const alignmentById = new Map<string, AlignmentShares>(
    alignments.map((row) => [
      String(row.entityId),
      { shares: (row.shares ?? {}) as AlignmentShares["shares"], nonAligned: row.nonAligned ?? 0 },
    ])
  );
  const alignmentOf = (id: string): AlignmentShares | null => alignmentById.get(id) ?? null;

  const now = new Date();
  const castFor = <T extends { _id: ObjectId; votes: ProposalVoteRecord[] }>(
    items: T[],
    votersFor: string[][],
    toBallot: (item: T) => BackgroundBallot
  ): AnyBulkWriteOperation<T>[] => {
    const ops: AnyBulkWriteOperation<T>[] = [];
    items.forEach((item, index) => {
      for (const countryId of votersFor[index]) {
        const doc = macroById.get(countryId);
        // Rebuilt per voter so a later member sees the votes cast before it.
        const decision = scriptBackgroundOrgVote(
          voterProfile(countryId, doc),
          toBallot(item),
          alignmentOf
        );
        if (!decision) continue;
        const vote: ProposalVoteRecord = {
          countryId: countryId as CountryId,
          characterId: new ObjectId(),
          characterName: voterName(countryId, doc),
          vote: decision.vote,
          castAt: now,
          castOnTurn: currentTurn,
        };
        item.votes = [...(item.votes ?? []), vote];
        ops.push(pendingOrganizationVoteOp<T>(item._id, vote));
      }
    });
    return ops;
  };

  const legislationOps = castFor(legislation, legislationVoters, legislationBallot);
  const electionOps = castFor(elections, electionVoters, electionBallot);
  const [legislationResult, electionResult] = await Promise.all([
    legislationOps.length > 0 ? legislationCol.bulkWrite(legislationOps) : null,
    electionOps.length > 0 ? electionsCol.bulkWrite(electionOps) : null,
  ]);
  return (legislationResult?.matchedCount ?? 0) + (electionResult?.matchedCount ?? 0);
}
