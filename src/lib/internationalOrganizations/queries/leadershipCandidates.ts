import type { Db } from "mongodb";
import { FOREIGN_AFFAIRS_POSITION_BY_COUNTRY } from "@/lib/constants/internationalOrganizations";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { loadOrganizationDef } from "@/lib/internationalOrganizations/service";
import { votingMembers } from "@/lib/internationalOrganizations/orgMembership";
import { getCabinetMembersCollection } from "@/lib/db/collections/cabinetMembers";
import { getHeadOfGovernmentCharacterId } from "@/lib/api/headOfGovernment";
import { getCountryState } from "@/lib/countryState";
import { charactersCollection } from "@/lib/db/repositories/characters";

interface CandidatePick {
  characterId: string;
  characterName: string;
  countryId: CountryId;
  roleLabel: string;
}

export async function loadOrganizationLeadershipCandidates(params: { db: Db; orgId: string }) {
  const { db, orgId } = params;
  const def = await loadOrganizationDef(db, orgId);
  if (!def) {
    return { ok: false as const, status: 400, error: "Unknown organization" };
  }
  // Permanent-leadership orgs hold no elections — nobody is nominable.
  if (def.permanentLeadership) {
    return { ok: true as const, body: { candidates: [] as CandidatePick[] } };
  }

  // Candidate pool is the voting roll (player-enabled countries);
  // macro members are excluded since they have no cabinet. The
  // COUNTRY_CONFIGS guard defends against stale rows for unmodeled countries.
  const members = (await votingMembers(db, orgId)).filter(
    (id): id is CountryId => id in COUNTRY_CONFIGS
  );
  const seen = new Set<string>();
  const candidates: CandidatePick[] = [];
  const cabinetCol = getCabinetMembersCollection(db);

  for (const memberCountry of members) {
    const foreignMinisterPositionId = FOREIGN_AFFAIRS_POSITION_BY_COUNTRY[memberCountry];
    if (foreignMinisterPositionId) {
      const foreignMinister = await cabinetCol.findOne({
        countryId: memberCountry,
        positionId: foreignMinisterPositionId,
      });
      // NPP-held foreign-minister seats have no character → not a character
      // candidate for org leadership; skip them.
      if (foreignMinister?.characterId && !seen.has(foreignMinister.characterId.toString())) {
        seen.add(foreignMinister.characterId.toString());
        candidates.push({
          characterId: foreignMinister.characterId.toString(),
          characterName: foreignMinister.characterName,
          countryId: memberCountry,
          roleLabel: "Foreign Minister",
        });
      }
    }

    const headOfGovernmentCharacterId = await getHeadOfGovernmentCharacterId(db, memberCountry);
    if (!headOfGovernmentCharacterId) continue;

    const id = headOfGovernmentCharacterId.toString();
    if (seen.has(id)) continue;
    seen.add(id);
    const character = await charactersCollection(db).findOne(
      { _id: headOfGovernmentCharacterId },
      { projection: { name: 1 } }
    );
    // Read runtime governmentType so a converted country (Stage-4 collapse,
    // convention ratification) gets the correct head-of-government label.
    const isPresidential =
      (await getCountryState(db, memberCountry)).governmentType === "presidential";
    candidates.push({
      characterId: id,
      characterName: character?.name ?? "Unknown",
      countryId: memberCountry,
      roleLabel: isPresidential ? "President" : "Prime Minister",
    });
  }

  candidates.sort((left, right) => {
    const countryNameSort = COUNTRY_CONFIGS[left.countryId].name.localeCompare(
      COUNTRY_CONFIGS[right.countryId].name
    );
    if (countryNameSort !== 0) return countryNameSort;
    return left.characterName.localeCompare(right.characterName);
  });

  return { ok: true as const, body: { candidates } };
}
