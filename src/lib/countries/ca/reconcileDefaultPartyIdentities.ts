/**
 * Seed-only correction of Canadian default names and nationwide Bloc eligibility.
 * Preserves IDs and played state other than the retired regional restriction.
 * Conflicting canonical names stop reconciliation before any write.
 */
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { PoliticalParty } from "@/lib/db/types";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { caParties } from "./data/caParties";
import { CA_LEGACY_PARTY_NAMES } from "./data/caLegacyPartyNames";

export async function reconcileCaDefaultPartyIdentities(db: Db, preset: string): Promise<number> {
  if (preset !== "2027-default") return 0;
  const parties = await politicalPartiesCollection(db)
    .find(
      {
        countryId: "CA",
        name: { $in: caParties.flatMap((p) => [p.name, CA_LEGACY_PARTY_NAMES[p.name]!]) },
      },
      { projection: { name: 1, abbreviation: 1, isDefault: 1, sequentialId: 1 } }
    )
    .toArray();
  const ops: AnyBulkWriteOperation<PoliticalParty>[] = [];
  const now = new Date();
  for (const seed of caParties) {
    if (parties.some((p) => p.name === seed.name && !p.isDefault))
      throw new Error(`Canadian party name ${seed.name} is already held by another party`);
    const identities = [seed.name, CA_LEGACY_PARTY_NAMES[seed.name]];
    const defaults = parties.filter((p) => p.isDefault && identities.includes(p.name));
    if (defaults.length > 1)
      throw new Error(`Conflicting Canadian default identities for ${seed.name}`);
    const party = defaults[0];
    if (!party) continue;
    if (parties.some((p) => p.name === seed.name && !p._id.equals(party._id)))
      throw new Error(`Canadian party name ${seed.name} is already held by another party`);
    if (party.name === seed.name && party.abbreviation === seed.abbreviation) continue;
    ops.push({
      updateOne: {
        filter: { _id: party._id, countryId: "CA", isDefault: true, name: party.name },
        update: { $set: { name: seed.name, abbreviation: seed.abbreviation, updatedAt: now } },
      },
    });
  }
  const result = ops.length
    ? await politicalPartiesCollection(db).bulkWrite(ops, { ordered: true })
    : null;
  const bloc = parties.find(
    (p) =>
      p.isDefault && ["Bloc Québécois", CA_LEGACY_PARTY_NAMES["Bloc Québécois"]].includes(p.name)
  );
  if (bloc)
    await statePartyOrgCollection(db).updateMany(
      { countryId: "CA", partyId: String(bloc.sequentialId), hasPresence: false },
      { $set: { hasPresence: true, updatedAt: now } }
    );
  return result?.modifiedCount ?? 0;
}
