import { NextResponse } from "next/server";
import { assertMergeEligibility, MergeEligibilityError } from "@/lib/parties/mergeEligibility";
import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { findPartyBySequentialId } from "@/lib/db/partyLookup";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getGameTime } from "@/lib/time/gameTime";
import { isSameCountry } from "@/lib/api/sameCountry";
import { createProposalSchema } from "@/lib/api/schemas/parties";
import {
  getEligibleVoterSet,
  isPositionShiftLocked,
  isProposalTypeLocked,
} from "@/lib/parties/proposals";
import { requiredYesVotes } from "@/lib/parties/proposalConstants";
import { proposalEarliestPassMs, proposalMayPass } from "@/lib/parties/rules/proposalOpenWindow";
import { canRenameParty, DEFAULT_PARTY_RENAME_ERROR } from "@/lib/parties/rules/defaultIdentity";
import type { CommitteeProposal, PoliticalParty } from "@/lib/db/types";
import type {
  RemovalLockView,
  ProposalView,
  ProposalVoteSummary,
  ProposalsResponse,
} from "@/lib/parties/dto/partyView";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { committeeProposalsCollection } from "@/lib/db/repositories/committeeProposals";
import { notifyRemovalVoteOpened } from "@/lib/parties/officeRemovalNotifications";
import {
  loadRemovalCooldowns,
  removalTargetKey,
  type RemovalTarget,
} from "@/lib/parties/removalCooldownLookup";
import { removalCooldownMessage } from "@/lib/parties/rules/removalVoteCooldown";
import { getPartyRoleLabel } from "@/lib/parties/partyRoleLabels";
import { countEligibleVotes } from "@/lib/parties/rules/eligibleVoteCount";

interface RouteParams {
  params: Promise<{ code: string; id: string }>;
}

/**
 * Open proposals count only votes from the current voter set, as resolution
 * does. A resolved proposal is summarised from its stored votes against a
 * committee size, because today's committee is not the one that decided it.
 */
function buildVoteSummary(
  votes: CommitteeProposal["proposingVotes"],
  voters: ReadonlySet<string> | number
): ProposalVoteSummary {
  if (typeof voters !== "number") {
    const count = countEligibleVotes(votes, voters);
    return {
      yes: count.yes,
      no: count.no,
      notVoted: count.notVoted,
      yesNeeded: requiredYesVotes(count.eligible),
    };
  }
  const yes = votes.filter((v) => v.vote === "yes").length;
  const no = votes.filter((v) => v.vote === "no").length;
  return {
    yes,
    no,
    notVoted: Math.max(0, voters - yes - no),
    yesNeeded: requiredYesVotes(voters),
  };
}

