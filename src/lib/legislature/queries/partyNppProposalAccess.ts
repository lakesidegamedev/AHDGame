/**
 * Party-directed regional bills use a seated, active party NPP without a bill
 * or governor queue reservation. resolvePartyNppProposalAccess checks the chair
 * and selects a sponsor; submission repeats this check against current data.
 */
import type { Db } from "mongodb";
import type {
  Character,
  ElectedOfficial,
  GovernorQueuedBill,
  NPP,
  PoliticalParty,
  StateBill,
  StatePartyOrg,
} from "@/lib/db/types";
import { getSubNationalLegislatureKey, type CountryId } from "@/lib/constants/countries";
import { isSameCountry } from "@/lib/api/sameCountry";
import { STATE_TERMINAL_STATUSES } from "@/lib/congress/billProposalLimits";
import { canDirectRegionalPartyNpp, hasPartyNppSeats } from "../rules/partyNppProposal";

export async function resolvePartyNppProposalAccess(
  db: Db,
  countryId: CountryId,
  stateId: string,
  character: Pick<Character, "_id" | "party" | "countryId"> | null | undefined
): Promise<{ authorized: boolean; npp: Pick<NPP, "_id" | "name" | "party"> | null }> {
  const denied = { authorized: false, npp: null };
  if (!character?.party || !isSameCountry(character, { countryId })) return denied;
  const partyNumber = Number(character.party);
  if (!Number.isSafeInteger(partyNumber) || partyNumber <= 0) return denied;
  stateId = stateId.toUpperCase();
  const [party, regionalParty] = await Promise.all([
    db
      .collection<PoliticalParty>("politicalParties")
      .findOne(
        { countryId, sequentialId: partyNumber },
        { projection: { chairId: 1, sequentialId: 1 } }
      ),
    db
      .collection<StatePartyOrg>("statePartyOrg")
      .findOne({ countryId, stateId, partyId: character.party }, { projection: { chairId: 1 } }),
  ]);
  if (
    !party ||
    !canDirectRegionalPartyNpp({
      characterId: character._id.toString(),
      characterPartyId: character.party,
      partyId: String(party.sequentialId),
      sameCountry: true,
      nationalChairId: party.chairId?.toString() ?? null,
      regionalChairId: regionalParty?.chairId?.toString() ?? null,
    })
  )
    return denied;
  const officeType = getSubNationalLegislatureKey(countryId);
  if (!officeType) return { authorized: true, npp: null };
  const seats = await db
    .collection<ElectedOfficial>("electedOfficials")
    .find(
      { countryId, state: stateId, officeType, isNPP: true },
      { projection: { nppId: 1, seatsHeld: 1 } }
    )
    .toArray();
  const ids = seats.flatMap((seat) =>
    seat.nppId && hasPartyNppSeats(seat.seatsHeld) ? [seat.nppId] : []
  );
  if (!ids.length) return { authorized: true, npp: null };
  const [npps, busy, queued] = await Promise.all([
    db
      .collection<NPP>("npps")
      .find(
        { _id: { $in: ids }, party: character.party, retiredAt: null },
        { projection: { name: 1, party: 1, countryId: 1 } }
      )
      .sort({ _id: 1 })
      .toArray(),
    db
      .collection<StateBill>("stateBills")
      .find(
        {
          status: { $nin: STATE_TERMINAL_STATUSES },
          $or: [{ sponsorNppId: { $in: ids } }, { isNPP: true, nppId: { $in: ids } }],
        },
        { projection: { sponsorNppId: 1, nppId: 1 } }
      )
      .toArray(),
    db
      .collection<GovernorQueuedBill>("governorLegislationQueue")
      .find(
        { countryId, status: "pending", targetNppId: { $in: ids } },
        { projection: { targetNppId: 1 } }
      )
      .toArray(),
  ]);
  const unavailable = new Set([
    ...busy.flatMap((bill) => [bill.sponsorNppId?.toString(), bill.nppId?.toString()]),
    ...queued.map((queue) => queue.targetNppId.toString()),
  ]);
  return {
    authorized: true,
    npp:
      npps.find(
        (npp) => isSameCountry(npp, { countryId }) && !unavailable.has(npp._id.toString())
      ) ?? null,
  };
}
