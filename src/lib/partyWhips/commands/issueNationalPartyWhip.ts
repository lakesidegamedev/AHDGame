import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { badRequest } from "@/lib/api/errors";
import type {
  BillWhip,
  Bill,
  CabinetNomination,
  Character,
  ElectedOfficial,
  GameState,
  LegislationType,
  NPP,
  PoliticalParty,
  SpeakerVacateMotion,
  StateDemographics,
  WhipIssuerRole,
} from "@/lib/db/types";
import { getGameTime } from "@/lib/time/gameTime";
import { isLeadershipElectionClosed } from "@/lib/congress/leadershipElections";
import { impeachmentStageChamberKey } from "@/lib/impeachment/impeachmentTally";
import type { ScotusNomination } from "@/lib/db/types/scotus";
import { isVotingDeadlinePassed } from "@/lib/legislature/billVotingWindow";
import type { Impeachment } from "@/lib/db/types/impeachment";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import {
  getPMAppointmentVotesCollection,
  getNoConfidenceVotesCollection,
} from "@/lib/db/collections/governmentFormation";
import {
  applyWhipVotesToBill,
  applyWhipVotesToLeadership,
  applyWhipVotesToGovernmentVote,
  applyWhipVotesToCabinet,
  applyWhipVotesToVacateMotion,
  applyWhipVotesToImpeachment,
} from "@/lib/congress/applyWhipVotes";
import { statecraftWhipBonus } from "@/lib/partyWhips/whipSuccess";
import { USE_GROWTH_INCREMENT } from "@/lib/stats/statsConstants";
import { canIssueWhip } from "@/lib/partyWhips/rules/playerWhip";
import { getEligibleCharactersForWhip } from "@/lib/partyWhips/playerWhip";
import { createNotifications } from "@/lib/notifications";
import { getPartyRoleLabel } from "@/lib/parties/partyRoleLabels";
import { getBillWhipWindowStart } from "@/lib/congress/billWhipPhase";
import {
  getCabinetWhipChamber,
  getConfidenceWhipChamber,
  isWhippableChamber,
  isCabinetNominationInCountry,
  getChamberLeaderRole,
} from "@/lib/partyWhips/constraints";
import { getOfficeTypeForChamber } from "@/lib/legislature/chamberOfficeType";
import { getPartyNppControlStatus } from "@/lib/parties/antiAbuseGuards";
import { recordAudit } from "@/lib/audit/recordAudit";
import { inferWhipIssuerRole } from "@/lib/partyWhips/issuerRole";
import { buildPlayerWhipMessage } from "./playerWhipMessage";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { nppsCollection } from "@/lib/db/repositories/npps";

export const nationalPartyWhipSchema = z
  .object({
    targetType: z.enum([
      "bill",
      "speakerElection",
      "leadershipElection",
      "pmAppointmentVote",
      "noConfidenceVote",
      "cabinetNomination",
      "scotusNomination",
      "speakerVacateMotion",
      "impeachmentVote",
    ]),
    targetId: z.string().min(1, "Target ID required"),
    chamber: z.string().min(1, "Chamber required"),
    direction: z.enum(["for", "against"]),
    mode: z.enum(["soft", "hard"]).default("hard"),
    candidacyId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, "Invalid candidacy ID")
      .optional(),
    audience: z.enum(["npp", "character"]).default("npp"),
  })
  .refine(canIssueWhip, {
    message: "Hard whips cannot force player votes. Use a soft player whip instead.",
    path: ["mode"],
  });

export type NationalPartyWhipRequest = z.infer<typeof nationalPartyWhipSchema>;

export interface IssueNationalPartyWhipInput {
  db: Db;
  countryId: CountryId;
  party: PoliticalParty;
  character: Character;
  isAdmin?: boolean;
  request: NationalPartyWhipRequest;
}

export interface PlayerWhipBody {
  success: true;
  whipId: string;
  audience: "character";
  mode: NationalPartyWhipRequest["mode"];
  affected: number;
  alreadyAligned: number;
  mailedCount: number;
  message: string;
}