async function toProposalView(
  db: Db,
  proposal: CommitteeProposal,
  proposingVoters: ReadonlySet<string> | number,
  targetVoters: ReadonlySet<string> | number | undefined,
  myCharacterId: ObjectId,
  now: Date
): Promise<ProposalView> {
  const proposer = await charactersCollection(db).findOne(
    { _id: proposal.proposedBy },
    { projection: { name: 1 } }
  );

  let mergeField: ProposalView["merge"] | undefined;
  if (proposal.type === "merge" && proposal.merge) {
    const targetParty = await politicalPartiesCollection(db).findOne(
      { _id: proposal.merge.targetPartyId },
      { projection: { name: 1 } }
    );
    mergeField = {
      targetPartyId: proposal.merge.targetPartyId.toString(),
      targetPartyName: targetParty?.name ?? "Unknown",
    };
  }

  let campaignerAppointmentField: ProposalView["campaignerAppointment"] | undefined;
  if (proposal.type === "campaignerAppointment" && proposal.campaignerAppointment) {
    const targetCharacter = await charactersCollection(db).findOne(
      { _id: proposal.campaignerAppointment.targetCharacterId },
      { projection: { name: 1 } }
    );
    campaignerAppointmentField = {
      targetCharacterId: proposal.campaignerAppointment.targetCharacterId.toString(),
      targetCharacterName: targetCharacter?.name ?? "Unknown",
    };
  }

  let removeOfficeHolderField: ProposalView["removeOfficeHolder"] | undefined;
  if (proposal.type === "removeOfficeHolder" && proposal.removeOfficeHolder) {
    const targetCharacter = await charactersCollection(db).findOne(
      { _id: proposal.removeOfficeHolder.targetCharacterId },
      { projection: { name: 1 } }
    );
    removeOfficeHolderField = {
      role: proposal.removeOfficeHolder.role,
      targetCharacterId: proposal.removeOfficeHolder.targetCharacterId.toString(),
      targetCharacterName: targetCharacter?.name ?? "Unknown",
    };
  }

  const myStr = myCharacterId.toString();
  const myProposingVote = proposal.proposingVotes.find((v) => v.voterId.toString() === myStr)?.vote;
  const myTargetVote =
    proposal.type === "merge"
      ? (proposal.targetVotes ?? []).find((v) => v.voterId.toString() === myStr)?.vote
      : undefined;

  return {
    id: proposal._id.toString(),
    type: proposal.type,
    status: proposal.status,
    proposedBy: proposal.proposedBy.toString(),
    proposedByName: proposer?.name ?? "Unknown",
    createdAtTurn: proposal.createdAtTurn,
    expiresAtTurn: proposal.expiresAtTurn,
    resolvedAtTurn: proposal.resolvedAtTurn,
    rename: proposal.rename,
    positionShift: proposal.positionShift,
    merge: mergeField,
    electionMethod: proposal.electionMethod,
    electionDuration: proposal.electionDuration,
    removeOfficeHolder: removeOfficeHolderField,
    ...openWindowFields(proposal, now),
    campaignerAppointment: campaignerAppointmentField,
    transactionApprovalMode: proposal.transactionApprovalMode,
    proposingVoteSummary: buildVoteSummary(proposal.proposingVotes, proposingVoters),
    targetVoteSummary:
      proposal.type === "merge" && targetVoters !== undefined
        ? buildVoteSummary(proposal.targetVotes ?? [], targetVoters)
        : undefined,
    myProposingVote,
    myTargetVote,
  };
}

function removalRoleLabel(
  party: Pick<PoliticalParty, "countryId" | "leadershipTitles">,
  role: "chair" | "viceChair" | "treasurer" | "committeeMember" | "campaigner"
): string {
  if (role === "campaigner") return "Campaigner";
  if (role === "committeeMember") return getPartyRoleLabel(party.countryId, "committee");
  return getPartyRoleLabel(party.countryId, role, party.leadershipTitles);
}

async function removalLocksFor(db: Db, party: PoliticalParty): Promise<RemovalLockView[]> {
  const { currentTurn } = await getGameTime();
  const targets: RemovalTarget[] = [];
  if (party.chairId) targets.push({ role: "chair", characterId: party.chairId });
  if (party.viceChairId) targets.push({ role: "viceChair", characterId: party.viceChairId });
  if (party.treasurerId) targets.push({ role: "treasurer", characterId: party.treasurerId });
  for (const id of party.committeeIds ?? []) {
    targets.push({ role: "committeeMember", characterId: id });
  }
  for (const id of party.campaignerIds ?? []) targets.push({ role: "campaigner", characterId: id });
  const cooldowns = await loadRemovalCooldowns(db, party, targets, currentTurn);
  const locks: RemovalLockView[] = [];
  for (const { role, characterId } of targets) {
    const lock = cooldowns.get(removalTargetKey(role, characterId));
    if (!lock?.locked || lock.reason == null || lock.sinceTurn == null) continue;
    if (lock.unlocksAtTurn == null) continue;
    locks.push({
      characterId: characterId.toString(),
      role,
      reason: lock.reason,
      sinceTurn: lock.sinceTurn,
      unlocksAtTurn: lock.unlocksAtTurn,
      message: removalCooldownMessage(lock, removalRoleLabel(party, role)),
    });
  }
  return locks;
}

