import {
  hostsSovereigntyReferendums,
  sovereigntyMemberRegionIds,
} from "@/lib/referendum/rules/sovereigntyRegions";
import { cohortMember } from "@/lib/referendum/rules/pooledElectorate";
import { z } from "zod";
import { requireHumanSessionWithCharacter } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse, statusResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { PoliticalParty, StatePartyOrg } from "@/lib/db/types";
import { getReferendumCollection } from "@/lib/db/collections/referendum";
import { canSpendOnStateParty } from "@/lib/parties/access";
import { spendGroundGame } from "@/lib/referendum/groundGame";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";

// POST /api/country/[code]/referendum/[refId]/ground-game
// Auth: requireHumanSessionWithCharacter; nation-gated (the acting character must
//   belong to the referendum's country). Official mode requires the actor be a
//   party Chair/Vice/Campaigner (canSpendOnStateParty) and debits Political
//   Strength; volunteer mode debits the player's Actions + Campaign Funds.
//   Any country that hosts sovereignty referendums. Errors: 400, 401, 403, 404.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string; refId: string }> }
) {
  try {
    const { code, refId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country");
    }
    if (!hostsSovereigntyReferendums(countryId)) {
      return errorResponse(400, "This country holds no sovereignty referendums.");
    }

    const auth = await requireHumanSessionWithCharacter(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(
      request,
      z.object({
        side: z.union([z.literal("yes"), z.literal("no")]),
        presetId: z.string().min(1),
        target: z.union([z.literal("whole"), z.object({ groupId: z.string().min(1) })]),
        mode: z.union([z.literal("official"), z.literal("volunteer")]),
      })
    );
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    if (!ObjectId.isValid(refId)) return errorResponse(400, "Invalid referendum ID.");
    const db = await getDb();
    const ref = await getReferendumCollection(db).findOne({ _id: new ObjectId(refId) });
    if (!ref) return errorResponse(404, "Referendum not found.");

    // Nation gate — no foreign actors, either mode.
    if (auth.user.character.countryId !== ref.countryId) {
      return errorResponse(403, "Only players of this nation may campaign in this referendum.");
    }

    const partyId = auth.user.character.party ?? null;
    // Wire display name: party abbreviation (official) or the player's name.
    let actorName = auth.user.character.name ?? "A volunteer";
    let spendStateId: string | undefined;
    if (parsed.data.mode === "official") {
      if (!partyId) {
        return errorResponse(400, "You are not in a party.");
      }
      // A bloc's campaign is paid from whichever member state the officer runs,
      // preferring the state a targeted group belongs to.
      const members = sovereigntyMemberRegionIds(ref.regionId);
      const targetMember =
        parsed.data.target === "whole" ? null : cohortMember(parsed.data.target.groupId);
      const [partyDoc, stateParties] = await Promise.all([
        politicalPartiesCollection(db).findOne({ countryId, sequentialId: Number(partyId) }),
        statePartyOrgCollection(db)
          .find({ countryId, stateId: { $in: members }, partyId: String(partyId) })
          .toArray(),
      ]);
      const ordered = [...stateParties].sort(
        (a, b) => Number(b.stateId === targetMember) - Number(a.stateId === targetMember)
      );
      const payer = partyDoc
        ? ordered.find((org) => canSpendOnStateParty(partyDoc, org, auth.user))
        : undefined;
      if (!partyDoc || (!payer && !canSpendOnStateParty(partyDoc, null, auth.user))) {
        return errorResponse(403, "Only a party officer may run an official ground game.");
      }
      actorName = partyDoc.abbreviation;
      spendStateId = payer?.stateId ?? ref.regionId;
    }

    const result = await spendGroundGame(db, {
      referendumId: refId,
      side: parsed.data.side,
      presetId: parsed.data.presetId,
      target: parsed.data.target,
      mode: parsed.data.mode,
      characterId: auth.user.character._id,
      partyId: parsed.data.mode === "official" ? String(partyId) : undefined,
      countryId,
      stateId: spendStateId,
      actorName,
    });
    return statusResponse(result.status, result.body);
  } catch (error) {
    return handleRouteError(error);
  }
}
