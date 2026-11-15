import type { Db } from "mongodb";
import type { StatePartyOrg, PoliticalParty } from "@/lib/db/types";
import { getCnRegionOrg, getCnPartyTreasury } from "@/lib/seeds/cn/cnStatePartyOrgCalculations";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import type { Document } from "mongodb";

/**
 * China state party organization seeder.
 *
 * China operates under a one-party dominant system. The Chinese Communist Party
 * (CCP) is the governing party with deep organizational presence across all
 * macro-regions. Minor parties (CDL, CNDCA) hold advisory roles within the CPPCC
 * framework and do NOT create a normal government alternation path.
 *
 * Resolve party identities from the current CN roster. Recreating parties after
 * a partyless opening can allocate different sequential IDs.
 *
 * Per-region Reg / Org values: CCP is overwhelmingly dominant, both near 95 in
 * every region, slightly higher in capital and politically central regions.
 * CDL (academic base) is strongest in HB, HD, HZ, XN. CNDCA (industrialist base)
 * is strongest in HD, HB, HN, DB.
 *
 * `registration` mirrors `organization` per row: the swing-flow engine's
 * `regByParty` map is what gates defense. Without seeded registration, CCP would
 * be 20%-peelable (newcomer baseline) under `transferableShare` /
 * `persuasionResistance`. The shared `seedRegistrationLanes` pipeline only covers
 * US / UK / JP / DE, so CN sets `registration` inline here.
 *
 * Era-specific org tables are in cnStatePartyOrgCalculations.ts. The 1991 table
 * reflects peak party-state dominance (CCP +2-3 per region, minor parties -1-2).
 */

const CN_REGION_IDS = ["DB", "HB", "HD", "HZ", "HN", "XN", "XB"];

interface CNPartyConfig {
  slug: "ccp" | "cdl" | "cndca";
  stateTaxRate: number;
}

const CN_PARTY_CONFIGS: CNPartyConfig[] = [
  { slug: "ccp", stateTaxRate: 5 },
  { slug: "cdl", stateTaxRate: 2 },
  { slug: "cndca", stateTaxRate: 2 },
];

export async function seedCnStatePartyOrg(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset?: string
): Promise<void> {
  const activePreset = preset ?? (await getGameStatePresetOrDefault(db));
  const parties = await politicalPartiesCollection<PoliticalParty>(db)
    .find({ countryId: "CN" }, { projection: { sequentialId: 1, abbreviation: 1 } })
    .toArray();
  const ids = new Map(parties.map((p) => [p.abbreviation, String(p.sequentialId)]));

  if (reset) {
    await statePartyOrgCollection<Document>(db).deleteMany({ countryId: "CN" });
  }

  const regionOrg = getCnRegionOrg(activePreset);
  const treasury = getCnPartyTreasury(activePreset);
  const now = new Date();
  const orgs: Omit<StatePartyOrg, "createdAt" | "updatedAt">[] = [];

  for (const regionId of CN_REGION_IDS) {
    const orgRow = regionOrg[regionId];
    if (!orgRow) {
      throw new Error(`CN seed: missing regionOrg entry for region ${regionId}`);
    }

    for (const party of CN_PARTY_CONFIGS) {
      const partyId = ids.get(party.slug.toUpperCase());
      if (!partyId) throw new Error(`CN seed: missing party ${party.slug}`);
      const orgValue =
        party.slug === "ccp" ? orgRow.ccp : party.slug === "cdl" ? orgRow.cdl : orgRow.cndca;
      const partyTreasury = treasury[party.slug];
      orgs.push({
        _id: `${regionId}_${partyId}`,
        countryId: "CN",
        stateId: regionId,
        partyId,
        organization: orgValue,
        registration: orgValue,
        chairId: null,
        viceChairId: null,
        treasurerId: null,
        treasury: partyTreasury,
        stateTaxRate: party.stateTaxRate,
        politicalStrength: 0,
        hasPresence: true,
        consecutiveLosses: 0,
      });
    }
  }

  let upserted = 0;
  for (const org of orgs) {
    const { _id, ...orgData } = org;
    const result = await statePartyOrgCollection(db).updateOne(
      { _id },
      { $set: { ...orgData, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    if (result.upsertedCount > 0) upserted++;
  }

  log(
    `Seeded ${orgs.length} CN state party org entries (${upserted} new, ${orgs.length - upserted} updated) [preset: ${activePreset}]`
  );
}

import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
