/**
 * US minor default parties open empty state chapters without invented support.
 * Resolves live party IDs; reseeds preserve chapters and world resets clear progress.
 */
import type { Db, AnyBulkWriteOperation } from "mongodb";
import type { StatePartyOrg } from "@/lib/db/types";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statesCollection } from "@/lib/db/repositories/states";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { isUsPartyOrganizationJurisdiction } from "@/lib/constants/states";
import { usParties } from "./data/usParties";
import { isPartyValidForPreset } from "@/lib/seeds/ensureDefaultParties";
import { resolveSeedPartyTier } from "@/lib/seeds/defaultPartyTiers";

export async function ensureUSMinorPartyOrgs(
  db: Db,
  preset: string,
  resetWorld = false
): Promise<void> {
  const names = usParties
    .filter((p) => isPartyValidForPreset(p, preset) && resolveSeedPartyTier(p, preset) === "minor")
    .map((p) => p.name);
  if (names.length === 0) return;
  const [parties, states] = await Promise.all([
    politicalPartiesCollection(db)
      .find(
        { countryId: "US", isDefault: true, name: { $in: names } },
        { projection: { sequentialId: 1 } }
      )
      .toArray(),
    statesCollection(db)
      .find({ countryId: "US" }, { projection: { _id: 1 } })
      .toArray(),
  ]);
  const now = new Date();
  const ops: AnyBulkWriteOperation<StatePartyOrg>[] = [];
  for (const state of states) {
    if (!isUsPartyOrganizationJurisdiction(state._id)) continue;
    for (const party of parties) {
      const partyId = String(party.sequentialId);
      const row: StatePartyOrg = {
        _id: `${state._id}_${partyId}`,
        countryId: "US",
        stateId: state._id,
        partyId,
        organization: 0,
        registration: 0,
        chairId: null,
        viceChairId: null,
        treasurerId: null,
        treasury: 0,
        stateTaxRate: 0,
        politicalStrength: 0,
        hasPresence: false,
        consecutiveLosses: 0,
        createdAt: now,
        updatedAt: now,
      };
      ops.push({
        updateOne: {
          filter: { _id: row._id, countryId: "US" },
          update: { $setOnInsert: row },
          upsert: true,
        },
      });
    }
  }
  if (ops.length === 0) return;
  if (resetWorld)
    await statePartyOrgCollection(db).deleteMany({
      countryId: "US",
      partyId: { $in: parties.map((p) => String(p.sequentialId)) },
    });
  await statePartyOrgCollection(db).bulkWrite(ops, { ordered: false });
}
