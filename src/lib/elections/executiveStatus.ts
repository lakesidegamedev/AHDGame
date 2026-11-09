import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { getGameStateCollection } from "@/lib/db/collections";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import {
  executiveStatusPayload,
  type ExecutiveStatusPayload,
} from "@/lib/elections/rules/successionFill";

/** Succession and caretaker state of a country's executive, as the hubs and API show it. */
export async function loadExecutiveStatus(
  db: Db,
  countryId: CountryId
): Promise<ExecutiveStatusPayload> {
  const [gov, gameState] = await Promise.all([
    getGovernmentFormationsCollection(db).findOne(
      { _id: countryId },
      { projection: { status: 1, caretaker: 1, succession: 1 } }
    ),
    getGameStateCollection(db).then((col) =>
      col.findOne({ _id: "current" }, { projection: { currentTurn: 1 } })
    ),
  ]);
  return executiveStatusPayload(gov, gameState?.currentTurn ?? 0);
}
