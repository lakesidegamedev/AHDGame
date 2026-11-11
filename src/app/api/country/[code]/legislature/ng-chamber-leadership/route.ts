/**
 * GET  /api/country/ng/legislature/ng-chamber-leadership
 *   Returns, for both NG presiding-officer roles, the current holder, the
 *   active election (24h window), open nominations, viewer eligibility, and
 *   viewer identity. Auto-resolves an expired-but-unresolved election before
 *   responding.
 *
 * POST /api/country/ng/legislature/ng-chamber-leadership
 *   Body: { role, action, nominationId? }. Actions: declare | withdraw | vote
 *   | start_election (admin) | force_end (admin).
 *
 * Same 24h window and plurality-winner rule as the DE Bundestagspräsident
 * route. Two roles served by one route; NPPs do not vote.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { getPartyMap } from "@/lib/db/partyMap";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { getAuthUser } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getGameTime } from "@/lib/time/gameTime";
import { isLeadershipElectionClosed } from "@/lib/congress/leadershipElections";
import { resolveExecutiveHolder } from "@/lib/elections/resolveExecutiveHolder";
import {
  buildChamberLeadershipContext,
  describeEligibility,
  isPartyEligible,
  POLICY_BY_ROLE,
} from "@/lib/congress/leadership/rolePolicy";
import { ObjectId } from "mongodb";
import type {
  NgChamberLeadershipElection,
  NgChamberLeadershipNomination,
  NgChamberLeadershipRole,
} from "@/lib/db/types";
import { NG_ROLES, NG_ROLE_CONFIG } from "@/lib/congress/ngChamberLeadership/config";
import { getNgChamberComposition } from "@/lib/congress/ngChamberLeadership/composition";
import { resolveNgChamberLeadershipElection } from "@/lib/congress/ngChamberLeadership/resolveElection";
import { handleNgChamberLeadershipAction } from "@/lib/congress/ngChamberLeadership/actions";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { ngChamberLeadershipNominationsCollection } from "@/lib/db/repositories/ngChamberLeadershipNominations";
import { ngChamberLeadershipElectionsCollection } from "@/lib/db/repositories/ngChamberLeadershipElections";

const actionSchema = z.object({
  role: z.enum(["speaker_ng_reps", "president_ng_senate"]),
  action: z.enum(["declare", "withdraw", "vote", "start_election", "force_end"]),
  nominationId: z.string().optional(),
});

function isNgRequest(code: string): boolean {
  return countryHasFeature("ngApi", code.toUpperCase());
}

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!isNgRequest(code)) {
      return errorResponse(400, "This endpoint is NG-only");
    }
    const db = await getDb();
    const partyMap = await getPartyMap(db, "NG");
    const authUser = await getAuthUser().catch(() => null);

    // Resolve the viewer's character once; used for viewer identity, chamber
    // membership per role, and reading back myVote.
    let myCharacterId: string | null = null;
    let myParty: string | null = null;
    let myCharObjId: ObjectId | null = null;
    if (authUser) {
      const char = await charactersCollection(db).findOne({
        userId: new ObjectId(authUser.userId),
      });
      if (char) {
        myCharacterId = char._id.toString();
        myParty = char.party ?? null;
        myCharObjId = char._id;
      }
    }

    const resolvePartyLabel = (party: string | null | undefined): string | null => {
      if (!party) return null;
      const p = partyMap.get(party);
      return p?.abbreviation ?? p?.name ?? party;
    };

    const gameTime = await getGameTime();

    const roles = await Promise.all(
      NG_ROLES.map(async (role) => {
        const cfg = NG_ROLE_CONFIG[role];

        // Auto-resolve an expired election before responding.
        const electionDoc =
          await ngChamberLeadershipElectionsCollection<NgChamberLeadershipElection>(db).findOne({
            _id: role,
          });
        if (
          electionDoc?.status === "voting" &&
          isLeadershipElectionClosed(electionDoc, gameTime.currentTurn, gameTime.effectiveNow)
        ) {
          await resolveNgChamberLeadershipElection(db, role);
        }

        const [officerOfficial, election, nominations] = await Promise.all([
          electedOfficialsCollection(db).findOne({
            officeType: cfg.officerOfficeType,
            countryId: "NG",
          }),
          ngChamberLeadershipElectionsCollection<NgChamberLeadershipElection>(db).findOne({
            _id: role,
          }),
          ngChamberLeadershipNominationsCollection<NgChamberLeadershipNomination>(db)
            .find({ role, status: { $in: ["open", "voting"] } })
            .sort({ votesFor: -1 })
            .toArray(),
        ]);

        const leader = await resolveExecutiveHolder(db, officerOfficial);

        const isMember = myCharObjId
          ? !!(await electedOfficialsCollection(db).findOne({
              characterId: myCharObjId,
              officeType: cfg.memberOfficeType,
              countryId: "NG",
            }))
          : false;

        const composition = await getNgChamberComposition(db, partyMap, cfg.memberOfficeType);
        const policy = POLICY_BY_ROLE[role];
        const chamberCtx = buildChamberLeadershipContext({
          composition: composition.composition,
          majorityParty: composition.majorityParty,
          majorityBloc: composition.majorityBloc,
        });
        const canRun = myParty != null && isPartyEligible(policy, myParty, chamberCtx);
        const eligibilityLabel = describeEligibility(policy, chamberCtx);

        return {
          role,
          label: cfg.label,
          leader: leader
            ? {
                characterId: leader.characterId || null,
                characterName: leader.characterName,
                party: resolvePartyLabel(leader.party),
              }
            : null,
          election: election
            ? {
                status: election.status,
                startedAt: election.startedAt,
                endsAt: election.endsAt,
                endsOnTurn: election.endsOnTurn ?? null,
              }
            : null,
          nominations: nominations.map((n) => ({
            _id: n._id.toString(),
            nomineeId: n.nomineeId.toString(),
            nomineeName: n.nomineeName,
            nomineeParty: resolvePartyLabel(n.nomineeParty),
            votesFor: n.votesFor,
            status: n.status,
            myVote: myCharacterId ? (n.votes?.[myCharacterId] ?? null) : null,
          })),
          canRun,
          eligibilityLabel,
          isMember,
        };
      })
    );

    return NextResponse.json({
      roles,
      viewer: {
        characterId: myCharacterId,
        party: myParty,
        isAdmin: authUser?.isAdmin ?? false,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!isNgRequest(code)) {
      return errorResponse(400, "This endpoint is NG-only");
    }

    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `api/country/[code]/legislature/ng-chamber-leadership:${auth.user.userId}`,
      30,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, actionSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { role, action, nominationId } = parsed.data;

    const db = await getDb();
    const partyMap = await getPartyMap(db, "NG");

    const result = await handleNgChamberLeadershipAction({
      db,
      partyMap,
      role: role as NgChamberLeadershipRole,
      authUser: {
        userId: auth.user.userId.toString(),
        isAdmin: auth.user.isAdmin ?? false,
      },
      action,
      nominationId,
    });

    if (!result.success) {
      return errorResponse(result.status, result.error);
    }
    return NextResponse.json({ message: result.message });
  } catch (error) {
    return handleRouteError(error);
  }
}
