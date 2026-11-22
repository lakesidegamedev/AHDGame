import type { Db } from "mongodb";
import type { CabinetMember } from "@/lib/db/types";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import { withSessionDb } from "@/lib/db/sessionDb";
import { cabinetMembersCollection } from "@/lib/db/repositories/cabinetMembers";
import { preserveSurvivingCabinetRow } from "@/lib/countries/uk/dualMinistry/survivor";
import { restoreCharacterOfficeAfterCabinet } from "./restoreOffice";
import { applyConfidenceEventToGov } from "@/lib/countries/uk/confidence/confidenceGaugeStore";
import { GREAT_OFFICE_POSITION_IDS } from "@/lib/countries/uk/confidence/confidenceGauge";

/** Seat removal, surviving offices and confidence must commit together. */
export async function resignCabinetSeat(
  db: Db,
  member: Pick<CabinetMember, "_id" | "characterId" | "countryId" | "positionId">,
  now: Date
): Promise<{ removed: boolean; leftCabinet: boolean }> {
  return withSessionDb(db, async (tx) => {
    if (!member.characterId) return { removed: false, leftCabinet: false };
    const removed = await cabinetMembersCollection(tx).deleteOne({
      _id: member._id,
      characterId: member.characterId,
      countryId: member.countryId,
    });
    if (removed.deletedCount === 0) return { removed: false, leftCabinet: false };
    const survives = await preserveSurvivingCabinetRow(
      tx,
      member.countryId,
      member.characterId,
      now
    );
    if (!survives)
      await restoreCharacterOfficeAfterCabinet(tx, member.countryId, member.characterId, now);
    if (member.countryId === COUNTRY_CONFIGS.UK.id)
      await applyConfidenceEventToGov(
        tx,
        { kind: "ministerResigned", greatOffice: GREAT_OFFICE_POSITION_IDS.has(member.positionId) },
        now
      );
    return { removed: true, leftCabinet: !survives };
  });
}
