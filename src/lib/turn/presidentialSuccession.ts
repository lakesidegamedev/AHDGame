import type { Db } from "mongodb";
import type { Character, CareerEvent, OfficeType } from "@/lib/db/types";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getExecutiveOfficialFilter } from "@/lib/elections/executiveOfficeFilters";
import { getOfficeLabel } from "@/lib/utils/officeTitle";
import { createNotifications } from "@/lib/notifications";
import { vacateNonExecutiveOfficesForExecutive } from "@/lib/elections/vacateOfficesForExecutive";
import {
  hasReachedExecutiveTermLimit,
  incrementExecutiveTermsServedUpdate,
} from "@/lib/elections/executiveTermLimits";
import { captureOfficeTransition } from "@/lib/analytics/officeTransitionAnalytics";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getNppsCollection } from "@/lib/db/collections/npps";
import { getGameStateCollection } from "@/lib/db/collections/gameState";

/**
 * Checks if a president office is vacant and a VP exists (US by default; other
 * countries whose succession rule is a permanent deputy).
 * If so, auto-promotes the VP to President and clears the VP office.
 * Runs each turn after election resolution (Group 11.5).
 */
export async function processPresidentialSuccession(
  db: Db,
  countryId: CountryId = COUNTRY_CONFIGS.US.id
): Promise<boolean> {
  const usCountryId = countryId;
  const officeName =
    countryId === COUNTRY_CONFIGS.US.id
      ? "President of the United States"
      : `President of ${COUNTRY_CONFIGS[countryId].name}`;
  const presidentRecord = await (
    await getElectedOfficialsCollection(db)
  ).findOne(getExecutiveOfficialFilter(usCountryId, "president"));

  // No record at all means no election has ever happened; nothing to do.
  if (!presidentRecord) return false;

  // Not vacant if a character or NPP is assigned.
  const presidentVacant = presidentRecord.characterId === null && !presidentRecord.nppId;
  if (!presidentVacant) return false;

  const vpRecord = await (
    await getElectedOfficialsCollection(db)
  ).findOne(getExecutiveOfficialFilter(usCountryId, "vicePresident"));

  const vpFilled = vpRecord && (vpRecord.characterId !== null || vpRecord.nppId);
  if (!vpFilled || !vpRecord) return false;

  const now = new Date();
  let vpCharacter: Pick<
    Character,
    "_id" | "careerHistory" | "party" | "executiveTermsServed" | "userId" | "name"
  > | null = null;

  if (vpRecord.characterId) {
    vpCharacter = await (
      await getCharactersCollection(db)
    ).findOne(
      { _id: vpRecord.characterId },
      {
        projection: {
          _id: 1,
          careerHistory: 1,
          party: 1,
          executiveTermsServed: 1,
          userId: 1,
          name: 1,
        },
      }
    );
    if (!vpCharacter) return false;
    if (hasReachedExecutiveTermLimit(vpCharacter, usCountryId)) {
      console.warn(
        `[Turn] Presidential succession blocked: VP ${vpRecord.characterId.toString()} has already reached the presidential term limit in ${countryId}`
      );
      return false;
    }
  }

  // Promote VP to President in electedOfficials only after confirming the move is legal.
  await (
    await getElectedOfficialsCollection(db)
  ).updateOne(
    getExecutiveOfficialFilter(usCountryId, "president"),
    {
      $set: {
        countryId: usCountryId,
        characterId: vpRecord.characterId,
        characterName: vpRecord.characterName,
        party: vpRecord.party,
        isNPP: vpRecord.isNPP ?? false,
        ...(vpRecord.nppId ? { nppId: vpRecord.nppId } : {}),
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  if (vpRecord.characterId && vpCharacter) {
    const presidentOffice: OfficeType = { type: "president" };
    const successionCareer: CareerEvent = {
      type: "appointed",
      office: presidentOffice,
      officeLabel: getOfficeLabel(presidentOffice, usCountryId),
      date: now,
    };
    if (vpCharacter.party) {
      successionCareer.party = vpCharacter.party;
      successionCareer.partyCountryId = usCountryId;
    }
    await (
      await getCharactersCollection(db)
    ).updateOne(
      { _id: vpRecord.characterId },
      {
        $set: {
          currentOffice: presidentOffice,
          updatedAt: now,
          ...incrementExecutiveTermsServedUpdate(vpCharacter, usCountryId),
        },
        $push: { careerHistory: successionCareer },
      }
    );

    try {
      const { checkOfficeHeldAchievements } = await import("@/lib/achievements/triggers");
      await checkOfficeHeldAchievements(vpCharacter.userId, vpRecord.characterId, "president");
    } catch (e) {
      console.error("President achievement check failed:", e);
    }

    await createNotifications([
      {
        userId: vpCharacter.userId,
        type: "general_win",
        title: `Succession — ${officeName}`,
        message: `${vpCharacter.name} has succeeded to the presidency following a vacancy in the office.`,
        metadata: {},
      },
    ]);
  } else if (vpRecord.nppId) {
    await (
      await getNppsCollection(db)
    ).updateOne(
      { _id: vpRecord.nppId },
      { $set: { currentOffice: { type: "president" }, updatedAt: now } }
    );
  }

  // Clear VP office; characterId stays null (type allows it), optional fields are unset.
  await (
    await getElectedOfficialsCollection(db)
  ).updateOne(getExecutiveOfficialFilter(usCountryId, "vicePresident"), {
    $set: { characterId: null, countryId: usCountryId, isNPP: false, updatedAt: now },
    $unset: { characterName: "", party: "", nppId: "" },
  });

  if (vpRecord.characterId && vpCharacter) {
    const gameState = await (
      await getGameStateCollection(db)
    )
      .findOne({ _id: "current" }, { projection: { currentTurn: 1, iteration: 1 } })
      .catch(() => null);
    await Promise.all([
      captureOfficeTransition({
        db,
        officeType: "vicePresident",
        transitionType: "left",
        partyId: vpCharacter.party,
        selectionMethod: "succession",
        tenureTurns: 0,
        careerStage: vpCharacter.careerHistory?.length ?? 0,
        nationId: usCountryId,
        turn: gameState?.currentTurn ?? 0,
        iteration: gameState?.iteration,
      }),
      captureOfficeTransition({
        db,
        officeType: "president",
        transitionType: "gained",
        partyId: vpCharacter.party,
        selectionMethod: "succession",
        tenureTurns: 0,
        careerStage: (vpCharacter.careerHistory?.length ?? 0) + 1,
        nationId: usCountryId,
        turn: gameState?.currentTurn ?? 0,
        iteration: gameState?.iteration,
      }),
    ]);
  }

  // The ascender moves between executive offices, but must not carry a
  // legislative seat into the presidency (#2038).
  if (vpRecord.characterId) {
    await vacateNonExecutiveOfficesForExecutive(db, { characterId: vpRecord.characterId }, now);
  } else if (vpRecord.nppId) {
    await vacateNonExecutiveOfficesForExecutive(db, { nppId: vpRecord.nppId }, now);
  }

  return true;
}
