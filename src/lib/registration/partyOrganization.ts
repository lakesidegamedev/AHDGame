import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countriesCore";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";

export async function loadPartyOrganizationByRegion(
  db: Db,
  countryId: CountryId,
  partyIds: string[]
): Promise<Map<string, Record<string, number>>> {
  const rows = await statePartyOrgCollection(db)
    .find(
      { countryId, partyId: { $in: partyIds } },
      { projection: { _id: 0, partyId: 1, stateId: 1, organization: 1 } }
    )
    .toArray();
  const byParty = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const regions = byParty.get(row.partyId) ?? {};
    regions[row.stateId] = row.organization;
    byParty.set(row.partyId, regions);
  }
  return byParty;
}
