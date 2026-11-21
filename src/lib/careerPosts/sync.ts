/**
 * Career sync shell. Posts are handed out by many systems, so one after-turn
 * pass reads every holder and lets the rules write took/left events, instead
 * of each system writing its own.
 */
import { ObjectId, type AnyBulkWriteOperation, type Db, type Document } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type {
  CareerEvent,
  CareerPostHolding,
  Character,
  OfficeType,
} from "@/lib/db/types/character";
import { internationalLeaderLabel, officeKey, planCareerSync, type HeldPost } from "./rules";
import { leadershipRoleLabel } from "@/lib/congress/leadership/electionRoleMap";
import { getOfficeLabel } from "@/lib/utils/officeTitle";
import { loadOrganizationDefsById } from "@/lib/internationalOrganizations/service";
import { getMilitaryCommandsCollection } from "@/lib/db/collections/militaryCommands";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { organizationLeadershipCollection } from "@/lib/db/repositories/organizationLeadership";
import { congressLeadersCollection } from "@/lib/db/repositories/congressLeaders";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { caucusesCollection } from "@/lib/db/repositories/caucuses";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { achievementsCollection } from "@/lib/db/repositories/achievements";
import { characterAchievementsCollection } from "@/lib/db/repositories/characterAchievements";
import { invalidateDefinitionsCache, invalidateRarityCache } from "@/lib/achievements/cache";
import {
  INTERNATIONAL_LEADER_ACHIEVEMENT,
  INTERNATIONAL_LEADER_SLUG,
} from "@/lib/achievements/careerPostAchievements";

const LEADERSHIP_FIELDS = [
  ["chairId", "Chair"],
  ["viceChairId", "Vice-Chair"],
  ["treasurerId", "Treasurer"],
] as const;

function countryName(countryId: string | null | undefined): string {
  if (!countryId) return "";
  return COUNTRY_CONFIGS[countryId as CountryId]?.name ?? countryId;
}