export interface NppWhipBody {
  success: true;
  whipId: string;
  attemptNumber: 1 | 2;
  fellInLine: number;
  ignored: number;
  ignoredFlavor: string;
  message: string;
}

export type IssueNationalPartyWhipResult =
  { ok: false; status: number; error: string } | { ok: true; body: PlayerWhipBody | NppWhipBody };

type Failure = Extract<IssueNationalPartyWhipResult, { ok: false }>;

function fail(status: number, error: string): Failure {
  return { ok: false, status, error };
}

interface ResolvedTarget {
  targetOid: ObjectId | null;
  storedTargetId: ObjectId | string;
  whipWindowStart: Date | undefined;
}

/**
 * Issue a national party whip on a bill, leadership election, government vote,
 * nomination, motion to vacate or impeachment. NPP whips cast party NPP votes
 * immediately (two attempts per target and chamber); player whips record the
 * directive, override eligible players' votes on a hard whip and mail them.
 * Malformed target ids throw an ApiError for the route's error handler.
 */
export async function issueNationalPartyWhip({
  db,
  countryId,
  party,
  character,
  isAdmin,
  request,
}: IssueNationalPartyWhipInput): Promise<IssueNationalPartyWhipResult> {
  const { targetType, chamber, audience } = request;
  const partyIdStr = String(party.sequentialId);
  const characterId = character._id;
  const isChair = party.chairId?.equals(characterId);
  const isViceChair = party.viceChairId?.equals(characterId);

  const chamberLeaderRole = await getChamberLeaderRole(db, characterId, chamber, partyIdStr);
  const issuerRole = chamberLeaderRole ?? inferWhipIssuerRole(isChair, isViceChair);

  if (!isChair && !isViceChair && !isAdmin && !chamberLeaderRole) {
    return fail(
      403,
      `Only the ${getPartyRoleLabel(countryId, "chair")}, ${getPartyRoleLabel(countryId, "viceChair")}, or chamber leadership can issue whip directives`
    );
  }

  if (!isWhippableChamber(countryId, chamber)) {
    return fail(400, "Invalid chamber for this country");
  }
  if (audience === "npp") {
    const nppControl = await getPartyNppControlStatus({
      db,
      countryId,
      party,
      actor: character,
      isAdmin,
    });
    if (!nppControl.ok) {
      return fail(403, nppControl.error ?? "NPP controls are locked.");
    }
  }

  const target = await resolveWhipTarget(db, countryId, request);
  if ("ok" in target) return target;
  const { storedTargetId, whipWindowStart } = target;

  // Check existing whips (max 2 per target/chamber for national party NPP whips).
  // Legacy docs without `audience` are treated as "npp" so they still count.
  const existingWhips = await db
    .collection<BillWhip>("billWhips")
    .find({
      targetType,
      targetId: storedTargetId,
      chamber,
      partyId: partyIdStr,
      issuedBy: "nationalParty",
      $or: [{ audience: "npp" }, { audience: { $exists: false } }],
      ...(whipWindowStart ? { createdAt: { $gte: whipWindowStart } } : {}),
    })
    .toArray();

  if (audience === "npp" && existingWhips.length >= 2) {
    return fail(400, "Maximum 2 whip attempts per bill/chamber reached");
  }

  const issuer: WhipIssuer = { db, countryId, party, partyIdStr, character, issuerRole };
  if (audience === "character") {
    return issuePlayerWhip(issuer, request, target);
  }
  return issueNppWhip(issuer, request, target, existingWhips.length);
}

/**
 * Validate the target exists, is open, and is whippable in the chamber.
 * Leadership elections reuse a stable _id ("current" for Speaker, the role name
 * for chamber leaders), so whips from a prior election instance persist in
 * billWhips; the returned window start scopes the existing-whip checks to whips
 * issued after the current election opened.
 */
