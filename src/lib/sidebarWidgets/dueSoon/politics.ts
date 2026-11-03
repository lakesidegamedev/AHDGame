import type { ObjectId } from "mongodb";
import type { CabinetNomination } from "@/lib/db/types/cabinet";
import type { ScotusNomination } from "@/lib/db/types/scotus";
import type { PoliticalParty } from "@/lib/db/types/party";
import type {
  NationalPartyElection,
  NationalPartyVote,
} from "@/lib/db/types/nationalPartyElection";
import type { StatePartyElection, StatePartyVote } from "@/lib/db/types/statePartyElection";
import { isInNewCharacterCooldown } from "@/lib/auth/newCharacterCooldown";
import { getLeadershipEligibility } from "@/lib/parties/leadershipTenure";
import type { DueSoonContext, DueSoonItem } from "./types";

const ROW_LIMIT = 20;

function openOnTurn(dueTurn: number | undefined, ctx: DueSoonContext): dueTurn is number {
  return typeof dueTurn === "number" && ctx.currentTurn < dueTurn;
}

/**
 * National and state party leadership ballots the player may cast and has not.
 * Mirrors the vote routes: membership, the new-character cooldown and party
 * tenure, all waived for founding elections. Parties that elect leaders by
 * committee are left out.
 */
export async function partyBallots(ctx: DueSoonContext): Promise<DueSoonItem[]> {
  const member = ctx.member;
  if (!member?.party || !ctx.countryId) return [];
  const partyId = member.party;
  const countryId = ctx.countryId;
  const party = await ctx.db
    .collection<PoliticalParty>("politicalParties")
    .findOne(
      { sequentialId: Number(partyId), countryId },
      { projection: { name: 1, sequentialId: 1, leadershipElectionMethod: 1 } }
    );
  if (!party || party.leadershipElectionMethod === "committee") return [];
  const canonicalId = String(party.sequentialId);

  const homeState = member.homeState?.toUpperCase();
  const [national, regional] = await Promise.all([
    ctx.db
      .collection<NationalPartyElection>("nationalPartyElections")
      .find(
        { countryId, partyId: canonicalId, status: "voting" },
        { projection: { position: 1, endTurn: 1, founding: 1 } }
      )
      .limit(ROW_LIMIT)
      .toArray(),
    homeState
      ? ctx.db
          .collection<StatePartyElection>("statePartyElections")
          .find(
            { countryId, stateId: homeState, partyId: canonicalId, status: "voting" },
            { projection: { position: 1, endTurn: 1, founding: 1, stateId: 1 } }
          )
          .limit(ROW_LIMIT)
          .toArray()
      : Promise.resolve([]),
  ]);

  const cooledDown = !isInNewCharacterCooldown({
    userCreatedAt: member.userCreatedAt ?? new Date(0),
    characterCreatedAt: member.createdAt ?? new Date(0),
    includePartyJoinedAt: false,
    now: ctx.now,
  }).blocked;
  const tenured = getLeadershipEligibility(member, ctx.currentTurn, canonicalId).eligible;
  const mayVote = (election: { founding?: boolean; endTurn: number }) =>
    openOnTurn(election.endTurn, ctx) && (election.founding === true || (cooledDown && tenured));
  const openNational = national.filter(mayVote);
  const openRegional = regional.filter(mayVote);
  if (openNational.length + openRegional.length === 0) return [];

  const votedIn = async (collection: "nationalPartyVotes" | "statePartyVotes", ids: ObjectId[]) => {
    if (ids.length === 0) return new Set<string>();
    const rows = await ctx.db
      .collection<NationalPartyVote | StatePartyVote>(collection)
      .find(
        { electionId: { $in: ids }, voterId: ctx.characterId },
        { projection: { electionId: 1 } }
      )
      .toArray();
    return new Set(rows.map((row) => row.electionId.toString()));
  };
  const [votedNational, votedRegional] = await Promise.all([
    votedIn(
      "nationalPartyVotes",
      openNational.map((election) => election._id)
    ),
    votedIn(
      "statePartyVotes",
      openRegional.map((election) => election._id)
    ),
  ]);

  const code = countryId.toLowerCase();
  return [
    ...openNational
      .filter((election) => !votedNational.has(election._id.toString()))
      .map((election) => ({
        kind: "partyElection" as const,
        id: `partyElection:${election._id.toString()}`,
        subject: party.name,
        position: election.position,
        href: `/country/${code}/parties/${canonicalId}`,
        dueTurn: election.endTurn,
        dueAt: null,
      })),
    ...openRegional
      .filter((election) => !votedRegional.has(election._id.toString()))
      .map((election) => ({
        kind: "partyElection" as const,
        id: `statePartyElection:${election._id.toString()}`,
        subject: `${party.name} · ${election.stateId}`,
        position: election.position,
        href: `/country/${code}/region/${election.stateId.toLowerCase()}/party/${canonicalId}`,
        dueTurn: election.endTurn,
        dueAt: null,
      })),
  ];
}

/**
 * Cabinet, vice presidential and Supreme Court nominations awaiting the
 * player's confirmation vote. Mirrors the vote routes: senators vote on all
 * of them, House members only on a vice presidential nomination.
 */
export async function confirmationVotes(ctx: DueSoonContext): Promise<DueSoonItem[]> {
  const senate = ctx.seats.find((seat) => seat.officeType === "senate" && seat.countryId);
  const house = ctx.seats.find((seat) => seat.officeType === "house" && seat.countryId);
  const seat = senate ?? house;
  if (!seat?.countryId) return [];
  const countryId = seat.countryId;
  const [cabinet, scotus] = await Promise.all([
    ctx.db
      .collection<CabinetNomination>("cabinetNominations")
      .find(
        { countryId, status: "active", ...(senate ? {} : { positionId: "vicePresident" }) },
        {
          projection: {
            positionId: 1,
            nomineeCharacterName: 1,
            votingEndsOnTurn: 1,
            [`votes.${ctx.charKey}`]: 1,
            [`houseVotes.${ctx.charKey}`]: 1,
          },
        }
      )
      .limit(ROW_LIMIT)
      .toArray(),
    senate
      ? ctx.db
          .collection<ScotusNomination>("scotusNominations")
          .find(
            { countryId, status: "active" },
            {
              projection: {
                nomineeName: 1,
                votingEndsOnTurn: 1,
                [`votes.${ctx.charKey}`]: 1,
              },
            }
          )
          .limit(ROW_LIMIT)
          .toArray()
      : Promise.resolve([]),
  ]);

  const items: DueSoonItem[] = [];
  for (const nomination of cabinet) {
    const map =
      !senate && nomination.positionId === "vicePresident"
        ? nomination.houseVotes
        : nomination.votes;
    if (map?.[ctx.charKey] || !openOnTurn(nomination.votingEndsOnTurn, ctx)) continue;
    items.push({
      kind: "confirmation",
      id: `cabinetNomination:${nomination._id.toString()}`,
      subject: nomination.nomineeCharacterName,
      href: `/congress/nominations/${nomination._id.toString()}`,
      dueTurn: nomination.votingEndsOnTurn,
      dueAt: null,
    });
  }
  for (const nomination of scotus) {
    if (nomination.votes?.[ctx.charKey] || !openOnTurn(nomination.votingEndsOnTurn, ctx)) continue;
    items.push({
      kind: "confirmation",
      id: `scotusNomination:${nomination._id.toString()}`,
      subject: nomination.nomineeName,
      href: `/congress/scotus-nominations/${nomination._id.toString()}`,
      dueTurn: nomination.votingEndsOnTurn,
      dueAt: null,
    });
  }
  return items;
}
