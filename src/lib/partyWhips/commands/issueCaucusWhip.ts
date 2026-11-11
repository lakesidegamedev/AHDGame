import { NextResponse } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import type { PoliticalParty } from "@/lib/db/types";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { findCaucusBySlug, listCaucusMemberships } from "@/lib/db/caucusLookup";
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
import { createNotification } from "@/lib/notifications";
import {
  getCabinetWhipChamber,
  getConfidenceWhipChamber,
  getChamberLeaderRole,
} from "@/lib/partyWhips/constraints";
import { getOfficeTypeForChamber } from "@/lib/legislature/chamberOfficeType";
import { getGameTime } from "@/lib/time/gameTime";
import { isLeadershipElectionClosed } from "@/lib/congress/leadershipElections";
import { impeachmentStageChamberKey } from "@/lib/impeachment/impeachmentTally";
import type { Impeachment } from "@/lib/db/types/impeachment";
import { getBillWhipWindowStart } from "@/lib/congress/billWhipPhase";
import type {
  Bill,
  BillWhip,
  CabinetNomination,
  Character,
  ElectedOfficial,
  GameState,
  LegislationType,
  NPP,
  PlayerWhipMode,
  SpeakerVacateMotion,
  StateDemographics,
  User,
  WhipIssuerRole,
} from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { billsCollection } from "@/lib/db/repositories/bills";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
import { usersCollection } from "@/lib/db/repositories/users";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";
import { cabinetNominationsCollection } from "@/lib/db/repositories/cabinetNominations";
import { billWhipsCollection } from "@/lib/db/repositories/billWhips";
import { speakerElectionsCollection } from "@/lib/db/repositories/speakerElections";
import type { Document } from "mongodb";
import { leadershipElectionsCollection } from "@/lib/db/repositories/leadershipElections";
import { impeachmentsCollection } from "@/lib/db/repositories/impeachments";
import { speakerVacateMotionsCollection } from "@/lib/db/repositories/speakerVacateMotions";