async function resolveWhipTarget(
  db: Db,
  countryId: CountryId,
  request: NationalPartyWhipRequest
): Promise<ResolvedTarget | Failure> {
  const { targetType, targetId, chamber, candidacyId } = request;
  const confidenceChamber = getConfidenceWhipChamber(countryId);
  const cabinetChamber = getCabinetWhipChamber(countryId);
  // The motion to vacate is a singleton keyed "current"; pin it server-side so
  // a client cannot address some other document through this target type.
  const normalizedTargetId =
    targetType === "speakerVacateMotion"
      ? "current"
      : countryId === COUNTRY_CONFIGS.US.id &&
          targetType === "speakerElection" &&
          targetId === "speaker"
        ? "current"
        : targetId;
  // Speaker/leadership-election whips route to US-only collections
  // (speakerNominations / houseLeadershipNominations / senateLeadershipNominations)
  // in the apply phase. Reject for German chambers, which use PM
  // appointment / no-confidence votes for executive selection instead.
  if (
    (targetType === "speakerElection" || targetType === "leadershipElection") &&
    (chamber === "bundestag" || chamber === "landtag")
  ) {
    return fail(
      400,
      "Leadership election whips are not supported for German chambers. Use PM appointment or no-confidence vote whips instead."
    );
  }

  const targetOid = ObjectId.isValid(normalizedTargetId) ? new ObjectId(normalizedTargetId) : null;
  const isUSCongressLeadershipTarget =
    countryId === COUNTRY_CONFIGS.US.id &&
    (targetType === "speakerElection" || targetType === "leadershipElection");
  // The vacate motion shares the leadership singleton shape ("current"), so it
  // stores its target id as a string too rather than coercing to an ObjectId.
  const storedTargetId: ObjectId | string =
    isUSCongressLeadershipTarget || targetType === "speakerVacateMotion"
      ? normalizedTargetId
      : (targetOid ?? normalizedTargetId);
  const resolved = (whipWindowStart?: Date): ResolvedTarget => ({
    targetOid,
    storedTargetId,
    whipWindowStart,
  });

  if (targetType === "bill") {
    if (!targetOid) return fail(400, "Invalid target ID");
    // Filter bills to the party's country (tolerate legacy bills without countryId)
    const billCountryFilter = { $or: [{ countryId }, { countryId: { $exists: false } }] };
    const bill = await db.collection<Bill>("bills").findOne({
      _id: targetOid,
      status: {
        $in: ["active", "active_other", "active_both", "veto_override", "override_shugiin"],
      },
      ...billCountryFilter,
    });
    if (!bill) return fail(404, "Bill not found or voting not open");
    return resolved(getBillWhipWindowStart(bill));
  }

  if (targetType === "speakerElection") {
    const speakerElection = isUSCongressLeadershipTarget
      ? normalizedTargetId === "current"
        ? await db
            .collection<{ _id: string; status: string; startedAt?: Date }>("speakerElections")
            .findOne({
              _id: "current",
              status: "voting",
            })
        : null
      : targetOid
        ? await db.collection("speakerElections").findOne({
            _id: targetOid,
            status: "active",
          })
        : null;
    if (!speakerElection) return fail(404, "Speaker election not found or not active");
    const windowStart = isUSCongressLeadershipTarget ? speakerElection.startedAt : undefined;
    if (!candidacyId) return fail(400, "candidacyId required for leadership whips");
    return resolved(windowStart);
  }

  if (targetType === "leadershipElection") {
    const leadershipElection = isUSCongressLeadershipTarget
      ? await db
          .collection<{
            _id: string;
            status: string;
            startedAt?: Date;
          }>(chamber === "senate" ? "senateLeadershipElections" : "houseLeadershipElections")
          .findOne({
            _id: normalizedTargetId,
            status: "voting",
          })
      : targetOid
        ? await db.collection("leadershipElections").findOne({
            _id: targetOid,
            status: "active",
          })
        : null;
    if (!leadershipElection) return fail(404, "Leadership election not found or not active");
    const windowStart = isUSCongressLeadershipTarget
      ? (leadershipElection as { startedAt?: Date }).startedAt
      : undefined;
    if (!candidacyId) return fail(400, "candidacyId required for leadership whips");
    return resolved(windowStart);
  }

  if (targetType === "speakerVacateMotion") {
    // US-only: the motion to vacate the chair exists solely for the US House.
    if (countryId !== COUNTRY_CONFIGS.US.id) {
      return fail(400, "Motions to vacate are only held in the US House");
    }
    if (chamber !== confidenceChamber) {
      return fail(400, `Motions to vacate can only be whipped in the ${confidenceChamber}`);
    }
    const motion = await db
      .collection<SpeakerVacateMotion>("speakerVacateMotions")
      .findOne({ _id: "current", status: "voting" });
    // Resolution is lazy (on read of the Speaker page), so a motion can sit in
    // "voting" past its deadline. Gate on the clock as well as the status, or
    // a chair could whip a motion that is already over.
    const vacateGameTime = motion ? await getGameTime() : null;
    if (
      !motion ||
      !vacateGameTime ||
      isLeadershipElectionClosed(motion, vacateGameTime.currentTurn, vacateGameTime.effectiveNow)
    ) {
      return fail(404, "No motion to vacate is currently open");
    }
    // The motion reuses the stable "current" id, so whips from a previous
    // motion would otherwise count against this one's attempt cap.
    return resolved(motion.startedAt);
  }

  if (targetType === "pmAppointmentVote") {
    if (!targetOid) return fail(400, "Invalid target ID");
    const pmVote = await getPMAppointmentVotesCollection(db).findOne({
      _id: targetOid,
      status: "active",
    });
    if (!pmVote || pmVote.countryId !== countryId) {
      return fail(404, "PM appointment vote not found or not active");
    }
    if (chamber !== confidenceChamber) {
      return fail(400, `PM appointment votes can only be whipped in the ${confidenceChamber}`);
    }
    return resolved();
  }

  if (targetType === "noConfidenceVote") {
    if (!targetOid) return fail(400, "Invalid target ID");
    const ncVote = await getNoConfidenceVotesCollection(db).findOne({
      _id: targetOid,
      status: "active",
    });
    if (!ncVote || ncVote.countryId !== countryId) {
      return fail(404, "No-confidence vote not found or not active");
    }
    if (chamber !== confidenceChamber) {
      return fail(400, `No-confidence votes can only be whipped in the ${confidenceChamber}`);
    }
    return resolved();
  }

  if (targetType === "impeachmentVote") {
    if (!targetOid) return fail(400, "Invalid target ID");
    const impeachment = await db
      .collection<Impeachment>("impeachments")
      .findOne({ _id: targetOid, countryId, stage: { $in: ["house", "senate"] } });
    if (!impeachment) return fail(404, "Impeachment not found or no longer open for voting");
    // A governor is tried by its own state legislature, which is the state
    // party's surface, not the national one.
    if (impeachment.targetOffice === "governor") {
      return fail(
        400,
        "Governor impeachments are whipped from the state party, not the national party"
      );
    }
    // Only the chamber sitting at the CURRENT stage may be whipped: the lower
    // chamber while the case is impeaching, the upper chamber while it tries.
    const stageChamber = impeachmentStageChamberKey(impeachment);
    if (!stageChamber || chamber !== stageChamber) {
      return fail(
        400,
        `This impeachment is being voted in the ${stageChamber ?? "no open"} chamber`
      );
    }
    const stageEndsOnTurn =
      impeachment.stage === "house"
        ? impeachment.houseVotingEndsOnTurn
        : impeachment.senateVotingEndsOnTurn;
    const impeachGameTime = await getGameTime();
    if (stageEndsOnTurn != null && impeachGameTime.currentTurn > stageEndsOnTurn) {
      return fail(404, "Voting for this impeachment stage has closed");
    }
    return resolved();
  }

  if (targetType === "scotusNomination") {
    if (countryId !== COUNTRY_CONFIGS.US.id || chamber !== "senate") {
      return fail(400, "Supreme Court nominations can only be whipped in the US Senate");
    }
    const nomination = await db
      .collection<ScotusNomination>("scotusNominations")
      .findOne({ _id: requireObjectId(targetOid), countryId, status: "active" });
    if (!nomination) return fail(404, "Supreme Court nomination not found or not active");
    const gameTime = await getGameTime();
    if (
      isVotingDeadlinePassed(
        nomination.votingEndsAt,
        gameTime.effectiveNow,
        nomination.votingEndsOnTurn,
        gameTime.currentTurn
      )
    ) {
      return fail(409, "Voting has ended");
    }
    return resolved();
  }

  // cabinetNomination
  if (!targetOid) return fail(400, "Invalid target ID");
  const nomination = await db.collection("cabinetNominations").findOne<CabinetNomination>({
    _id: targetOid,
    status: "active",
  });
  if (!nomination || !isCabinetNominationInCountry(nomination, countryId)) {
    return fail(404, "Cabinet nomination not found or not active");
  }
  if (chamber !== cabinetChamber) {
    return fail(400, `Cabinet nominations can only be whipped in the ${cabinetChamber}`);
  }
  return resolved();
}