/** Every post-type holder in the world right now (offices are read per character). */
export async function collectHeldPosts(db: Db): Promise<HeldPost[]> {
  const posts: HeldPost[] = [];
  const [orgRows, leaders, parties, stateOrgs, caucuses, banks, commandDocs, corps] =
    await Promise.all([
      organizationLeadershipCollection(db)
        .find({ holderCharacterId: { $ne: null } })
        .toArray(),
      congressLeadersCollection(db)
        .find({ characterId: { $ne: null } })
        .toArray(),
      politicalPartiesCollection<Document>(db)
        .find(
          {
            $or: [
              { chairId: { $ne: null } },
              { viceChairId: { $ne: null } },
              { treasurerId: { $ne: null } },
            ],
          },
          { projection: { name: 1, countryId: 1, chairId: 1, viceChairId: 1, treasurerId: 1 } }
        )
        .toArray(),
      statePartyOrgCollection<Document>(db)
        .find(
          {
            $or: [
              { chairId: { $ne: null } },
              { viceChairId: { $ne: null } },
              { treasurerId: { $ne: null } },
            ],
          },
          {
            projection: {
              countryId: 1,
              stateId: 1,
              partyId: 1,
              chairId: 1,
              viceChairId: 1,
              treasurerId: 1,
            },
          }
        )
        .toArray(),
      caucusesCollection<Document>(db)
        .find(
          { $or: [{ chairId: { $ne: null } }, { viceChairId: { $ne: null } }] },
          { projection: { name: 1, countryId: 1, chairId: 1, viceChairId: 1 } }
        )
        .toArray(),
      centralBanksCollection<Document>(db)
        .find(
          { chairCharacterId: { $ne: null } },
          { projection: { countryId: 1, chairCharacterId: 1, chairAppointedAt: 1 } }
        )
        .toArray(),
      getMilitaryCommandsCollection(db).find({}).toArray(),
      corporationsCollection<Document>(db)
        .find(
          { ceoId: { $ne: null }, ceoType: { $in: [null, "character"] } },
          { projection: { name: 1, ceoId: 1 } }
        )
        .toArray(),
    ]);

  const orgDefs = await loadOrganizationDefsById(
    db,
    orgRows.map((row) => row.organizationId)
  );
  for (const row of orgRows) {
    if (!row.holderCharacterId) continue;
    const def = orgDefs.get(row.organizationId);
    if (!def || def.permanentLeadership) continue;
    posts.push({
      characterId: row.holderCharacterId.toString(),
      key: `org:${row.organizationId}`,
      label: internationalLeaderLabel(def.leadership.title, def.name),
      category: "international",
      since: row.electedAt ?? null,
    });
  }

  for (const leader of leaders) {
    if (!leader.characterId) continue;
    posts.push({
      characterId: leader.characterId.toString(),
      key: `chamber:${leader.role}`,
      label: leadershipRoleLabel(leader.role) ?? leader.role,
      category: "legislative",
      since: leader.electedAt ?? null,
    });
  }

  const partyNames = new Map<string, string>();
  for (const party of parties) {
    const sequentialId = (party as { sequentialId?: number }).sequentialId;
    if (sequentialId !== undefined)
      partyNames.set(`${party.countryId}:${sequentialId}`, party.name);
    for (const [field, title] of LEADERSHIP_FIELDS) {
      const holder = party[field] as ObjectId | null | undefined;
      if (!holder) continue;
      posts.push({
        characterId: holder.toString(),
        key: `party:${party._id.toString()}:${field}`,
        label: `${title}, ${party.name}`,
        category: "party",
        since: null,
      });
    }
  }

  const missingParty = stateOrgs.filter((o) => !partyNames.has(`${o.countryId}:${o.partyId}`));
  if (missingParty.length > 0) {
    const extra = await politicalPartiesCollection<Document>(db)
      .find(
        {
          $or: missingParty.map((o) => ({
            countryId: o.countryId,
            sequentialId: Number(o.partyId),
          })),
        },
        { projection: { name: 1, countryId: 1, sequentialId: 1 } }
      )
      .toArray();
    for (const party of extra)
      partyNames.set(`${party.countryId}:${party.sequentialId}`, party.name);
  }
  for (const org of stateOrgs) {
    const partyName = partyNames.get(`${org.countryId}:${org.partyId}`) ?? "State party";
    for (const [field, title] of LEADERSHIP_FIELDS) {
      const holder = org[field] as ObjectId | null | undefined;
      if (!holder) continue;
      posts.push({
        characterId: holder.toString(),
        key: `stateParty:${org._id.toString()}:${field}`,
        label: `${title}, ${partyName} (${org.stateId})`,
        category: "state_party",
        since: null,
      });
    }
  }

  for (const caucus of caucuses) {
    for (const [field, title] of LEADERSHIP_FIELDS) {
      if (field === "treasurerId") continue;
      const holder = caucus[field] as ObjectId | null | undefined;
      if (!holder) continue;
      posts.push({
        characterId: holder.toString(),
        key: `caucus:${caucus._id.toString()}:${field}`,
        label: `${title}, ${caucus.name}`,
        category: "caucus",
        since: null,
      });
    }
  }

  for (const bank of banks) {
    const holder = bank.chairCharacterId as ObjectId | null;
    if (!holder) continue;
    const country = COUNTRY_CONFIGS[bank.countryId as CountryId];
    posts.push({
      characterId: holder.toString(),
      key: `centralBank:${bank.countryId}`,
      label: `${country?.centralBank.chairTitle ?? "Central bank chair"}, ${country?.centralBank.name ?? bank.countryId}`,
      category: "central_bank",
      since: (bank.chairAppointedAt as Date | null) ?? null,
    });
  }

  for (const doc of commandDocs) {
    const nation = countryName(doc.countryId);
    for (const command of doc.commands ?? []) {
      const lead =
        command.commandingGeneralId === undefined
          ? (command.commanderIds[0] ?? null)
          : command.commandingGeneralId;
      for (const commanderId of new Set(command.commanderIds ?? [])) {
        if (!ObjectId.isValid(commanderId)) continue;
        const isLead = commanderId === lead;
        posts.push({
          characterId: commanderId,
          key: `military:${doc.countryId}:${command.id}:${isLead ? "lead" : "member"}`,
          label: `${isLead ? "Commanding General" : "Commander"}, ${command.name}${nation ? ` (${nation})` : ""}`,
          category: "military",
          since: null,
        });
      }
    }
  }

  for (const corp of corps) {
    posts.push({
      characterId: (corp.ceoId as ObjectId).toString(),
      key: `ceo:${corp._id.toString()}`,
      label: `CEO, ${corp.name}`,
      category: "corporate",
      since: null,
    });
  }

  return posts;
}

/** Make sure the international leadership achievement exists in this world. */
async function ensureInternationalLeaderAchievement(db: Db): Promise<ObjectId | null> {
  const now = new Date();
  await achievementsCollection<Document>(db).updateOne(
    { slug: INTERNATIONAL_LEADER_SLUG },
    { $setOnInsert: { ...INTERNATIONAL_LEADER_ACHIEVEMENT, createdAt: now, updatedAt: now } },
    { upsert: true }
  );
  const def = await achievementsCollection<Document>(db).findOne(
    { slug: INTERNATIONAL_LEADER_SLUG },
    { projection: { _id: 1 } }
  );
  return (def?._id as ObjectId | undefined) ?? null;
}

