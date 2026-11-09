import type { Db } from "mongodb";
import type { Character } from "@/lib/db/types";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getLowerChamberOfficeType } from "@/lib/legislature/chamberOfficeType";
import { resolvePartyNppProposalAccess } from "@/lib/legislature/queries/partyNppProposalAccess";
import { resolveNationalPartyNppAccess } from "@/lib/legislature/queries/nationalPartyNppAccess";

/** Reuse bill sponsorship authority, restricted to the chamber that can file articles. */
export async function resolvePartyImpeachmentSponsor(
  db: Db,
  countryId: CountryId,
  character: Pick<Character, "_id" | "party" | "countryId"> | null,
  office: "president" | "governor",
  state?: string
) {
  if (COUNTRY_CONFIGS[countryId]?.governmentType !== "presidential") {
    return { authorized: false, npp: null };
  }
  if (office === "governor") {
    if (!state) return { authorized: false, npp: null };
    return resolvePartyNppProposalAccess(db, countryId, state, character, {
      ignoreBillReservations: true,
    });
  }
  const lowerOffice = getLowerChamberOfficeType(countryId);
  const access = await resolveNationalPartyNppAccess(db, countryId, character, [
    { officeType: lowerOffice, chamber: COUNTRY_CONFIGS[countryId].legislature.lowerChamber.key },
  ]);
  return { authorized: access.authorized, npp: access.sponsor?.npp ?? null };
}
