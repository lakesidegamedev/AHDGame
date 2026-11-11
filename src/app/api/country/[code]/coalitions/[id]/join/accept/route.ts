import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, badRequest, forbidden, notFound, errorResponse } from "@/lib/api/errors";
import { createNotification } from "@/lib/notifications";
import type { Coalition } from "@/lib/db/types/coalition";
import type { PoliticalParty } from "@/lib/db/types/party";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { isBannedParty } from "@/lib/turn/onePartyConstraints";
import { getCountryState } from "@/lib/countryState";
import { admitPartyToCoalition } from "@/lib/coalitions/admitParty";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { coalitionsCollection } from "@/lib/db/repositories/coalitions";
import type { Document } from "mongodb";

const acceptSchema = z.object({
  partySequentialId: z.number().int().positive(),
});

// POST /api/coalitions/[id]/join/accept — Accept a join request (coalition chair only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string; id: string }> }
) {
  try {
    const { code, id } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const authResult = await requireAuthWithCharacter();
    if (!authResult.ok) return authResult.response;

    const rateLimit = checkRateLimit(
      `api/country/[code]/coalitions/[id]/join/accept:${authResult.user.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);
    const { character } = authResult.user;

    const parsed = await parseJsonBody(request, acceptSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const db = await getDb();

    // Find coalition, verify caller is coalition chair
    const coalition = await coalitionsCollection(db).findOne({
      sequentialId: Number(id),
      countryId,
    });
    if (!coalition) {
      throw notFound("Coalition not found.");
    }

    if (!coalition.chairCharacterId || !coalition.chairCharacterId.equals(character._id)) {
      throw forbidden("Only the coalition chair can accept join requests.");
    }

    // Find the requesting party
    const requestingParty = await politicalPartiesCollection(db).findOne({
      sequentialId: parsed.data.partySequentialId,
      countryId,
    });
    if (!requestingParty) {
      throw notFound("Requesting party not found.");
    }

    // Verify the party has a pending request in this coalition
    const joinRequest = coalition.joinRequests.find(
      (r) => String(r.partyId) === String(requestingParty._id)
    );
    if (!joinRequest) {
      throw badRequest("That party does not have a pending join request to this coalition.");
    }

    // Defense-in-depth: a banned party may not join a coalition. The /join
    // route already gates the requester at submission time; this is the
    // symmetric guard on the chair's accept so a banned party can't slip in
    // via a stale request after its regime status changed.
    // Runtime governmentType so a post-Stage-4 conversion immediately
    // lifts the banned-party restriction.
    const runtime = await getCountryState(db, countryId);
    if (isBannedParty({ governmentType: runtime.governmentType }, requestingParty)) {
      throw forbidden("That party is banned and cannot be admitted to a coalition.");
    }

    // Reject if the requesting party joined a different coalition after submitting the request.
    // The /join request guard only checks at request time; without re-checking here, acceptance
    // overwrites coalitionId and leaves the party stale-listed in the prior coalition.
    if (requestingParty.coalitionId && !requestingParty.coalitionId.equals(coalition._id)) {
      throw badRequest("That party is already a member of another coalition.");
    }

    // Check if party is already a member (should not happen, but prevents duplicates)
    const isAlreadyMember = coalition.members.some((m) => m.partyId.equals(requestingParty._id));
    if (isAlreadyMember) {
      // Remove from joinRequests and return success
      // $pull with nested object filter hits a TypeScript limitation in MongoDB's UpdateFilter
      /* eslint-disable @typescript-eslint/no-explicit-any */
      await coalitionsCollection<Document>(db).updateOne({ _id: coalition._id }, {
        $pull: { joinRequests: { partyId: requestingParty._id } },
        $set: { updatedAt: new Date() },
      } as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return NextResponse.json({ success: true });
    }

    const now = new Date();

    if (!(await admitPartyToCoalition(db, coalition, requestingParty, "joinRequests", now))) {
      return errorResponse(
        409,
        "This request was already handled or the party joined another coalition."
      );
    }

    // Notify the requesting party's chair
    if (requestingParty.chairId) {
      const chairChar = await charactersCollection(db).findOne(
        { _id: requestingParty.chairId },
        { projection: { userId: 1 } }
      );
      if (chairChar) {
        await createNotification({
          userId: chairChar.userId,
          type: "coalition_join_accepted",
          title: `Join Request Accepted: ${coalition.name}`,
          message: `Your party has been accepted into the coalition "${coalition.name}".`,
          metadata: {
            coalitionId: coalition._id,
            coalitionSequentialId: coalition.sequentialId,
            coalitionName: coalition.name,
            countryId,
            partyName: requestingParty.name,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
