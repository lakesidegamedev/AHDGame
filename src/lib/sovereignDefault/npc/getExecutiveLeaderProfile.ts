/**
 * Resolve a country's executive leader profile for the NPC scoring algorithm.
 *
 * Strategy:
 *   1. Find the country's executive office types (`isExecutive: true,
 *      isSubNational: false`) in country config order — earlier entries win
 *      ties (US: president before vicePresident).
 *   2. Look first for a player Character holding any executive office.
 *   3. Else look for an NPP holding the office.
 *   4. Else return centrist + democracy (per design Section 6.7 fallback).
 *
 * Ideology derivation: AHD's PolicyPositions { economic, social } numeric axes
 * map to one of six discrete buckets via `deriveIdeology`. Government type:
 * AHD only has presidential/parliamentary, both democracies. The Npc
 * "authoritarian"/"hybrid" buckets are reserved for future regime types.
 */

import type { Db, ObjectId } from "mongodb";
import { COUNTRY_CONFIGS, getCountryConfig, type CountryId } from "@/lib/constants/countries";
import type { NpcGovernmentType } from "./npcConstants";
import type { NpcExecutiveProfile } from "./types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { nppsCollection } from "@/lib/db/repositories/npps";

import { deriveIdeology } from "./rules/ideology";
export { deriveIdeology } from "./rules/ideology";

export function deriveGovernmentType(countryCode: CountryId): NpcGovernmentType {
  const config = COUNTRY_CONFIGS[countryCode];
  if (!config) return "democracy";
  // AHD currently maps both presidential and parliamentary to democracy. The
  // hybrid/authoritarian buckets are placeholders for future regime types.
  return "democracy";
}

function getExecutiveOfficeKeys(countryCode: CountryId): string[] {
  const config = getCountryConfig(countryCode);
  return config.officeTypes
    .filter((cfg) => cfg.isExecutive && !cfg.isSubNational)
    .map((cfg) => cfg.key);
}

export async function getExecutiveLeaderProfile(
  db: Db,
  countryCode: CountryId
): Promise<NpcExecutiveProfile> {
  const execKeys = getExecutiveOfficeKeys(countryCode);
  const governmentType = deriveGovernmentType(countryCode);
  if (execKeys.length === 0) {
    return { characterId: null, ideology: "centrist", governmentType, kind: "none" };
  }

  // Player Character first. We restrict to live (not retired) characters by
  // requiring `currentOffice.type` to be one of the executive keys.
  const character = await charactersCollection(db).findOne({
    countryId: countryCode,
    "currentOffice.type": { $in: execKeys },
  });
  if (character) {
    return {
      characterId: character._id,
      ideology: deriveIdeology(character.policies),
      governmentType,
      kind: "player",
    };
  }

  // Else NPP holding the executive office. NPP `currentOffice` mirrors
  // Character's `OfficeType` discriminated union (per npp.ts), so we filter
  // on the `type` discriminant to match across all variants.
  const npp = await nppsCollection(db).findOne(
    {
      countryId: countryCode,
      "currentOffice.type": { $in: execKeys },
      retiredAt: null,
    } as never,
    { projection: { _id: 1, policies: 1 } }
  );
  if (npp) {
    return {
      characterId: npp._id as ObjectId,
      ideology: deriveIdeology(npp.policies),
      governmentType,
      kind: "npp",
    };
  }

  return { characterId: null, ideology: "centrist", governmentType, kind: "none" };
}
