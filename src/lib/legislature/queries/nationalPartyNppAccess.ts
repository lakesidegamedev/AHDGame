/**
 * National chairs use their party's seated national legislators. resolveNationalPartyNppAccess
 * checks country and membership, blocks any in-flight party NPP bill, and selects a sponsor.
 */
import type { Db } from "mongodb";
import type { Character, PoliticalParty, ElectedOfficial, NPP, Bill } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { isSameCountry } from "@/lib/api/sameCountry";
import { officialsCountryScope } from "@/lib/db/electedOfficialScope";
import { NATIONAL_TERMINAL_STATUSES } from "@/lib/congress/billProposalLimits";
import { buildActiveNationalBillFilter } from "../nationalBillScope";
import { hasPartyNppSeats } from "../rules/partyNppProposal";
import { canDirectNationalPartyNpp, pickNationalPartySponsor } from "../rules/nationalPartyNpp";

export async function resolveNationalPartyNppAccess(
  db: Db,
  countryId: CountryId,
  character: Pick<Character, "_id" | "party" | "countryId"> | null | undefined,
  chambers: readonly { officeType: string; chamber: string }[],
  rng: () => number = Math.random
) {
  const denied = { authorized: false, blocked: false, sponsor: null };
  if (!character?.party || !isSameCountry(character, { countryId })) return denied;
  const partyNumber = Number(character.party);
  if (!Number.isSafeInteger(partyNumber) || partyNumber <= 0) return denied;
  const party = await db
    .collection<PoliticalParty>("politicalParties")
    .findOne(
      { countryId, sequentialId: partyNumber },
      { projection: { chairId: 1, sequentialId: 1 } }
    );
  if (
    !party ||
    !canDirectNationalPartyNpp({
      characterId: character._id.toString(),
      characterPartyId: character.party,
      partyId: String(party.sequentialId),
      sameCountry: true,
      nationalChairId: party.chairId?.toString() ?? null,
    })
  )
    return denied;
  const active = await db.collection<Bill>("bills").findOne(
    {
      ...buildActiveNationalBillFilter(countryId, NATIONAL_TERMINAL_STATUSES),
      nppSponsored: true,
      sponsorParty: character.party,
    },
    { projection: { _id: 1 } }
  );
  if (active) return { authorized: true, blocked: true, sponsor: null };
  const seats = await db
    .collection<ElectedOfficial>("electedOfficials")
    .find(
      {
        ...officialsCountryScope(countryId),
        officeType: { $in: chambers.map((c) => c.officeType) },
        isNPP: true,
      },
      { projection: { nppId: 1, officeType: 1, seatsHeld: 1 } }
    )
    .toArray();
  const seated = seats.filter((s) => s.nppId && hasPartyNppSeats(s.seatsHeld));
  const ids = seated.flatMap((s) => (s.nppId ? [s.nppId] : []));
  if (!ids.length) return { authorized: true, blocked: false, sponsor: null };
  const npps = await db
    .collection<NPP>("npps")
    .find(
      { _id: { $in: ids }, party: character.party, retiredAt: null },
      { projection: { name: 1, party: 1, countryId: 1 } }
    )
    .toArray();
  const candidates = npps
    .filter((n) => isSameCountry(n, { countryId }))
    .flatMap((npp) => {
      const seat = seated.find((s) => s.nppId?.equals(npp._id));
      const chamber = chambers.find((c) => c.officeType === seat?.officeType)?.chamber;
      return chamber ? [{ npp, chamber }] : [];
    });
  return { authorized: true, blocked: false, sponsor: pickNationalPartySponsor(candidates, rng) };
}