function requireObjectId(targetOid: ObjectId | null): ObjectId {
  if (!targetOid) {
    throw badRequest("Invalid target ID");
  }
  return targetOid;
}

interface WhipIssuer {
  db: Db;
  countryId: CountryId;
  party: PoliticalParty;
  partyIdStr: string;
  character: Character;
  issuerRole: WhipIssuerRole;
}

function leadershipNominationCollection(
  targetType: NationalPartyWhipRequest["targetType"],
  chamber: string
) {
  return targetType === "speakerElection"
    ? "speakerNominations"
    : chamber === "senate"
      ? "senateLeadershipNominations"
      : "houseLeadershipNominations";
}

async function issuePlayerWhip(
  { db, countryId, party, partyIdStr, character, issuerRole }: WhipIssuer,
  { targetType, chamber, direction, mode, candidacyId }: NationalPartyWhipRequest,
  { storedTargetId, whipWindowStart }: ResolvedTarget
): Promise<IssueNationalPartyWhipResult> {
  const characterId = character._id;
  const existingCharacterWhips = await db
    .collection<BillWhip>("billWhips")
    .find({
      targetType,
      targetId: storedTargetId,
      chamber,
      partyId: partyIdStr,
      issuedBy: "nationalParty",
      audience: "character",
      ...(whipWindowStart ? { createdAt: { $gte: whipWindowStart } } : {}),
    })
    .toArray();
  const existingSameModeWhip = existingCharacterWhips.find(
    (whip) => (whip.mode ?? "hard") === mode
  );
  if (existingSameModeWhip) {
    return fail(
      400,
      `A ${mode === "soft" ? "Soft" : "Hard"} Player Whip has already been issued on this target`
    );
  }

  const eligible = await getEligibleCharactersForWhip(db, countryId, partyIdStr, chamber);

  // Insert audit row first so failures in the apply step leave a trace
  const pwNow = new Date();
  const playerWhipDoc: Omit<BillWhip, "_id"> = {
    targetType,
    targetId: storedTargetId,
    chamber,
    direction,
    candidacyId: candidacyId ? new ObjectId(candidacyId) : undefined,
    issuedBy: "nationalParty",
    countryId,
    partyId: partyIdStr,
    issuedByCharacterId: characterId,
    issuedByRole: issuerRole,
    audience: "character",
    mode,
    attemptNumber: 1,
    createdAt: pwNow,
    updatedAt: pwNow,
  };
  const pwInsert = await db.collection<BillWhip>("billWhips").insertOne(playerWhipDoc as BillWhip);

  recordAudit({
    source: "api",
    action: "party.whip",
    category: "party",
    actor: { kind: "player", userId: undefined, characterId, name: character.name },
    subject: { type: playerWhipDoc.targetType, id: playerWhipDoc.targetId },
    counterparty: { type: "party", id: partyIdStr, name: party.name },
    refs: { partyId: partyIdStr },
    outcome: "ok",
    meta: {
      billWhipId: pwInsert.insertedId,
      chamber,
      direction,
      mode,
      audience: "character",
      issuerRole,
    },
  });

  const { subject, notificationTitle } = await buildPlayerWhipMessage(
    db,
    targetType,
    storedTargetId,
    direction,
    mode
  );

  const charDocs =
    eligible.length > 0
      ? await charactersCollection(db)
          .find({ _id: { $in: eligible } })
          .project<{
            _id: ObjectId;
            name: string;
            userId: ObjectId;
            sequentialId?: number;
          }>({ _id: 1, name: 1, userId: 1, sequentialId: 1 })
          .toArray()
      : [];

  let mailedCount = 0;
  try {
    await createNotifications(
      charDocs.map((char) => ({
        userId: char.userId,
        type: "party_whip_issued" as const,
        title: notificationTitle,
        message: subject,
        metadata: {
          targetType,
          targetId: typeof storedTargetId === "string" ? storedTargetId : storedTargetId.toString(),
          direction,
          mode,
        },
      }))
    );
    mailedCount = charDocs.length;
  } catch (err) {
    console.warn("[player-whip] Failed to notify recipients", err);
  }

  return {
    ok: true,
    body: {
      success: true,
      whipId: pwInsert.insertedId.toString(),
      audience: "character",
      mode,
      affected: 0,
      alreadyAligned: 0,
      mailedCount,
      message: `Soft Player Whip issued. ${mailedCount} players notified.`,
    },
  };
}

