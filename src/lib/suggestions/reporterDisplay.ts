import { ObjectId, type Db } from "mongodb";
import type { PoliticalParty, User } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { usersCollection } from "@/lib/db/repositories/users";

export interface ReporterDisplay {
  characterName: string | null;
  username: string | null;
  discordUsername: string | null;
  avatarUrl: string | null;
  partyAbbrev: string | null;
  stateCode: string | null;
  countryId: CountryId | null;
}

export async function loadReporterDisplayMap(
  db: Db,
  userIds: (ObjectId | null | undefined)[]
): Promise<Map<string, ReporterDisplay>> {
  const unique = [...new Set(userIds.filter(Boolean).map((id) => id!.toString()))];
  const map = new Map<string, ReporterDisplay>();
  if (unique.length === 0) return map;

  const characters = await charactersCollection(db)
    .find({ userId: { $in: unique.map((id) => new ObjectId(id)) } })
    .toArray();
  const charByUser = new Map(characters.map((c) => [c.userId.toString(), c]));

  const users = await usersCollection(db)
    .find({ _id: { $in: unique.map((id) => new ObjectId(id)) } })
    .project({ username: 1, discordUsername: 1 })
    .toArray();
  const userByStr = new Map(users.map((u) => [u._id.toString(), u]));

  const partyIds = new Set<string>();
  for (const c of characters) {
    if (c.party && c.party !== "independent") partyIds.add(c.party);
  }
  const partyMap = new Map<string, PoliticalParty>();
  if (partyIds.size > 0) {
    const parties = await politicalPartiesCollection(db)
      .find({ sequentialId: { $in: [...partyIds].map(Number) } })
      .toArray();
    for (const p of parties) {
      partyMap.set(`${p.countryId}:${p.sequentialId}`, p);
    }
  }

  for (const idStr of unique) {
    const char = charByUser.get(idStr);
    const user = userByStr.get(idStr);
    let partyAbbrev: string | null = null;
    if (char && char.party && char.party !== "independent") {
      const party = partyMap.get(`${char.countryId}:${char.party}`);
      partyAbbrev = party?.abbreviation?.trim() || party?.name.slice(0, 3).toUpperCase() || null;
    } else if (char?.party === "independent") {
      partyAbbrev = "IND";
    }
    map.set(idStr, {
      characterName: char?.name ?? null,
      username: user?.username ?? null,
      discordUsername: user?.discordUsername ?? null,
      avatarUrl: char?.avatarUrl ?? null,
      partyAbbrev,
      stateCode: char?.homeState?.toUpperCase() ?? null,
      countryId: char?.countryId ?? null,
    });
  }
  return map;
}
