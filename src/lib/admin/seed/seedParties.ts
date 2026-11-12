import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import type { PoliticalParty, StatePartyOrg } from "@/lib/db/types";
import { getNextSequentialId } from "@/lib/db/sequentialId";
import { politicalParties } from "@/lib/seeds/reference/politicalParties";
import { generateStatePartyOrg } from "@/lib/seeds/reference/statePartyOrg";
import { fillAbsentSeedFields } from "./fillAbsentSeedFields";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";

export async function seedParties(db: Db, log: (msg: string) => void) {
  // NOTE: Never drop politicalParties collection - it would delete player-created third parties
  // Only upsert the default parties (Democrat, Republican)
  const now = new Date();
  let created = 0;
  let filled = 0;
  let preserved = 0;
  for (const party of politicalParties) {
    const { seedOrder: _seedOrder, validForPresets: _validForPresets, ...partyData } = party;
    // Check if party already exists by name + country
    const existing = await politicalPartiesCollection(db).findOne({
      name: party.name,
      countryId: party.countryId,
    });

    if (existing) {
      // Fill gaps only — never overwrite. This runs against LIVE worlds, where
      // the Democratic and Republican rows carry a real treasury, an elected
      // chair, a member count, proposal-voted positions and a chair-chosen
      // colour. The previous `$set: { ...partyData }` reverted every one of
      // them to seed values (treasury back to exactly $1,000,000, chair to
      // null, memberCount to 0) on any reseed. See fillAbsentSeedFields.
      const gaps = fillAbsentSeedFields(partyData, existing);
      if (Object.keys(gaps).length === 0) {
        preserved++;
        continue;
      }
      await politicalPartiesCollection(db).updateOne(
        { _id: existing._id },
        { $set: { ...gaps, updatedAt: now } }
      );
      filled++;
    } else {
      // Insert new party with generated _id and sequentialId
      const sequentialId = await getNextSequentialId(db, "party", party.countryId);
      const doc: PoliticalParty = {
        _id: new ObjectId(),
        sequentialId,
        ...partyData,
        createdAt: now,
        updatedAt: now,
      };
      await politicalPartiesCollection(db).insertOne(doc);
      created++;
    }
  }
  log(
    `Seeded default political parties: ${created} created, ${filled} gap-filled, ${preserved} left untouched (third parties and live party state preserved)`
  );
}

export async function seedStatePartyOrg(db: Db, log: (msg: string) => void, preset: string) {
  // Never drop statePartyOrg: it holds third party state organizations.
  // Only upsert the default Democrat and Republican orgs per state.
  const now = new Date();
  const statePartyOrg = generateStatePartyOrg(preset);
  if (statePartyOrg.length === 0) {
    log("Seeded 0 default state party org entries");
    return;
  }

  // Read the live rows first so existing ones can be gap-filled instead of
  // overwritten. The old blanket `$set` reset every state chapter's
  // `organization` back to the lean-derived baseline and its `treasury` to 0,
  // and dropped elected state chairs — the single most destructive write in
  // the reseed path, since Org is the stat players spend whole games building.
  const existingRows = await statePartyOrgCollection(db)
    .find({ _id: { $in: statePartyOrg.map((org) => org._id) } })
    .toArray();
  const existingById = new Map(existingRows.map((row) => [row._id, row]));

  const ops: AnyBulkWriteOperation<StatePartyOrg>[] = [];
  let created = 0;
  let filled = 0;
  let preserved = 0;

  for (const org of statePartyOrg) {
    const { _id, ...orgData } = org;
    const existing = existingById.get(_id);

    if (!existing) {
      ops.push({
        updateOne: {
          filter: { _id },
          update: { $set: { ...orgData, updatedAt: now }, $setOnInsert: { createdAt: now } },
          upsert: true,
        },
      });
      created++;
      continue;
    }

    const gaps = fillAbsentSeedFields(orgData, existing);
    if (Object.keys(gaps).length === 0) {
      preserved++;
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id },
        update: { $set: { ...gaps, updatedAt: now } },
      },
    });
    filled++;
  }

  if (ops.length > 0) {
    await statePartyOrgCollection(db).bulkWrite(ops, { ordered: false });
  }

  log(
    `Seeded default state party org: ${created} created, ${filled} gap-filled, ${preserved} left untouched (third party orgs and live Org/treasury preserved)`
  );
}