export const caucusWhipSchema = z
  .object({
    targetType: z.enum([
      "bill",
      "speakerElection",
      "leadershipElection",
      "pmAppointmentVote",
      "noConfidenceVote",
      "cabinetNomination",
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

async function getEligibleCaucusCharactersForWhip(
  db: Db,
  countryId: CountryId,
  partyId: string,
  chamber: string,
  caucusCharacterIds: ObjectId[],
  stateId?: string
): Promise<ObjectId[]> {
  if (caucusCharacterIds.length === 0) return [];

  const officials = await electedOfficialsCollection(db)
    .find({
      isNPP: false,
      party: partyId,
      // CN: resolve chamber key "npc" → office type "npcDelegate" (no-op for
      // other countries) so caucus officials actually match.
      officeType: getOfficeTypeForChamber(countryId, chamber),
      countryId,
      ...(stateId ? { state: stateId } : {}),
      characterId: { $in: caucusCharacterIds },
    })
    .toArray();

  if (officials.length === 0) return [];
  const characterIds = officials
    .map((official) => official.characterId)
    .filter((id): id is ObjectId => id != null);
  if (characterIds.length === 0) return [];

  const characters = await charactersCollection(db)
    .find({ _id: { $in: characterIds } })
    .project<{ _id: ObjectId; userId: ObjectId }>({ _id: 1, userId: 1 })
    .toArray();

  const userIdsByChar = new Map(
    characters.map((character) => [character._id.toString(), character.userId])
  );
  const userIds = Array.from(
    new Set(characters.map((character) => character.userId.toString()))
  ).map((id) => characters.find((character) => character.userId.toString() === id)!.userId);

  const bannedUsers = await usersCollection(db)
    .find({ _id: { $in: userIds }, isBanned: true })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray();
  const bannedUserIds = new Set(bannedUsers.map((user) => user._id.toString()));

  return characterIds.filter((characterId) => {
    const userId = userIdsByChar.get(characterId.toString());
    if (!userId) return false;
    return !bannedUserIds.has(userId.toString());
  });
}

async function buildCaucusPlayerWhipMessage(
  db: Db,
  caucusName: string,
  targetType: string,
  targetId: ObjectId | string,
  direction: "for" | "against",
  mode: PlayerWhipMode
): Promise<{ subject: string; body: string; notificationTitle: string }> {
  const dir = direction === "for" ? "AYE" : "NAY";
  const isSoft = mode === "soft";
  const notificationTitle = isSoft ? "Caucus vote recommendation" : "Caucus whip issued";
  const prefix = isSoft ? `${caucusName} suggests` : `${caucusName} has whipped you`;

  if (targetType === "bill" && targetId instanceof ObjectId) {
    const bill = await billsCollection(db).findOne({ _id: targetId }, { projection: { title: 1 } });
    const title = bill?.title ?? "a bill";
    return {
      subject: isSoft
        ? `${caucusName}: Vote ${dir} on "${title}"`
        : `${caucusName} whip: Vote ${dir} on "${title}"`,
      body: isSoft
        ? `${prefix} you vote ${dir} on "${title}". Review the bill page if you want to follow the recommendation.`
        : `${prefix} to vote ${dir} on "${title}". You may change your vote at any time by visiting the bill's voting page.`,
      notificationTitle,
    };
  }

  const targetLabel =
    targetType === "pmAppointmentVote"
      ? "the PM appointment vote"
      : targetType === "noConfidenceVote"
        ? "the no-confidence motion"
        : targetType === "cabinetNomination"
          ? "the cabinet nomination"
          : targetType === "speakerVacateMotion"
            ? "the motion to vacate the chair"
            : targetType === "impeachmentVote"
              ? "the impeachment"
              : "the assigned leadership vote";

  return {
    subject: isSoft ? `${caucusName}: Vote ${dir}` : `${caucusName} whip: Vote ${dir}`,
    body: isSoft
      ? `${prefix} you vote ${dir} on ${targetLabel}.`
      : `${prefix} to vote ${dir} on ${targetLabel}. You may change your vote at any time.`,
    notificationTitle,
  };
}

export type CaucusWhipInput = z.infer<typeof caucusWhipSchema>;

type Caucus = NonNullable<Awaited<ReturnType<typeof findCaucusBySlug>>>["caucus"];

/** Issues a caucus-only whip directive, returning the HTTP response for the route to send. */
export async function issueCaucusWhip({
  db,
  countryId,
  party,
  caucus,
  character,
  isAdmin,
  input,
}: {
  db: Db;
  countryId: CountryId;
  party: PoliticalParty;
  caucus: Caucus;
  character: Character;
  isAdmin: boolean;
  input: CaucusWhipInput;
}): Promise<NextResponse> {
  const { targetType, targetId, chamber, direction, mode, candidacyId, audience } = input;
  const partyIdStr = String(party.sequentialId);
  const isChair = caucus.chairId?.equals(character._id) ?? false;
  const chamberLeaderRole = await getChamberLeaderRole(db, character._id, chamber, partyIdStr);
  const issuerRole: WhipIssuerRole =
    chamberLeaderRole ?? (isChair ? "chair" : isAdmin ? "admin" : "chair");

  if (!isChair && !isAdmin && !chamberLeaderRole) {
    return NextResponse.json(
      forbidden("Only the Caucus Chair or chamber leadership can issue caucus whips").toJson(),
      {
        status: 403,
      }
    );
  }

  const memberships = await listCaucusMemberships(db, caucus._id);
  const caucusCharacterIds = memberships
    .filter((membership) => membership.memberType === "character")
    .map((membership) => membership.memberId);
  const caucusNppIds = memberships
    .filter((membership) => membership.memberType === "npp")
    .map((membership) => membership.memberId);

  const confidenceChamber = getConfidenceWhipChamber(countryId);
  const cabinetChamber = getCabinetWhipChamber(countryId);
  // The motion to vacate is a singleton keyed "current"; pin it server-side so
  // a client cannot address some other document through this target type.
  const normalizedTargetId =
    targetType === "speakerVacateMotion"
      ? "current"
      : countryId === COUNTRY_CONFIGS.US.id &&
          targetType === "speakerElection" &&
          targetId === "current"
        ? "current"
        : targetId;
  const targetOid = ObjectId.isValid(normalizedTargetId) ? new ObjectId(normalizedTargetId) : null;
  const isUSCongressLeadershipTarget =
    countryId === COUNTRY_CONFIGS.US.id &&
    (targetType === "speakerElection" || targetType === "leadershipElection");
  const storedTargetId: ObjectId | string =
    isUSCongressLeadershipTarget || targetType === "speakerVacateMotion"
      ? normalizedTargetId
      : (targetOid ?? normalizedTargetId);

  // Leadership-style targets reuse a stable _id ("current" for the Speaker
  // election and the vacate motion, the role name for chamber leaders), so
  // whips from a previous instance would otherwise count against the current
  // one's attempt cap and freeze the panel (ticket #959). Each branch below
  // sets this to the instant its target opened.
  let whipWindowStart: Date | undefined;
  const requireTargetObjectId = (): ObjectId => {
    if (!targetOid) throw badRequest("Invalid target ID");
    return targetOid;
  };

  // Speaker/leadership-election whips route to US-only collections in the
  // apply phase. Reject for German chambers, which use PM appointment /
  // no-confidence votes for executive selection.
  if (
    (targetType === "speakerElection" || targetType === "leadershipElection") &&
    (chamber === "bundestag" || chamber === "landtag")
  ) {
    return NextResponse.json(
      badRequest(
        "Leadership election whips are not supported for German chambers. Use PM appointment or no-confidence vote whips instead."
      ).toJson(),
      { status: 400 }
    );
  }

  let billStateId: string | undefined;
  if (targetType === "bill") {
    if (!targetOid) {
      return NextResponse.json(badRequest("Invalid target ID").toJson(), { status: 400 });
    }
    const bill = await billsCollection(db).findOne({
      _id: targetOid,
      status: {
        $in: ["active", "active_other", "active_both", "veto_override", "override_shugiin"],
      },
      $or: [{ countryId }, { countryId: { $exists: false } }],
    });
    if (!bill) {
      return NextResponse.json(notFound("Bill not found or voting not open").toJson(), {
        status: 404,
      });
    }
    whipWindowStart = getBillWhipWindowStart(bill);
    billStateId = bill.stateId;
  } else if (targetType === "speakerElection") {
    const speakerElection = isUSCongressLeadershipTarget
      ? normalizedTargetId === "current"
        ? await speakerElectionsCollection<{ _id: string; status: string; startedAt?: Date }>(
            db
          ).findOne({
            _id: "current",
            status: "voting",
          })
        : null
      : targetOid
        ? await speakerElectionsCollection<Document>(db).findOne({
            _id: targetOid,
            status: "active",
          })
        : null;
    if (!speakerElection) {
      return NextResponse.json(notFound("Speaker election not found or not active").toJson(), {
        status: 404,
      });
    }
    if (isUSCongressLeadershipTarget) {
      whipWindowStart = (speakerElection as { startedAt?: Date }).startedAt;
    }
    if (!candidacyId) {
      return NextResponse.json(badRequest("candidacyId required for leadership whips").toJson(), {
        status: 400,
      });
    }
  } else if (targetType === "leadershipElection") {
    const leadershipElection = isUSCongressLeadershipTarget
      ? await db
          .collection<{
            _id: string;
            status: string;
            startedAt?: Date;
          }>(chamber === "senate" ? "senateLeadershipElections" : "houseLeadershipElections")
          .findOne({ _id: normalizedTargetId, status: "voting" })
      : targetOid
        ? await leadershipElectionsCollection<Document>(db).findOne({
            _id: targetOid,
            status: "active",
          })
        : null;
    if (!leadershipElection) {
      return NextResponse.json(notFound("Leadership election not found or not active").toJson(), {
        status: 404,
      });
    }
    if (isUSCongressLeadershipTarget) {
      whipWindowStart = (leadershipElection as { startedAt?: Date }).startedAt;
    }
    if (!candidacyId) {
      return NextResponse.json(badRequest("candidacyId required for leadership whips").toJson(), {
        status: 400,
      });
    }
  } else if (targetType === "pmAppointmentVote") {
    if (!targetOid) {
      return NextResponse.json(badRequest("Invalid target ID").toJson(), { status: 400 });
    }
    const pmVote = await getPMAppointmentVotesCollection(db).findOne({
      _id: targetOid,
      status: "active",
    });
    if (!pmVote || pmVote.countryId !== countryId) {
      return NextResponse.json(notFound("PM appointment vote not found or not active").toJson(), {
        status: 404,
      });
    }
    if (chamber !== confidenceChamber) {
      return NextResponse.json(
        badRequest(`PM appointment votes can only be whipped in the ${confidenceChamber}`).toJson(),
        { status: 400 }
      );
    }
  } else if (targetType === "noConfidenceVote") {
    if (!targetOid) {
      return NextResponse.json(badRequest("Invalid target ID").toJson(), { status: 400 });
    }
    const ncVote = await getNoConfidenceVotesCollection(db).findOne({
      _id: targetOid,
      status: "active",
    });
    if (!ncVote || ncVote.countryId !== countryId) {
      return NextResponse.json(notFound("No-confidence vote not found or not active").toJson(), {
        status: 404,
      });
    }
    if (chamber !== confidenceChamber) {
      return NextResponse.json(
        badRequest(`No-confidence votes can only be whipped in the ${confidenceChamber}`).toJson(),
        { status: 400 }
      );
    }
  } else if (targetType === "speakerVacateMotion") {
    if (countryId !== COUNTRY_CONFIGS.US.id) {
      return NextResponse.json(
        badRequest("Motions to vacate are only held in the US House").toJson(),
        { status: 400 }
      );
    }
    if (chamber !== confidenceChamber) {
      return NextResponse.json(
        badRequest(`Motions to vacate can only be whipped in the ${confidenceChamber}`).toJson(),
        { status: 400 }
      );
    }
    const motion = await speakerVacateMotionsCollection(db).findOne({
      _id: "current",
      status: "voting",
    });
    // Resolution is lazy (on read of the Speaker page), so a motion can sit in
    // "voting" past its deadline. Gate on the clock as well as the status, or
    // a chair could whip a motion that is already over.
    const vacateGameTime = motion ? await getGameTime() : null;
    if (
      !motion ||
      !vacateGameTime ||
      isLeadershipElectionClosed(motion, vacateGameTime.currentTurn, vacateGameTime.effectiveNow)
    ) {
      return NextResponse.json(notFound("No motion to vacate is currently open").toJson(), {
        status: 404,
      });
    }
    whipWindowStart = motion.startedAt;
  } else if (targetType === "impeachmentVote") {
    if (!targetOid) {
      return NextResponse.json(badRequest("Invalid target ID").toJson(), { status: 400 });
    }
    const impeachment = await impeachmentsCollection(db).findOne({
      _id: targetOid,
      countryId,
      stage: { $in: ["house", "senate"] },
    });
    if (!impeachment) {
      return NextResponse.json(
        notFound("Impeachment not found or no longer open for voting").toJson(),
        { status: 404 }
      );
    }
    if (impeachment.targetOffice === "governor") {
      return NextResponse.json(
        badRequest("Governor impeachments are whipped from the state party").toJson(),
        { status: 400 }
      );
    }
    const stageChamber = impeachmentStageChamberKey(impeachment);
    if (!stageChamber || chamber !== stageChamber) {
      return NextResponse.json(
        badRequest(
          `This impeachment is being voted in the ${stageChamber ?? "no open"} chamber`
        ).toJson(),
        { status: 400 }
      );
    }
    const stageEndsOnTurn =
      impeachment.stage === "house"
        ? impeachment.houseVotingEndsOnTurn
        : impeachment.senateVotingEndsOnTurn;
    const impeachGameTime = await getGameTime();
    if (stageEndsOnTurn != null && impeachGameTime.currentTurn > stageEndsOnTurn) {
      return NextResponse.json(notFound("Voting for this impeachment stage has closed").toJson(), {
        status: 404,
      });
    }
  } else if (targetType === "cabinetNomination") {
    if (!targetOid) {
      return NextResponse.json(badRequest("Invalid target ID").toJson(), { status: 400 });
    }
    const nomination = await cabinetNominationsCollection(db).findOne({
      _id: targetOid,
      status: "active",
    });
    if (!nomination || nomination.countryId !== countryId) {
      return NextResponse.json(notFound("Cabinet nomination not found or not active").toJson(), {
        status: 404,
      });
    }
    if (chamber !== cabinetChamber) {
      return NextResponse.json(
        badRequest(`Cabinet nominations can only be whipped in the ${cabinetChamber}`).toJson(),
        { status: 400 }
      );
    }
  }

  const existingWhips = await billWhipsCollection(db)
    .find({
      targetType,
      targetId: storedTargetId,
      chamber,
      partyId: partyIdStr,
      issuedBy: "caucus",
      caucusId: caucus._id,
      ...(audience === "npp"
        ? { $or: [{ audience: "npp" }, { audience: { $exists: false } }] }
        : {}),
      ...(whipWindowStart ? { createdAt: { $gte: whipWindowStart } } : {}),
    })
    .toArray();

  if (audience === "npp" && existingWhips.length >= 2) {
    return NextResponse.json(
      badRequest("Maximum 2 whip attempts per bill/chamber reached").toJson(),
      { status: 400 }
    );
  }

  if (audience === "character") {
    const existingCharacterWhips = await billWhipsCollection(db)
      .find({
        targetType,
        targetId: storedTargetId,
        chamber,
        partyId: partyIdStr,
        issuedBy: "caucus",
        caucusId: caucus._id,
        audience: "character",
        ...(whipWindowStart ? { createdAt: { $gte: whipWindowStart } } : {}),
      })
      .toArray();
    const existingSameModeWhip = existingCharacterWhips.find(
      (whip) => (whip.mode ?? "hard") === mode
    );
    if (existingSameModeWhip) {
      return NextResponse.json(
        badRequest(
          `A ${mode === "soft" ? "Soft" : "Hard"} Player Whip has already been issued on this target`
        ).toJson(),
        { status: 400 }
      );
    }

    const eligible = await getEligibleCaucusCharactersForWhip(
      db,
      countryId,
      partyIdStr,
      chamber,
      caucusCharacterIds,
      chamber === "stateSenate" ? billStateId : undefined
    );
    const playerWhipDoc: Omit<BillWhip, "_id"> = {
      targetType,
      targetId: storedTargetId,
      chamber,
      direction,
      candidacyId: candidacyId ? new ObjectId(candidacyId) : undefined,
      issuedBy: "caucus",
      caucusId: caucus._id,
      countryId,
      stateId: chamber === "stateSenate" ? billStateId : undefined,
      partyId: partyIdStr,
      issuedByCharacterId: character._id,
      issuedByRole: issuerRole,
      audience: "character",
      mode,
      attemptNumber: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const insert = await billWhipsCollection(db).insertOne(playerWhipDoc as BillWhip);

    const { subject, notificationTitle } = await buildCaucusPlayerWhipMessage(
      db,
      caucus.name,
      targetType,
      storedTargetId,
      direction,
      mode
    );

    const characterDocs =
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
    for (const character of characterDocs) {
      try {
        await createNotification({
          userId: character.userId,
          type: "party_whip_issued",
          title: notificationTitle,
          message: subject,
          metadata: {
            targetType,
            targetId:
              typeof storedTargetId === "string" ? storedTargetId : storedTargetId.toString(),
            direction,
            mode,
            caucusId: caucus._id.toString(),
          },
        });
        mailedCount++;
      } catch (error) {
        console.warn(
          "[caucus-player-whip] Failed to notify character",
          String(character._id),
          error
        );
      }
    }

    return NextResponse.json({
      success: true,
      whipId: insert.insertedId.toString(),
      audience: "character",
      mode,
      affected: 0,
      alreadyAligned: 0,
      mailedCount,
      message: `Soft caucus whip issued. ${mailedCount} caucus players notified.`,
    });
  }

  const attemptNumber = (existingWhips.length + 1) as 1 | 2;
  const whipDoc: Omit<BillWhip, "_id"> = {
    targetType,
    targetId: storedTargetId,
    chamber,
    direction,
    mode,
    candidacyId: candidacyId ? new ObjectId(candidacyId) : undefined,
    issuedBy: "caucus",
    caucusId: caucus._id,
    countryId,
    stateId: chamber === "stateSenate" ? billStateId : undefined,
    partyId: partyIdStr,
    issuedByCharacterId: character._id,
    issuedByRole: issuerRole,
    audience: "npp",
    attemptNumber,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const insert = await billWhipsCollection(db).insertOne(whipDoc as BillWhip);

  const nppOfficials = await electedOfficialsCollection(db)
    .find({
      isNPP: true,
      // Party sequentialIds collide across countries, so scope officials to this
      // country explicitly for consistency with the other whip routes.
      countryId,
      party: partyIdStr,
      // Resolve the chamber key to the office type members are stored under
      // (CN: "npc" → "npcDelegate"), else the caucus whip on a CN federal bill
      // matches zero delegates and falls on nobody.
      officeType: getOfficeTypeForChamber(countryId, chamber),
      ...(chamber === "stateSenate" && billStateId ? { state: billStateId } : {}),
      nppId: { $in: caucusNppIds },
    })
    .toArray();
  const nppIds = nppOfficials
    .map((official) => official.nppId)
    .filter((id): id is ObjectId => !!id);
  const npps =
    nppIds.length > 0
      ? await nppsCollection(db)
          .find({ _id: { $in: nppIds } })
          .toArray()
      : [];
  const nppMap = new Map(npps.map((npp) => [npp._id.toString(), npp]));

  let fellInLine = 0;
  let ignored = 0;
  // Statecraft sharpens a caucus chair's whip and trains the stat (use-growth).
  const actorCharacter = character;
  const whipStatecraftBonus = statecraftWhipBonus(actorCharacter.stats?.statecraft);
  const grantStatecraftXp = async () => {
    await charactersCollection(db).updateOne(
      { _id: actorCharacter._id },
      { $inc: { "statXp.statecraft": USE_GROWTH_INCREMENT } }
    );
  };
  if (targetType === "bill") {
    const bill = await billsCollection(db).findOne({ _id: requireTargetObjectId(), countryId });
    if (bill) {
      const [legislationType, stateDemographicsArr, gameStateDoc] = await Promise.all([
        bill.legislationTypeId
          ? legislationTypesCollection(db).findOne({ _id: bill.legislationTypeId })
          : Promise.resolve(null),
        stateDemographicsCollection(db)
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
      const stateDemographicsByState = new Map(stateDemographicsArr.map((row) => [row._id, row]));
      const result = await applyWhipVotesToBill(
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
      fellInLine = result.fellInLine;
      ignored = result.ignored;
      if (actorCharacter.stats) await grantStatecraftXp();
    }
  } else if (
    (targetType === "speakerElection" || targetType === "leadershipElection") &&
    candidacyId
  ) {
    const collection =
      targetType === "speakerElection"
        ? "speakerNominations"
        : chamber === "senate"
          ? "senateLeadershipNominations"
          : "houseLeadershipNominations";
    const result = await applyWhipVotesToLeadership(
      db,
      new ObjectId(candidacyId),
      collection,
      nppOfficials,
      nppMap,
      mode,
      whipStatecraftBonus
    );
    fellInLine = result.fellInLine;
    ignored = result.ignored;
    if (actorCharacter.stats) await grantStatecraftXp();
  } else if (targetType === "pmAppointmentVote" || targetType === "noConfidenceVote") {
    const result = await applyWhipVotesToGovernmentVote(
      db,
      requireTargetObjectId(),
      targetType,
      direction,
      nppOfficials,
      nppMap,
      mode,
      whipStatecraftBonus
    );
    fellInLine = result.fellInLine;
    ignored = result.ignored;
    if (actorCharacter.stats) await grantStatecraftXp();
  } else if (targetType === "cabinetNomination") {
    const result = await applyWhipVotesToCabinet(
      db,
      requireTargetObjectId(),
      direction,
      nppOfficials,
      nppMap,
      mode,
      whipStatecraftBonus
    );
    fellInLine = result.fellInLine;
    ignored = result.ignored;
    if (actorCharacter.stats) await grantStatecraftXp();
  } else if (targetType === "speakerVacateMotion") {
    const result = await applyWhipVotesToVacateMotion(
      db,
      direction,
      nppOfficials,
      nppMap,
      mode,
      whipStatecraftBonus
    );
    fellInLine = result.fellInLine;
    ignored = result.ignored;
    if (actorCharacter.stats) await grantStatecraftXp();
  } else if (targetType === "impeachmentVote") {
    const result = await applyWhipVotesToImpeachment(
      db,
      requireTargetObjectId(),
      direction,
      nppOfficials,
      nppMap,
      mode,
      whipStatecraftBonus
    );
    fellInLine = result.fellInLine;
    ignored = result.ignored;
    if (actorCharacter.stats) await grantStatecraftXp();
  }

  const ignoredFlavor = ["defied the whip", "remained unconvinced", "stood their ground"][
    Math.floor(Math.random() * 3)
  ];
  const message =
    targetType === "bill" && mode === "soft"
      ? `Soft caucus whip directive issued (attempt ${attemptNumber}/2). This advisory pressure will feed into future caucus member bill votes.`
      : `Caucus whip directive issued (attempt ${attemptNumber}/2). ${fellInLine} members fell in line. ${ignored} members ${ignoredFlavor}.`;

  return NextResponse.json({
    success: true,
    whipId: insert.insertedId.toString(),
    attemptNumber,
    fellInLine,
    ignored,
    ignoredFlavor,
    message,
  });
}
