import { logger } from "@/lib/observability/logger";
import { ApiError } from "@/lib/api/errors";
import { withSessionDb, afterCommit, unboundDb } from "@/lib/db/sessionDb";
import type { Db } from "@/lib/mongodb";
import type { Character, CareerEvent, ElectedOfficial, OfficeType } from "@/lib/db/types";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import {
  getExecutiveOfficialFilter,
  type ExecutiveOfficeType,
} from "@/lib/elections/executiveOfficeFilters";
import { getOfficeLabel } from "@/lib/utils/officeTitle";
import { captureOfficeTransition } from "@/lib/analytics/officeTransitionAnalytics";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";

/** Vacate a US executive slot when the seated player resigns. */
export async function resignExecutiveOffice(
  db: Db,
  official: ElectedOfficial,
  character: Character,
  now: Date
): Promise<void> {
  return withSessionDb(db, async (db) => {
    const officeType = official.officeType;
    if (officeType !== "president" && officeType !== "vicePresident") {
      throw new Error("Not an executive office");
    }

    const countryId = official.countryId ?? COUNTRY_CONFIGS.US.id;
    const executiveOfficeType = officeType as ExecutiveOfficeType;

    if (!official.characterId?.equals(character._id))
      throw new ApiError(409, "Office holder changed. Refresh and try again.");
    const vacated = await electedOfficialsCollection(db).updateOne(
      {
        ...getExecutiveOfficialFilter(countryId, executiveOfficeType),
        _id: official._id,
        characterId: character._id,
      },
      {
        $set: {
          characterId: null,
          isNPP: false,
          updatedAt: now,
        },
        $unset: {
          characterName: "",
          party: "",
          nppId: "",
          electedAt: "",
        },
      }
    );

    if (vacated.matchedCount !== 1)
      throw new ApiError(409, "Office holder changed. Refresh and try again.");

    const executiveOffice: OfficeType = { type: executiveOfficeType };
    const careerEvent: CareerEvent = {
      type: "resigned",
      office: executiveOffice,
      officeLabel: getOfficeLabel(executiveOffice, countryId),
      party: character.party,
      partyCountryId: countryId,
      date: now,
    };

    await charactersCollection(db).updateOne(
      { _id: character._id, currentOffice: character.currentOffice ?? null },
      {
        $set: { currentOffice: null, updatedAt: now },
        $push: { careerHistory: careerEvent },
      }
    );

    const gameState = await gameStateCollection(db)
      .findOne({ _id: "current" }, { projection: { currentTurn: 1, iteration: 1 } })
      .catch(() => null);
    await afterCommit(db, () =>
      captureOfficeTransition({
        db: unboundDb(db),
        officeType,
        transitionType: "left",
        partyId: character.party,
        selectionMethod: "resignation",
        tenureTurns: 0,
        careerStage: character.careerHistory?.length ?? 0,
        nationId: countryId,
        turn: gameState?.currentTurn ?? 0,
        iteration: gameState?.iteration,
        flush: true,
      }).catch((error) => {
        logger.error("value-safety", "Office transition telemetry failed", error);
      })
    );
  });
}