function openWindowFields(
  proposal: CommitteeProposal,
  now: Date
): Pick<ProposalView, "earliestPassAt" | "canPassNow"> {
  if (!proposal.createdAt) return {};
  const createdAtMs = new Date(proposal.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return {};
  return {
    earliestPassAt: new Date(proposalEarliestPassMs(createdAtMs)).toISOString(),
    canPassNow: proposalMayPass(createdAtMs, now.getTime()),
  };
}

/** Resolution leaves the target of a removal or nomination out of the voter set. */
function proposingVoterSet(
  proposal: CommitteeProposal,
  eligibleVoterSet: ReadonlySet<string>
): Set<string> {
  const voters = new Set(eligibleVoterSet);
  if (proposal.type === "removeOfficeHolder" && proposal.removeOfficeHolder) {
    voters.delete(proposal.removeOfficeHolder.targetCharacterId.toString());
  }
  if (proposal.type === "campaignerAppointment" && proposal.campaignerAppointment) {
    voters.delete(proposal.campaignerAppointment.targetCharacterId.toString());
  }
  return voters;
}

async function getTargetEligibleSet(db: Db, proposal: CommitteeProposal): Promise<Set<string>> {
  if (proposal.type !== "merge" || !proposal.merge) return new Set();
  const target = await politicalPartiesCollection(db).findOne(
    { _id: proposal.merge.targetPartyId },
    { projection: { committeeIds: 1, chairId: 1, viceChairId: 1, treasurerId: 1 } }
  );
  if (!target) return new Set();
  return getEligibleVoterSet(target);
}

// GET /api/country/[code]/parties/[id]/committee/proposals
// Auth: requireAuthWithCharacter
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { code, id: partyId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const authResult = await requireAuthWithCharacter();
    if (!authResult.ok) return authResult.response;
    if (authResult.user.isBanned) {
      return errorResponse(403, "Account is banned");
    }
    const myCharacterId = authResult.user.character._id;

    const db = await getDb();
    const party = await findPartyBySequentialId(db, partyId, countryId);
    if (!party) return errorResponse(404, "Party not found");

    const eligibleVoterSet = getEligibleVoterSet(party);
    const now = new Date();
    const myCharStr = myCharacterId.toString();
    const isEligibleVoter = eligibleVoterSet.has(myCharStr);
    const isChair = party.chairId?.toString() === myCharStr;
    const isViceChair = party.viceChairId?.toString() === myCharStr;
    const isCommitteeMember = party.committeeIds.some((id) => id.toString() === myCharStr);
    // Proposer eligibility: chair, vice-chair, or any National Committee member.
    // Treasurer is excluded from proposing but included in the voter set.
    const canProposeAny = isChair || isViceChair || isCommitteeMember;

    const [rawOpen, rawPast, rawIncoming] = await Promise.all([
      committeeProposalsCollection(db)
        .find({ partyId: party._id, status: "open" })
        .sort({ createdAt: -1 })
        .toArray(),
      committeeProposalsCollection(db)
        .find({ partyId: party._id, status: { $in: ["passed", "rejected", "expired"] } })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      committeeProposalsCollection(db)
        .find({ "merge.targetPartyId": party._id, status: "open" })
        .sort({ createdAt: -1 })
        .toArray(),
    ]);

    // Fetch proposing party eligible voter sizes for incoming merge proposals
    const incomingProposingIds = [...new Set(rawIncoming.map((p) => p.partyId.toString()))];
    const proposingPartiesForIncoming =
      incomingProposingIds.length > 0
        ? await politicalPartiesCollection(db)
            .find({ _id: { $in: rawIncoming.map((p) => p.partyId) } })
            .project<{
              _id: ObjectId;
              committeeIds: ObjectId[];
              chairId: ObjectId | null;
              viceChairId: ObjectId | null;
              treasurerId: ObjectId | null;
            }>({ committeeIds: 1, chairId: 1, viceChairId: 1, treasurerId: 1 })
            .toArray()
        : [];
    const proposingSetMap = new Map(
      proposingPartiesForIncoming.map((p) => [
        p._id.toString(),
        getEligibleVoterSet(p as PoliticalParty),
      ])
    );

    const [openProposals, incomingMergeProposals, pastProposals] = await Promise.all([
      Promise.all(
        rawOpen.map(async (p) => {
          const targetVoters = p.type === "merge" ? await getTargetEligibleSet(db, p) : undefined;
          return toProposalView(
            db,
            p,
            proposingVoterSet(p, eligibleVoterSet),
            targetVoters,
            myCharacterId,
            now
          );
        })
      ),
      Promise.all(
        rawIncoming.map((p) =>
          toProposalView(
            db,
            p,
            proposingSetMap.get(p.partyId.toString()) ?? new Set<string>(),
            eligibleVoterSet,
            myCharacterId,
            now
          )
        )
      ),
      Promise.all(
        rawPast.map((p) =>
          toProposalView(
            db,
            p,
            proposingVoterSet(p, eligibleVoterSet).size,
            undefined,
            myCharacterId,
            now
          )
        )
      ),
    ]);

    const removalLocks = canProposeAny ? await removalLocksFor(db, party) : [];

    const response: ProposalsResponse = {
      openProposals,
      incomingMergeProposals,
      pastProposals,
      // Chair, vice-chair, and committee can propose any type.
      // Treasurer can vote but not propose. `canProposeMerge` is kept
      // for backward compat; identical to `canPropose`.
      // Treasury-two-person-approval: surface mode so the modal can grey
      // out the active option (server rejects no-op proposals anyway).
      canPropose: canProposeAny && !party.isDefunct,
      canProposeMerge: canProposeAny && !party.isDefunct,
      canVote: isEligibleVoter && !party.isDefunct,
      // Surface the current mode so the modal can grey out the active option.
      // No-op proposals are server-side rejected anyway.
      currentTransactionApprovalMode: party.transactionApprovalMode ?? "double",
      removalLocks,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error);
  }
}

