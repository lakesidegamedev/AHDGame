import type { Db } from "mongodb";
import { missingPresetEntry } from "@/lib/seeds/contract/seedContractError";
import type { StatePartyOrg } from "@/lib/db/types";
import { getRuRegionOrg, getRuPartyTreasury } from "@/lib/seeds/ru/ruStatePartyOrgCalculations";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import type { Document } from "mongodb";

/**
 * USSR is single-party: CPSU (sequentialId "1") is the only party with
 * regional organization. `registration` mirrors `organization` per row so the
 * swing-flow engine's `regByParty` gates §7.3.2 defense; otherwise CPSU would be
 * 20%-peelable. The shared `seedRegistrationLanes` pipeline only covers US / UK /
 * JP / DE, so RU sets `registration` inline here (CN precedent).
 * Era-specific org tables live in ruStatePartyOrgCalculations.ts.
 */

const RU_REGION_IDS = [
  "CEN",
  "NWR",
  "NOR",
  "CBE",
  "VOL",
  "NCA",
  "URA",
  "WSB",
  "ESB",
  "FEA",
  "KAZ",
  "TRA",
  "CAS",
  "MOL",
];

const CPSU_SEQ_ID = "1";
const CPSU_STATE_TAX_RATE = 5;

export async function seedRuStatePartyOrg(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset?: string
): Promise<void> {
  const activePreset = preset ?? (await getGameStatePreset(db));
  if (activePreset == null) throw missingPresetEntry("(none)", "ru-state-party-org");

  // CPSU + USSR exist only in Cold-War (1953/1979) eras; RU regions are
  // era-gated the same way in bootstrapGameWorld. Without this guard, the
  // CPSU's regional org would seed for Soviet-era region ids that no longer
  // exist, leaving orphaned communist rosters in a post-Soviet world.
  const { isEasternBlocEra } = await import("@/lib/seeds/presetSelector");
  if (!isEasternBlocEra(activePreset)) {
    log(
      `Skipping RU state party org seed — CPSU only exists in Soviet eras (preset ${activePreset})`
    );
    return;
  }

  if (reset) {
    await statePartyOrgCollection<Document>(db).deleteMany({ countryId: "RU" });
  }

  const regionOrg = getRuRegionOrg(activePreset);
  const treasury = getRuPartyTreasury(activePreset);
  const now = new Date();
  const orgs: Omit<StatePartyOrg, "createdAt" | "updatedAt">[] = [];

  for (const regionId of RU_REGION_IDS) {
    const orgRow = regionOrg[regionId];
    if (!orgRow) {
      throw new Error(`RU seed: missing regionOrg entry for region ${regionId}`);
    }

    orgs.push({
      _id: `${regionId}_${CPSU_SEQ_ID}`,
      countryId: "RU",
      stateId: regionId,
      partyId: CPSU_SEQ_ID,
      organization: orgRow.cpsu,
      registration: orgRow.cpsu,
      chairId: null,
      viceChairId: null,
      treasurerId: null,
      treasury: treasury.cpsu,
      stateTaxRate: CPSU_STATE_TAX_RATE,
      politicalStrength: 0,
      hasPresence: true,
      consecutiveLosses: 0,
    });
  }

  let upserted = 0;
  for (const org of orgs) {
    const { _id, ...orgData } = org;
    const result = await statePartyOrgCollection(db)
      .updateOne(
        { _id },
        { $set: { ...orgData, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
    if (result.upsertedCount > 0) upserted++;
  }

  log(
    `Seeded ${orgs.length} RU state party org entries (${upserted} new, ${orgs.length - upserted} updated) [preset: ${activePreset}]`
  );
}
