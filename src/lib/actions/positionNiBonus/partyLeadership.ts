import type { Db, ObjectId } from "mongodb";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import type { StatePartyOrg } from "@/lib/db/types/statePartyOrg";
import { deriveOrganizationShares } from "@/lib/parties/rules/organizationBucket";
import { resolvePartyPositionNiBonus } from "./rules";

type OrgRow = Pick<
  StatePartyOrg,
  "_id" | "countryId" | "stateId" | "partyId" | "chairId" | "organization" | "organizationUnits"
>;

/** Resolve legacy balances using the same regional buckets as Build Org. */
function readOrgUnits(rows: OrgRow[]): Map<string, number> {
  const regions = new Map<string, OrgRow[]>();
  for (const row of rows) {
    const key = `${row.countryId}:${row.stateId}`;
    const region = regions.get(key) ?? [];
    region.push(row);
    regions.set(key, region);
  }

  const units = new Map<string, number>();
  for (const region of regions.values()) {
    const resolved = deriveOrganizationShares(region.map((row) => ({ ...row, id: row._id })));
    for (const row of resolved.rows) units.set(row.id, row.organizationUnits);
  }
  return units;
}

/** Load the strongest party office for each holder, optionally for one character's display. */
export async function loadPartyPositionNiBonuses(
  db: Db,
  founding: boolean,
  characterId?: ObjectId
): Promise<Map<string, number>> {
  const holder = characterId ?? { $ne: null };
  const [nationalOffices, stateRows] = await Promise.all([
    politicalPartiesCollection(db)
      .find(
        { $or: [{ chairId: holder }, { viceChairId: holder }, { treasurerId: holder }] },
        {
          projection: { countryId: 1, sequentialId: 1, chairId: 1, viceChairId: 1, treasurerId: 1 },
        }
      )
      .toArray(),
    statePartyOrgCollection(db)
      .find(founding ? {} : { chairId: holder }, {
        projection: founding
          ? {
              countryId: 1,
              stateId: 1,
              partyId: 1,
              chairId: 1,
              organization: 1,
              organizationUnits: 1,
            }
          : { chairId: 1 },
      })
      .toArray(),
  ]);

  const units = founding ? readOrgUnits(stateRows) : new Map<string, number>();
  const partyUnits = new Map<string, number>();
  const bonuses = new Map<string, number>();
  const selectedId = characterId?.toString();
  function record(id: ObjectId | null, bonus: number) {
    if (!id) return;
    const key = id.toString();
    if (selectedId && key !== selectedId) return;
    bonuses.set(key, Math.max(bonuses.get(key) ?? 0, bonus));
  }

  for (const row of stateRows) {
    const localUnits = units.get(row._id) ?? 0;
    if (founding) {
      const key = `${row.countryId}:${row.partyId}`;
      partyUnits.set(key, (partyUnits.get(key) ?? 0) + localUnits);
    }
    record(
      row.chairId,
      resolvePartyPositionNiBonus("stateChair", founding ? localUnits : undefined)
    );
  }

  for (const party of nationalOffices) {
    const key = `${party.countryId}:${party.sequentialId}`;
    const nationalUnits = founding ? (partyUnits.get(key) ?? 0) : undefined;
    record(party.chairId, resolvePartyPositionNiBonus("chair", nationalUnits));
    record(party.viceChairId, resolvePartyPositionNiBonus("subChair", nationalUnits));
    record(party.treasurerId, resolvePartyPositionNiBonus("subChair", nationalUnits));
  }

  return bonuses;
}