// POST /api/country/[code]/parties/[id]/committee/proposals
// Auth: requireAuthWithCharacter; must be committee member (merge = chair only)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { code, id: partyId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const authResult = await requireAuthWithCharacter();
    if (!authResult.ok) return authResult.response;
    if (authResult.user.isBanned) {
      return errorResponse(403, "Account is banned");
    }
    const { user } = authResult;

    const rateLimit = checkRateLimit(
      `api/country/[code]/parties/[id]/committee/proposals:${user.userId}`,
      10,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const db = await getDb();
    const party = await findPartyBySequentialId(db, partyId, countryId);
    if (!party) return errorResponse(404, "Party not found");
    if (party.isDefunct) {
      return errorResponse(400, "This party has been dissolved");
    }
    if (!isSameCountry(user.character, party)) {
      return errorResponse(403, "Country mismatch");
    }

    const characterId = user.character._id;
    // Proposer eligibility: chair, vice-chair, or any committee member.
    // Treasurer can vote but not propose; the resolution voter set
    // still includes treasurer via `getEligibleVoterSet`.
    const characterIdStr = characterId.toString();
    const isChair = party.chairId?.toString() === characterIdStr;
    const isViceChair = party.viceChairId?.toString() === characterIdStr;
    const isCommittee = party.committeeIds.some((id) => id.toString() === characterIdStr);
    const canPropose = isChair || isViceChair || isCommittee;
    if (!canPropose) {
      return errorResponse(
        403,
        "Only the chair, vice-chair, or a national committee member may propose committee actions"
      );
    }

    const parsed = await parseJsonBody(request, createProposalSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const body = parsed.data;
    if (body.type === "rename" && !canRenameParty(party)) {
      return errorResponse(400, DEFAULT_PARTY_RENAME_ERROR);
    }

    // Campaigner nominations originate from the Chair Office roster
    // editor, which owns the cap and residency checks. Refuse hand-rolled
    // ones here so those checks can't be side-stepped.
    if (body.type === "campaignerAppointment") {
      return errorResponse(
        400,
        "Nominate campaigners from the Chair Office Party Campaigners card, not the proposal form."
      );
    }

    // Cooldown gate: reject if the relevant per-axis (positionShift) or
    // per-type (everything else) lock is still active. `getGameTime` runs
    // later for the turn used in the proposal doc — read it here too.
    const { currentTurn: nowTurn } = await getGameTime();
    if (body.type === "positionShift") {
      if (isPositionShiftLocked(party, body.axis, nowTurn)) {
        const lock = party.positionShiftCooldowns?.[body.axis];
        return errorResponse(
          409,
          `Position shift on '${body.axis}' is locked until turn ${lock?.lockedUntilTurn}`,
          { extra: { lockedUntilTurn: lock?.lockedUntilTurn } }
        );
      }
    } else if (
      body.type === "rename" ||
      body.type === "merge" ||
      body.type === "electionMethod" ||
      body.type === "electionDuration" ||
      body.type === "removeOfficeHolder" ||
      body.type === "transactionApprovalMode"
    ) {
      if (isProposalTypeLocked(party, body.type, nowTurn)) {
        const lock = party.proposalCooldowns?.[body.type];
        return errorResponse(
          409,
          `Proposal type '${body.type}' is locked until turn ${lock?.lockedUntilTurn}`,
          { extra: { lockedUntilTurn: lock?.lockedUntilTurn } }
        );
      }
    }

    // Duplicate-open guard: don't allow a second open proposal of the same
    // type/axis on the same party while the first is still pending. Prevents
    // racing the cooldown via two concurrent proposals.
    const duplicateOpen = await committeeProposalsCollection(db).findOne({
      partyId: party._id,
      status: "open",
      type: body.type,
      ...(body.type === "positionShift" ? { "positionShift.axis": body.axis } : {}),
    });
    if (duplicateOpen) {
      return errorResponse(
        409,
        body.type === "positionShift"
          ? `An open positionShift proposal on '${body.axis}' already exists`
          : `An open '${body.type}' proposal already exists`,
        { extra: { existingProposalId: duplicateOpen._id.toString() } }
      );
    }

    if (body.type === "merge") {
      const targetPartyObjId = new ObjectId(body.targetPartyId);
      if (targetPartyObjId.toString() === party._id.toString()) {
        return errorResponse(400, "Cannot merge a party with itself");
      }
      const targetParty = await politicalPartiesCollection(db).findOne(
        { _id: targetPartyObjId },
        { projection: { countryId: 1, sequentialId: 1, isDefunct: 1 } }
      );
      if (!targetParty) {
        return errorResponse(404, "Target party not found");
      }
      if (targetParty.isDefunct) {
        return errorResponse(400, "Target party has been dissolved");
      }
      if (targetParty.countryId !== party.countryId) {
        return errorResponse(400, "Cannot merge parties across countries");
      }
      try {
        await assertMergeEligibility(db, party, targetParty);
      } catch (error) {
        if (error instanceof MergeEligibilityError) return errorResponse(400, error.message);
        throw error;
      }
    }

    if (body.type === "transactionApprovalMode") {
      // Reject no-op proposals — the modal should grey out the currently
      // active mode but a hand-rolled request could still try. Absent
      // value (legacy rows) is treated as "double" so a proposal to
      // switch to "double" on a legacy row is also a no-op.
      const currentMode = party.transactionApprovalMode ?? "double";
      if (body.mode === currentMode) {
        return errorResponse(
          400,
          `Party is already in '${currentMode}' transaction approval mode.`
        );
      }
    }

    if (body.type === "removeOfficeHolder") {
      const targetOid = new ObjectId(body.targetCharacterId);
      // Self-target forbidden: proposing your own removal is invalid.
      if (targetOid.equals(characterId)) {
        return errorResponse(400, "You cannot propose your own removal");
      }
      // Target must currently hold the named role; reject if the role is
      // vacant or the named character isn't in that role.
      let inRole = false;
      if (body.role === "chair") {
        inRole = !!party.chairId && party.chairId.equals(targetOid);
      } else if (body.role === "viceChair") {
        inRole = !!party.viceChairId && party.viceChairId.equals(targetOid);
      } else if (body.role === "treasurer") {
        inRole = !!party.treasurerId && party.treasurerId.equals(targetOid);
      } else if (body.role === "campaigner") {
        inRole = (party.campaignerIds ?? []).some((id) => id.equals(targetOid));
      } else {
        // committeeMember
        inRole = party.committeeIds.some((id) => id.equals(targetOid));
      }
      if (!inRole) {
        return errorResponse(400, `Target character is not currently the ${body.role}`);
      }
      const cooldowns = await loadRemovalCooldowns(
        db,
        party,
        [{ role: body.role, characterId: targetOid }],
        nowTurn
      );
      const lock = cooldowns.get(removalTargetKey(body.role, targetOid));
      if (lock?.locked) {
        return errorResponse(
          400,
          removalCooldownMessage(lock, removalRoleLabel(party, body.role)),
          {
            extra: { reason: lock.reason, unlocksAtTurn: lock.unlocksAtTurn },
          }
        );
      }
    }

    const now = new Date();

    const proposalDoc: Omit<CommitteeProposal, "_id"> = {
      type: body.type,
      status: "open",
      partyId: party._id,
      countryId: party.countryId,
      proposedBy: characterId,
      createdAtTurn: nowTurn,
      expiresAtTurn: nowTurn + 24,
      createdAt: now,
      updatedAt: now,
      proposingVotes: [],
      targetVotes: body.type === "merge" ? [] : undefined,
      rename:
        body.type === "rename"
          ? { newName: body.newName, newAbbreviation: body.newAbbreviation }
          : undefined,
      positionShift:
        body.type === "positionShift" ? { axis: body.axis, direction: body.direction } : undefined,
      merge:
        body.type === "merge" ? { targetPartyId: new ObjectId(body.targetPartyId) } : undefined,
      electionMethod: body.type === "electionMethod" ? { method: body.method } : undefined,
      electionDuration:
        body.type === "electionDuration" ? { durationTurns: body.durationTurns } : undefined,
      removeOfficeHolder:
        body.type === "removeOfficeHolder"
          ? {
              role: body.role,
              targetCharacterId: new ObjectId(body.targetCharacterId),
            }
          : undefined,
      transactionApprovalMode:
        body.type === "transactionApprovalMode" ? { mode: body.mode } : undefined,
    };

    const result = await committeeProposalsCollection(db).insertOne(
      proposalDoc as CommitteeProposal
    );

    if (proposalDoc.removeOfficeHolder) {
      const { role, targetCharacterId } = proposalDoc.removeOfficeHolder;
      const voters = getEligibleVoterSet(party);
      voters.delete(targetCharacterId.toString());
      await notifyRemovalVoteOpened({
        party,
        proposalId: result.insertedId,
        role,
        targetCharacterId,
        yesNeeded: requiredYesVotes(voters.size),
        eligibleVoters: voters.size,
        expiresAtTurn: proposalDoc.expiresAtTurn,
      });
    }

    return NextResponse.json({ success: true, proposalId: result.insertedId.toString() });
  } catch (error) {
    return handleRouteError(error);
  }
}
