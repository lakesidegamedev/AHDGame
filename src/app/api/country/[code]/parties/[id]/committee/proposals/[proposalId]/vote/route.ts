import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { findPartyBySequentialId } from "@/lib/db/partyLookup";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getGameTime } from "@/lib/time/gameTime";
import { castProposalVoteSchema } from "@/lib/api/schemas/parties";
import { castVote, getEligibleVoterSet, withdrawVote } from "@/lib/parties/proposals";
import { committeeProposalsCollection } from "@/lib/db/repositories/committeeProposals";

interface RouteParams {
  params: Promise<{ code: string; id: string; proposalId: string }>;
}

type VoteContext =
  | { ok: false; response: Response }
  | {
      ok: true;
      db: Awaited<ReturnType<typeof getDb>>;
      proposalObjectId: ObjectId;
      characterId: ObjectId;
      side: "proposing" | "target";
    };

/**
 * Shared checks for casting and withdrawing a vote: country, auth, rate
 * limit, open proposal, the voter's side and eligibility.
 */
async function loadVoteContext(params: RouteParams["params"]): Promise<VoteContext> {
  const fail = (status: number, message: string): VoteContext => ({
    ok: false,
    response: errorResponse(status, message),
  });
  const { code, id: partyId, proposalId } = await params;
  const countryId = code.toUpperCase() as CountryId;
  if (!COUNTRY_CONFIGS[countryId]) return fail(400, "Invalid country code");

  const authResult = await requireAuthWithCharacter();
  if (!authResult.ok) return { ok: false, response: authResult.response };
  if (authResult.user.isBanned) return fail(403, "Account is banned");
  const { user } = authResult;

  const rateLimit = checkRateLimit(
    `api/country/[code]/parties/[id]/committee/proposals/[proposalId]/vote:${user.userId}`,
    30,
    60000
  );
  if (!rateLimit.ok) return { ok: false, response: rateLimitResponse(rateLimit.retryAfter) };

  const db = await getDb();
  const party = await findPartyBySequentialId(db, partyId, countryId);
  if (!party) return fail(404, "Party not found");

  let proposalObjectId: ObjectId;
  try {
    proposalObjectId = new ObjectId(proposalId);
  } catch {
    return fail(400, "Invalid proposal ID");
  }

  const proposal = await committeeProposalsCollection(db).findOne({ _id: proposalObjectId });
  if (!proposal) return fail(404, "Proposal not found");
  if (proposal.status !== "open") return fail(400, "This proposal is no longer open");

  // The side follows the route party [id]: proposing, or target for a merge.
  const partyObjectIdStr = party._id.toString();
  let side: "proposing" | "target";
  if (partyObjectIdStr === proposal.partyId.toString()) {
    side = "proposing";
  } else if (
    proposal.type === "merge" &&
    partyObjectIdStr === proposal.merge?.targetPartyId?.toString()
  ) {
    side = "target";
  } else {
    return fail(403, "Your party is not party to this proposal");
  }

  const characterId = user.character._id;
  if (!getEligibleVoterSet(party).has(characterId.toString())) {
    return fail(403, "Only committee members and national leadership may vote on proposals");
  }

  // The target of a removal cannot vote on their own removal.
  if (
    proposal.type === "removeOfficeHolder" &&
    proposal.removeOfficeHolder?.targetCharacterId &&
    characterId.equals(proposal.removeOfficeHolder.targetCharacterId)
  ) {
    return fail(403, "You cannot vote on your own removal");
  }

  return { ok: true, db, proposalObjectId, characterId, side };
}

// POST /api/country/[code]/parties/[id]/committee/proposals/[proposalId]/vote
// Auth: requireAuthWithCharacter. Casts or changes the caller's vote.
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const ctx = await loadVoteContext(params);
    if (!ctx.ok) return ctx.response;

    const parsed = await parseJsonBody(request, castProposalVoteSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { vote } = parsed.data;

    const { currentTurn } = await getGameTime();
    await castVote(ctx.db, ctx.proposalObjectId, ctx.characterId, vote, ctx.side, currentTurn);

    const updated = await committeeProposalsCollection(ctx.db).findOne({
      _id: ctx.proposalObjectId,
    });

    return NextResponse.json({
      success: true,
      status: updated?.status ?? "open",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/country/[code]/parties/[id]/committee/proposals/[proposalId]/vote
// Auth: requireAuthWithCharacter. Withdraws the caller's vote while the proposal is open.
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await loadVoteContext(params);
    if (!ctx.ok) return ctx.response;

    const withdrawn = await withdrawVote(ctx.db, ctx.proposalObjectId, ctx.characterId, ctx.side);
    if (!withdrawn) {
      return errorResponse(400, "You have no vote on this open proposal to withdraw");
    }
    return NextResponse.json({ success: true, status: "open" });
  } catch (error) {
    return handleRouteError(error);
  }
}