async function issueNppWhip(
  { db, countryId, party, partyIdStr, character, issuerRole }: WhipIssuer,
  { targetType, chamber, direction, mode, candidacyId }: NationalPartyWhipRequest,
  { targetOid, storedTargetId }: ResolvedTarget,
  existingWhipCount: number
): Promise<IssueNationalPartyWhipResult> {
  const characterId = character._id;
  const attemptNumber = (existingWhipCount + 1) as 1 | 2;

  const now = new Date();
  const whipDoc: Omit<BillWhip, "_id"> = {
    targetType,
    targetId: storedTargetId,
    chamber,
    direction,
    mode,
    candidacyId: candidacyId ? new ObjectId(candidacyId) : undefined,
    issuedBy: "nationalParty",
    countryId,
    partyId: partyIdStr,
    issuedByCharacterId: characterId,
    issuedByRole: issuerRole,
    audience: "npp",
    attemptNumber,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection<BillWhip>("billWhips").insertOne(whipDoc as BillWhip);

  recordAudit({
    source: "api",
    action: "party.whip",
    category: "party",
    actor: { kind: "player", userId: undefined, characterId, name: character.name },
    subject: { type: whipDoc.targetType, id: whipDoc.targetId },
    counterparty: { type: "party", id: partyIdStr, name: party.name },
    refs: { partyId: partyIdStr },
    outcome: "ok",
    meta: {
      billWhipId: result.insertedId,
      chamber,
      direction,
      mode,
      audience: "npp",
      issuerRole,
    },
  });

  // Fetch party NPPs in this chamber and cast their votes immediately
  const nppOfficials = await electedOfficialsCollection(db)
    .find({
      isNPP: true,
      // Country-scope officials: party sequentialIds collide across
      // countries, so without this filter a whip also fetches and votes
      // foreign senators of the same numeric party onto a domestic bill.
      countryId,
      party: partyIdStr,
      // Resolve the chamber key to the office type members are stored under
      // (CN: "npc" key → "npcDelegate" office), else zero CN delegates match
      // and the whip falls on nobody.
      officeType: getOfficeTypeForChamber(countryId, chamber),
    })
    .toArray();

  const nppIds = nppOfficials.map((o) => o.nppId).filter((id): id is ObjectId => !!id);

  const npps =
    nppIds.length > 0
      ? await nppsCollection(db)
          .find({ _id: { $in: nppIds } })
          .toArray()
      : [];

  const nppMap = new Map(npps.map((n) => [n._id.toString(), n]));

  // Statecraft sharpens a chair's whip: higher stat → more NPPs fall in line.
  // Use-growth: whipping trains Statecraft (flushed each turn). Both apply
  // across every NPP whip target (bill, leadership, government, cabinet).
  const whipStatecraftBonus = statecraftWhipBonus(character.stats?.statecraft);

  let r: { fellInLine: number; ignored: number } | null = null;
  if (targetType === "bill") {
    const bill = await db
      .collection<Bill>("bills")
      .findOne({ _id: requireObjectId(targetOid), countryId });
    if (bill) {
      // applyWhipVotesToBill resolves NPP votes via cross-pressure, which needs
      // the bill's legislation type, the home-state demographics for each NPP,
      // and the current turn for the prediction snapshot.
      const [legislationType, stateDemographicsArr, gameStateDoc] = await Promise.all([
        bill.legislationTypeId
          ? db
              .collection<LegislationType>("legislationTypes")
              .findOne({ _id: bill.legislationTypeId })
          : Promise.resolve(null),
        db
          .collection<StateDemographics>("stateDemographics")
          .find({
            _id: {
              $in: [
                ...new Set(
                  [...nppMap.values()]
                    .map((n) => n.homeState)
                    .filter((s): s is string => typeof s === "string")
                ),
              ],
            },
          })
          .toArray(),
        gameStateCollection(db).findOne({ _id: "current" }, { projection: { currentTurn: 1 } }),
      ]);
      const stateDemographicsByState = new Map(stateDemographicsArr.map((s) => [s._id, s]));
      r = await applyWhipVotesToBill(
        db,
        bill,
        direction,
        nppOfficials,
        nppMap,
        {
          legislationType,
          stateDemographicsByState,
          currentTurn: gameStateDoc?.currentTurn ?? 0,
        },
        mode,
        whipStatecraftBonus
      );
    }
  } else if (
    (targetType === "speakerElection" || targetType === "leadershipElection") &&
    candidacyId
  ) {
    r = await applyWhipVotesToLeadership(
      db,
      new ObjectId(candidacyId),
      leadershipNominationCollection(targetType, chamber),
      nppOfficials,
      nppMap,
      mode,
      whipStatecraftBonus
    );
  } else if (targetType === "pmAppointmentVote" || targetType === "noConfidenceVote") {
    r = await applyWhipVotesToGovernmentVote(
      db,
      requireObjectId(targetOid),
      targetType,
      direction,
      nppOfficials,
      nppMap,
      mode,
      whipStatecraftBonus
    );
  } else if (targetType === "cabinetNomination" || targetType === "scotusNomination") {
    r = await applyWhipVotesToCabinet(
      db,
      requireObjectId(targetOid),
      direction,
      nppOfficials,
      nppMap,
      mode,
      whipStatecraftBonus,
      targetType === "scotusNomination" ? "scotusNominations" : "cabinetNominations"
    );
  } else if (targetType === "speakerVacateMotion") {
    r = await applyWhipVotesToVacateMotion(
      db,
      direction,
      nppOfficials,
      nppMap,
      mode,
      whipStatecraftBonus
    );
  } else if (targetType === "impeachmentVote") {
    r = await applyWhipVotesToImpeachment(
      db,
      requireObjectId(targetOid),
      direction,
      nppOfficials,
      nppMap,
      mode,
      whipStatecraftBonus
    );
  }

  let fellInLine = 0;
  let ignored = 0;
  if (r) {
    fellInLine = r.fellInLine;
    ignored = r.ignored;
    if (character.stats) {
      await charactersCollection(db).updateOne(
        { _id: characterId },
        { $inc: { "statXp.statecraft": USE_GROWTH_INCREMENT } }
      );
    }
  }

  const ignoredFlavor = ["defied the whip", "remained unconvinced", "stood their ground"][
    Math.floor(Math.random() * 3)
  ];
  const message =
    targetType === "bill" && mode === "soft"
      ? `Soft whip directive issued (attempt ${attemptNumber}/2). This advisory pressure will feed into future NPP bill votes.`
      : `Whip directive issued (attempt ${attemptNumber}/2). ${fellInLine} NPPs fell in line. ${ignored} NPPs ${ignoredFlavor}.`;

  return {
    ok: true,
    body: {
      success: true,
      whipId: result.insertedId.toString(),
      attemptNumber,
      fellInLine,
      ignored,
      ignoredFlavor,
      message,
    },
  };
}
