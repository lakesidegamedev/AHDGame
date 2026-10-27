import type { ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { AppointmentEligibility } from "@/lib/turn/parliamentaryGovernment";

/**
 * Filter for the active appointment vote that blocks a new nomination: one per
 * coalition, one per party-only bid, and one per nominator. The nominator arm
 * covers a chair whose bid switched between the party and coalition paths
 * (the coalition started or stopped qualifying) while a vote was open.
 */
export function activeAppointmentVoteFilter(
  countryId: CountryId,
  eligibility: Extract<AppointmentEligibility, { eligible: true }>,
  nominatorId: ObjectId,
  office: "primeMinister" | "headOfState"
) {
  const bloc =
    eligibility.coalitionId != null
      ? { coalitionId: eligibility.coalitionId }
      : { coalitionId: null, nomineePartyId: String(eligibility.qualifyingPartyIds[0]) };
  return {
    countryId,
    status: "active" as const,
    office: office === "headOfState" ? ("headOfState" as const) : { $exists: false },
    $or: [bloc, { nominatedByCharacterId: nominatorId }],
  };
}
