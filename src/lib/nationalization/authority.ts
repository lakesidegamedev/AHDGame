import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { getCountryConfig } from "@/lib/constants/countries";
import { getCabinetMembersCollection } from "@/lib/db/collections/cabinetMembers";

/**
 * Authority gate for National Corporation management (appoint CEO, split off /
 * merge back sector types — spec §24.4).
 *
 * Only the seated finance-minister-equivalent per country
 * (`financeMinisterCabinetId`: US `secretary_of_treasury`, UK `chancellor`,
 * DE `finance_minister`, …) may act. A vacant or unconfigured seat authorizes
 * nobody: the head of government has no substitution over a cabinet seat.
 */
export async function assertTreasuryAuthority(
  db: Db,
  countryId: CountryId,
  characterId: ObjectId
): Promise<boolean> {
  const positionId = getCountryConfig(countryId).financeMinisterCabinetId;
  if (!positionId) return false;

  // Cabinet seats live in the `cabinetMembers` collection (one doc per active
  // appointment) — NOT `unifiedCabinetMembers`, which is never written.
  const seat = await getCabinetMembersCollection(db).findOne({ countryId, positionId });
  const holder = seat?.characterId ?? null;
  return holder !== null && holder.equals(characterId);
}
