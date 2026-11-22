import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { checkRateLimit, ELECTION_LIMITS, rateLimitResponse } from "@/lib/api/rateLimit";
import { resolveElectionRouteParam } from "@/lib/elections/electionParamResolution";
import { findBlockingActiveCandidacy } from "@/lib/elections/activeCandidacy";
import { findVoluntaryWithdrawals } from "@/lib/elections/voluntaryWithdrawal";
import { hasReachedExecutiveTermLimit } from "@/lib/elections/executiveTermLimits";
import {
  isElectionTypeEntryBlocked,
  isNationwideDirectExecutiveElection,
} from "@/lib/elections/nationwideExecutive";
import {
  evaluateEntryChecks,
  firstFailedCheck,
  holdsCommonsSeatInRace,
  homeStateBlocks,
  senateClassBlock,
} from "@/lib/elections/entryPreview";
import { isSpecialCommonsElection, officeKeyForElectionType } from "@/lib/utils/electionLabels";
import { isBgFoundingCampaign } from "@/lib/countries/bg/rules/foundingCampaign1990";
import { isHu1991AssemblyCampaign } from "@/lib/countries/hu/rules/assemblyCampaign1991";
import { usesRussianDumaNationalElectorate } from "@/lib/countries/ru/dumaElectoratePreload";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { displayCanadianRegionCode } from "@/lib/countries/ca/regionCodes";
import { getCountryState } from "@/lib/countryState";
import { getGameTime } from "@/lib/time/gameTime";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/elections/[id]/entry-preview — Read-only eligibility checklist for entering a race.
// Uses the same rule predicates as POST /enter; the enter route stays the authority.
// Auth: requireAuthWithCharacter
// Errors: 400, 401, 404, 429
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireAuthWithCharacter();
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const character = user.character;

    const limit = checkRateLimit(
      `election:${user.userId}`,
      ELECTION_LIMITS.maxRequests,
      ELECTION_LIMITS.windowMs
    );
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);

    const { id } = await params;
    const db = await getDb();
    const resolved = await resolveElectionRouteParam(db, id);
    if (!resolved.ok) {
      return resolved.reason === "invalid_id"
        ? errorResponse(400, "Invalid election ID")
        : errorResponse(404, "Election not found");
    }
    const election = resolved.election;
    const electionId: ObjectId = election._id;

    const { effectiveNow: now, currentTurn } = await getGameTime();
    const primaryEnded =
      typeof election.primaryEndTurn === "number"
        ? currentTurn >= election.primaryEndTurn
        : Boolean(election.primaryEndTime && now > new Date(election.primaryEndTime));
    const raceCountry = (election.countryId ?? COUNTRY_CONFIGS.US.id) as CountryId;
    const characterCountry = (character.countryId ?? COUNTRY_CONFIGS.US.id) as CountryId;
    const isNationwideExecutive = isNationwideDirectExecutiveElection(
      election.electionType,
      election.state,
      raceCountry
    );

    const ruRound = Boolean(election.russianDumaRound || election.russianCouncilRound);
    const countrySpecific =
      ruRound ||
      isBgFoundingCampaign(election) ||
      isHu1991AssemblyCampaign(election) ||
      election.hungarianModernByElection != null ||
      (countryHasFeature("huApi", election.countryId) &&
        election.electionType === "nationalAssembly" &&
        election.hungarianModernAssembly?.ruleVersion === "mixed-2011-v1") ||
      (countryHasFeature("jpApi", election.countryId) &&
        (election.electionType === "shugiin" || election.electionType === "snap_shugiin") &&
        election.japanShugiinRules?.ruleVersion === "mixed-1994-v1");

    const runtime = await getCountryState(db, raceCountry);
    const deferredRules: string[] = [];
    if (runtime.governmentType === "onePartyState")
      deferredRules.push("Your party is allowed to field candidates here");
    if (countrySpecific) deferredRules.push("Country-specific filing rules");

    const existing = await electionCandidatesCollection(db).findOne({
      electionId,
      characterId: character._id,
      status: "active",
    });
    const withdrew = existing
      ? false
      : (await findVoluntaryWithdrawals(db, character._id, [electionId])).size > 0;
    const blocking = await findBlockingActiveCandidacy(db, character._id, electionId);
    const heldOffice = character.currentOffice;

    const checks = evaluateEntryChecks({
      open:
        (election.status === "upcoming" || election.status === "active") &&
        !isElectionTypeEntryBlocked(election.electionType),
      primaryEnded,
      raceCountry,
      characterCountry,
      homeStateBlocked: homeStateBlocks({
        isNationwideExecutive,
        nationalList: usesRussianDumaNationalElectorate(election),
        electionState: election.state,
        homeState: character.homeState,
      }),
      homeState: displayCanadianRegionCode(character.homeState),
      raceState: displayCanadianRegionCode(election.state),
      homeStateDeferred: ruRound,
      termLimitReached:
        isNationwideExecutive &&
        hasReachedExecutiveTermLimit(
          {
            careerHistory: character.careerHistory,
            executiveTermsServed: character.executiveTermsServed,
          },
          raceCountry
        ),
      senateClassHeld: senateClassBlock(heldOffice, election),
      raceSenateClass: election.senateClass,
      holdsCommonsSeat: holdsCommonsSeatInRace(heldOffice, {
        isSpecialCommons: isSpecialCommonsElection(election.electionType),
        officeKey: officeKeyForElectionType(election.electionType),
        state: election.state,
      }),
      alreadyEntered: existing !== null,
      withdrew,
      otherRace: blocking
        ? `${blocking.election.electionType} race in ${blocking.election.state}`
        : null,
      deferredRules,
    });

    const failed = firstFailedCheck(checks);
    return NextResponse.json({
      checks,
      canEnter: failed === null,
      blockReason: failed?.reason ?? null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
