import type { Db, ObjectId } from "mongodb";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { statesCollection } from "@/lib/db/repositories/states";

/**
 * National party organization (0-100, population-weighted across the
 * country's states) keyed by the national chair's character id. Applies
 * during the founding phase too.
 */
export async function loadPartyChairOrganizations(
  db: Db,
  characterId?: ObjectId
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const parties = await politicalPartiesCollection(db)
    .find(
      { chairId: characterId ?? { $ne: null } },
      { projection: { _id: 1, chairId: 1, countryId: 1, sequentialId: 1 } }
    )
    .toArray();
  if (parties.length === 0) return out;

  const countryIds = [...new Set(parties.map((p) => p.countryId).filter(Boolean))];
  const states = await statesCollection(db)
    .find(
      { countryId: { $in: countryIds } },
      { projection: { _id: 1, countryId: 1, population: 1 } }
    )
    .toArray();
  const popByState = new Map(states.map((s) => [String(s._id), Math.max(0, s.population ?? 0)]));
  const popByCountry = new Map<string, number>();
  for (const s of states) {
    const c = String(s.countryId);
    popByCountry.set(c, (popByCountry.get(c) ?? 0) + Math.max(0, s.population ?? 0));
  }
  const partyKeys = parties.flatMap((p) =>
    [p.sequentialId, p._id].filter((k) => k != null).map(String)
  );
  const orgs = await statePartyOrgCollection(db)
    .find(
      { partyId: { $in: partyKeys }, stateId: { $in: [...popByState.keys()] } },
      { projection: { partyId: 1, stateId: 1, organization: 1 } }
    )
    .toArray();
  const weighted = new Map<string, number>();
  for (const row of orgs) {
    const pop = popByState.get(row.stateId) ?? 0;
    weighted.set(row.partyId, (weighted.get(row.partyId) ?? 0) + (row.organization ?? 0) * pop);
  }

  for (const party of parties) {
    if (!party.chairId) continue;
    const countryPop = popByCountry.get(String(party.countryId)) ?? 0;
    if (countryPop <= 0) continue;
    const key = party.sequentialId != null ? String(party.sequentialId) : String(party._id);
    const org = (weighted.get(key) ?? weighted.get(String(party._id)) ?? 0) / countryPop;
    const chair = party.chairId.toString();
    out.set(chair, Math.max(out.get(chair) ?? 0, org));
  }
  return out;
}