export interface CareerSyncResult {
  charactersUpdated: number;
  eventsWritten: number;
  achievementsAwarded: number;
}

export async function syncCareerPosts(db: Db, now: Date = new Date()): Promise<CareerSyncResult> {
  const posts = await collectHeldPosts(db);
  const postsByCharacter = new Map<string, HeldPost[]>();
  for (const post of posts) {
    const list = postsByCharacter.get(post.characterId) ?? [];
    list.push(post);
    postsByCharacter.set(post.characterId, list);
  }

  const holderIds = [...postsByCharacter.keys()].map((id) => new ObjectId(id));
  const characters = await charactersCollection<Document>(db)
    .find(
      {
        $or: [
          { _id: { $in: holderIds } },
          { currentOffice: { $ne: null } },
          { "careerPosts.0": { $exists: true } },
        ],
      },
      {
        projection: { userId: 1, countryId: 1, currentOffice: 1, careerPosts: 1, careerHistory: 1 },
      }
    )
    .toArray();

  const officials = await electedOfficialsCollection<Document>(db)
    .find(
      { characterId: { $in: characters.map((c) => c._id as ObjectId) } },
      { projection: { characterId: 1, countryId: 1, officeType: 1, state: 1 } }
    )
    .toArray();
  const officialOffices = new Map<string, HeldPost[]>();
  for (const official of officials) {
    const characterId = (official.characterId as ObjectId).toString();
    const office = { type: official.officeType as string, state: official.state } as OfficeType;
    const list = officialOffices.get(characterId) ?? [];
    list.push({
      characterId,
      key: officeKey(office),
      label: getOfficeLabel(office, official.countryId as CountryId | undefined),
      category: "office",
      since: null,
      office,
    });
    officialOffices.set(characterId, list);
  }

  const writes: AnyBulkWriteOperation<Character>[] = [];
  const newInternationalLeaders: { userId: ObjectId; characterId: ObjectId }[] = [];
  let eventsWritten = 0;

  for (const character of characters) {
    const id = (character._id as ObjectId).toString();
    const held: HeldPost[] = [...(postsByCharacter.get(id) ?? [])];
    const currentOffice = character.currentOffice as OfficeType | null;
    if (currentOffice) {
      held.push({
        characterId: id,
        key: officeKey(currentOffice),
        label: getOfficeLabel(currentOffice, character.countryId as CountryId),
        category: "office",
        since: null,
        office: currentOffice,
      });
    }
    held.push(...(officialOffices.get(id) ?? []));

    const plan = planCareerSync({
      stored: character.careerPosts as CareerPostHolding[] | undefined,
      held,
      history: character.careerHistory as CareerEvent[] | undefined,
      now,
    });
    if (!plan.changed) continue;
    eventsWritten += plan.events.length;
    writes.push({
      updateOne: {
        filter: { _id: character._id as ObjectId },
        update: {
          $set: { careerPosts: plan.next },
          ...(plan.events.length > 0 ? { $push: { careerHistory: { $each: plan.events } } } : {}),
        },
      },
    });
    if (
      character.userId &&
      plan.events.some((e) => e.type === "took_post" && e.postCategory === "international")
    ) {
      newInternationalLeaders.push({
        userId: character.userId as ObjectId,
        characterId: character._id as ObjectId,
      });
    }
  }

  if (writes.length > 0) {
    await charactersCollection(db).bulkWrite(writes, { ordered: false });
  }

  let achievementsAwarded = 0;
  if (newInternationalLeaders.length > 0) {
    const achievementId = await ensureInternationalLeaderAchievement(db);
    if (achievementId) {
      const result = await characterAchievementsCollection<Document>(db).bulkWrite(
        newInternationalLeaders.map(({ userId, characterId }) => ({
          updateOne: {
            filter: { userId, achievementId },
            update: {
              $setOnInsert: {
                _id: new ObjectId(),
                userId,
                characterId,
                achievementId,
                earnedAt: now,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false }
      );
      achievementsAwarded = result.upsertedCount;
      invalidateDefinitionsCache();
      if (achievementsAwarded > 0) invalidateRarityCache();
    }
  }

  return { charactersUpdated: writes.length, eventsWritten, achievementsAwarded };
}
