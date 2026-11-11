import type { Db } from "mongodb";
import { missingPresetEntry } from "@/lib/seeds/contract/seedContractError";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import type { StatePartyOrg } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import {
  EASTERN_BLOC_STATE_PARTY_ORG,
  easternBlocOrgEra,
} from "@/lib/seeds/shared/easternBlocStatePartyOrg";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import type { Document } from "mongodb";

/**
 * Regional party-organisation seeder for the Warsaw-Pact satellites and the
 * three Soviet union republics modelled as their own countries
 * (PL/HU/RO/BG/CS/YU + UKR/BLR/BAL).
 *
 * The USSR, GDR and China each have bespoke seeders for their distinct party
 * structures; the satellites share the simple one-ruling-party case.
 *
 * Without these rows the satellites' ruling parties have no `statePartyOrg`
 * entries, leaving `registration` unset and dropping them to the newcomer
 * baseline in the swing-flow engine, making them far too peelable.
 *
 * Era-gated: no-ops outside Cold-War presets, mirroring `seedEasternBlocCountry`.
 */
export async function seedEasternBlocStatePartyOrg(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset?: string
): Promise<void> {
  const activePreset = preset ?? (await getGameStatePreset(db));
  if (activePreset == null) throw missingPresetEntry("(none)", "eastern-bloc-state-party-org");

  const { isEasternBlocEra } = await import("@/lib/seeds/presetSelector");
  if (!isEasternBlocEra(activePreset)) {
    log(`Skipping Eastern-bloc state party org seed — not a Cold-War era (preset ${activePreset})`);
    return;
  }

  const era = easternBlocOrgEra(activePreset);
  const countryIds = Object.keys(EASTERN_BLOC_STATE_PARTY_ORG) as CountryId[];

  if (reset) {
    await statePartyOrgCollection<Document>(db).deleteMany({ countryId: { $in: countryIds } });
  }

  const now = new Date();
  let upserted = 0;
  let total = 0;

  for (const countryId of countryIds) {
    const profile = EASTERN_BLOC_STATE_PARTY_ORG[countryId];
    const orgByRegion = profile.org[era];

    for (const [regionId, organization] of Object.entries(orgByRegion)) {
      const row: Omit<StatePartyOrg, "createdAt" | "updatedAt"> = {
        _id: `${regionId}_${profile.seqId}`,
        countryId,
        stateId: regionId,
        partyId: profile.seqId,
        organization,
        // Mirrors `organization` — `regByParty` is what gates §7.3.2 defense.
        registration: organization,
        chairId: null,
        viceChairId: null,
        treasurerId: null,
        treasury: profile.treasury[era],
        stateTaxRate: profile.stateTaxRate,
        politicalStrength: 0,
        hasPresence: true,
        consecutiveLosses: 0,
      };
      const { _id, ...orgData } = row;
      const result = await statePartyOrgCollection(db)
        .updateOne(
          { _id },
          { $set: { ...orgData, updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true }
        );
      if (result.upsertedCount > 0) upserted++;
      total++;
    }
  }

  log(
    `Seeded ${total} Eastern-bloc satellite state party org entries across ${countryIds.length} countries ` +
      `(${upserted} new, ${total - upserted} updated) [preset: ${activePreset}]`
  );
}
