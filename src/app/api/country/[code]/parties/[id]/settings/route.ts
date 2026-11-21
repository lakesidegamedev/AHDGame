// PATCH /api/country/[code]/parties/[id]/settings - Update chair-managed party settings.
// Auth: requireAuth
// Errors: 400, 401, 403, 404, 429
/**
 * PATCH /api/parties/[id]/settings
 *
 * Allows the party Chair to update party appearance, leadership titles and other settings.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, forbidden, notFound, errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { findPartyBySequentialId } from "@/lib/db/partyLookup";
import { z } from "zod";
import type { Filter } from "mongodb";
import type { PoliticalParty } from "@/lib/db/types";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { normalizeDiscordInviteUrl } from "@/lib/discord/invite";
import { canActAsChair } from "@/lib/parties/actingChair";
import {
  MAX_PARTY_LEADERSHIP_TITLE_LENGTH,
  partyRoleTitleConflicts,
} from "@/lib/parties/partyRoleLabels";
import { COMMITTEE_SIZE } from "@/lib/elections/party/nationalCommitteeElections";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";

const committeeTitle = z.string().trim().max(MAX_PARTY_LEADERSHIP_TITLE_LENGTH);

const updateSchema = z.object({
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color (e.g., #FF5733)")
    .optional(),
  discordInviteUrl: z.union([z.string().trim().max(200), z.null()]).optional(),
  // Membership gate (suggestion #72): "open" = immediate joins, "approval" =
  // joins file a pending request for a leader to accept/decline.
  membershipMode: z.enum(["open", "approval"]).optional(),
  committeeTitles: z
    .strictObject({
      name: committeeTitle.nullable().optional(),
      member: committeeTitle.nullable().optional(),
      byMember: z
        .record(z.string().regex(/^[a-f0-9]{24}$/), committeeTitle.min(1).nullable())
        .refine(
          (titles) => Object.keys(titles).length <= COMMITTEE_SIZE,
          "Too many committee titles"
        )
        .optional(),
    })
    .optional(),
  leadershipTitles: z
    .object({
      chair: z.string().trim().max(MAX_PARTY_LEADERSHIP_TITLE_LENGTH).nullable(),
      viceChair: z.string().trim().max(MAX_PARTY_LEADERSHIP_TITLE_LENGTH).nullable(),
      treasurer: z.string().trim().max(MAX_PARTY_LEADERSHIP_TITLE_LENGTH).nullable(),
    })
    .strict()
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string; id: string }> }
) {
  try {
    const { code, id: partyId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const authResult = await requireAuth();
    if (!authResult.ok) return authResult.response;
    const authUser = authResult.user;

    const rateLimit = checkRateLimit(
      `api/country/[code]/parties/[id]/settings:${authUser.userId}`,
      30,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, updateSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const db = await getDb();

    const character = authUser.character;
    if (!character) {
      return errorResponse(400, "No character found");
    }

    const party = await findPartyBySequentialId(db, partyId, countryId);
    if (!party) {
      return NextResponse.json(notFound("Party not found").toJson(), { status: 404 });
    }

    if (!canActAsChair(party, character._id)) {
      return NextResponse.json(
        forbidden(
          "Only the party Chair (or acting Vice-Chair when the chair seat is vacant) can update settings"
        ).toJson(),
        { status: 403 }
      );
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (parsed.data.color) {
      updates.color = parsed.data.color;
    }

    if (parsed.data.discordInviteUrl !== undefined) {
      const submittedDiscordInviteUrl = parsed.data.discordInviteUrl?.trim() ?? "";
      const normalizedDiscordInviteUrl = normalizeDiscordInviteUrl(submittedDiscordInviteUrl);
      if (submittedDiscordInviteUrl && !normalizedDiscordInviteUrl) {
        return errorResponse(400, "Discord link must be a valid Discord invite URL");
      }
      updates.discordInviteUrl = normalizedDiscordInviteUrl;
    }

    if (parsed.data.membershipMode !== undefined) {
      updates.membershipMode = parsed.data.membershipMode;
    }

    if (parsed.data.leadershipTitles !== undefined) {
      const titles = {
        chair: parsed.data.leadershipTitles.chair || null,
        viceChair: parsed.data.leadershipTitles.viceChair || null,
        treasurer: parsed.data.leadershipTitles.treasurer || null,
      };
      if (
        (["chair", "viceChair", "treasurer"] as const).some((role) =>
          partyRoleTitleConflicts(countryId, role, titles)
        )
      ) {
        return errorResponse(
          400,
          "Give each national office a distinct title. An office cannot use another office's default title."
        );
      }
      updates.leadershipTitles = titles;
    }

    const filter: Filter<PoliticalParty> = { _id: party._id };
    const removals: Record<string, ""> = {};
    const committeeTitles = parsed.data.committeeTitles;
    if (committeeTitles) {
      filter.chairId = party.chairId;
      if (!party.chairId) filter.viceChairId = party.viceChairId;
      if (committeeTitles.name !== undefined)
        updates["committeeTitles.name"] = committeeTitles.name || null;
      if (committeeTitles.member !== undefined)
        updates["committeeTitles.member"] = committeeTitles.member || null;
      if (committeeTitles.byMember !== undefined) {
        const ids = Object.keys(committeeTitles.byMember);
        const holders = (party.committeeIds ?? []).filter((id) => ids.includes(id.toString()));
        if (holders.length !== ids.length) {
          return errorResponse(409, "The committee changed. Refresh before editing member titles.");
        }
        if (holders.length) filter.committeeIds = { $all: holders };
        for (const [id, title] of Object.entries(committeeTitles.byMember)) {
          const field = `committeeTitles.byMember.${id}`;
          if (title === null) removals[field] = "";
          else updates[field] = title;
        }
      }
    }

    if (Object.keys(updates).length <= 1 && Object.keys(removals).length === 0) {
      return errorResponse(400, "No valid updates provided");
    }

    const result = await politicalPartiesCollection(db).updateOne(filter, {
      $set: updates,
      ...(Object.keys(removals).length ? { $unset: removals } : {}),
    });
    if (committeeTitles && result.matchedCount === 0) {
      return errorResponse(
        409,
        "Party leadership or the committee changed. Refresh and try again."
      );
    }

    return NextResponse.json({ success: true, message: "Party settings updated" });
  } catch (error) {
    return handleRouteError(error);
  }
}
