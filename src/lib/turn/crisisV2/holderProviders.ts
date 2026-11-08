import type { Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { OfficeHolders } from "@/lib/crises/v2/accountability";
import type { CrisisRole } from "@/lib/crises/v2/types";
import type { Character, Corporation } from "@/lib/db/types";
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { CongressLeader } from "@/lib/db/types/leadership";
import {
  listCrisisHolderProviders,
  registerCrisisHolderProvider,
  type CrisisHolderContext,
  type CrisisHolderProvider,
} from "./registry";

export const HEAD_OF_STATE_OFFICES = [
  "president",
  "primeMinister",
  "chancellor",
  "taoiseach",
  "premier",
] as const;
export const GOVERNOR_OFFICES = ["governor", "ministerPresident"] as const;

/** Congress posts whose holders speak for the legislature in a crisis. */
export const LEGISLATURE_LEADER_ROLES = [
  "speaker_of_the_house",
  "majority_leader_house",
  "majority_leader_senate",
  "president_pro_tempore",
] as const;

type Draft = Map<string, Partial<Record<CrisisRole, Set<string>>>>;

function add(draft: Draft, countryId: string | undefined, role: CrisisRole, id: unknown): void {
  if (!countryId || id === null || id === undefined) return;
  const roles = draft.get(countryId) ?? {};
  const set = (roles[role] ??= new Set());
  set.add(String(id));
  draft.set(countryId, roles);
}

function finish(draft: Draft): Map<string, OfficeHolders> {
  const result = new Map<string, OfficeHolders>();
  for (const [countryId, roles] of draft) {
    const holders: OfficeHolders = {};
    for (const [role, ids] of Object.entries(roles)) holders[role as CrisisRole] = [...(ids ?? [])];
    result.set(countryId, holders);
  }
  return result;
}

async function loadOfficeCharacters(db: Db, countryIds: string[], draft: Draft): Promise<void> {
  const characters = await db
    .collection<Character>("characters")
    .find(
      {
        countryId: { $in: countryIds as CountryId[] },
        userId: { $exists: true },
        "currentOffice.type": { $in: [...HEAD_OF_STATE_OFFICES, ...GOVERNOR_OFFICES] },
      },
      { projection: { countryId: 1, "currentOffice.type": 1 } }
    )
    .toArray();
  for (const character of characters) {
    const type = character.currentOffice?.type;
    if ((HEAD_OF_STATE_OFFICES as readonly string[]).includes(type ?? "")) {
      add(draft, character.countryId, "headOfState", character._id);
    } else if ((GOVERNOR_OFFICES as readonly string[]).includes(type ?? "")) {
      add(draft, character.countryId, "stateGovernor", character._id);
    }
  }
}

async function loadFormedGovernments(db: Db, countryIds: string[], draft: Draft): Promise<void> {
  const formations = await db
    .collection<{ _id: string; pmCharacterId?: unknown }>("governmentFormations")
    .find(
      { _id: { $in: countryIds }, status: "formed", pmCharacterId: { $ne: null } },
      { projection: { pmCharacterId: 1 } }
    )
    .toArray();
  for (const formation of formations) add(draft, formation._id, "headOfState", formation.pmCharacterId);
}

async function loadCentralBankChairs(db: Db, countryIds: string[], draft: Draft): Promise<void> {
  const banks = await db
    .collection<CentralBank>("centralBanks")
    .find(
      { countryId: { $in: countryIds as CountryId[] }, chairCharacterId: { $ne: null } },
      { projection: { countryId: 1, chairCharacterId: 1 } }
    )
    .toArray();
  for (const bank of banks) add(draft, bank.countryId, "centralBankChair", bank.chairCharacterId);
}

async function loadFinanceMinisters(db: Db, countryIds: string[], draft: Draft): Promise<void> {
  const seatByCountry = new Map<string, string>();
  for (const countryId of countryIds) {
    const seat = COUNTRY_CONFIGS[countryId as CountryId]?.financeMinisterCabinetId;
    if (seat) seatByCountry.set(countryId, seat);
  }
  if (seatByCountry.size === 0) return;
  const members = await db
    .collection<{ countryId: string; positionId: string; characterId: unknown }>("cabinetMembers")
    .find(
      {
        countryId: { $in: [...seatByCountry.keys()] },
        positionId: { $in: [...new Set(seatByCountry.values())] },
        characterId: { $ne: null },
      },
      { projection: { countryId: 1, positionId: 1, characterId: 1 } }
    )
    .toArray();
  for (const member of members) {
    if (seatByCountry.get(member.countryId) === member.positionId) {
      add(draft, member.countryId, "financeMinister", member.characterId);
    }
  }
}

async function loadLegislatureLeaders(db: Db, countryIds: string[], draft: Draft): Promise<void> {
  const leaders = await db
    .collection<CongressLeader>("congressLeaders")
    .find(
      { role: { $in: [...LEGISLATURE_LEADER_ROLES] }, characterId: { $ne: null } },
      { projection: { characterId: 1 } }
    )
    .toArray();
  const ids = leaders.flatMap((leader) => (leader.characterId ? [leader.characterId] : []));
  if (ids.length === 0) return;
  const characters = await db
    .collection<Character>("characters")
    .find(
      { _id: { $in: ids }, countryId: { $in: countryIds as CountryId[] } },
      { projection: { countryId: 1 } }
    )
    .toArray();
  for (const character of characters) {
    add(draft, character.countryId, "legislature", character._id);
  }
}

async function loadPartyLeaders(db: Db, countryIds: string[], draft: Draft): Promise<void> {
  const parties = await db
    .collection<{ countryId: string; chairId: unknown }>("politicalParties")
    .find(
      { countryId: { $in: countryIds }, chairId: { $ne: null } },
      { projection: { countryId: 1, chairId: 1 } }
    )
    .toArray();
  for (const party of parties) add(draft, party.countryId, "partyLeader", party.chairId);
}

async function loadCorporateCeos(db: Db, countryIds: string[], draft: Draft): Promise<void> {
  const corporations = await db
    .collection<Corporation>("corporations")
    .find(
      {
        countryId: { $in: countryIds as CountryId[] },
        ceoType: { $nin: ["npp", "imperial"] },
      },
      { projection: { countryId: 1, ceoId: 1 } }
    )
    .toArray();
  for (const corporation of corporations) {
    add(draft, corporation.countryId, "corpCeo", corporation.ceoId);
  }
}

/**
 * Office holders for every crisis role, per country, in a handful of batched
 * reads. A role with no sitting player holder is simply absent.
 */
export const officeHolderProvider: CrisisHolderProvider = {
  id: "offices",
  async load(ctx: CrisisHolderContext) {
    const countryIds = [...ctx.countryIds];
    const draft: Draft = new Map();
    if (countryIds.length === 0) return finish(draft);
    await Promise.all([
      loadOfficeCharacters(ctx.db, countryIds, draft),
      loadFormedGovernments(ctx.db, countryIds, draft),
      loadCentralBankChairs(ctx.db, countryIds, draft),
      loadFinanceMinisters(ctx.db, countryIds, draft),
      loadLegislatureLeaders(ctx.db, countryIds, draft),
      loadPartyLeaders(ctx.db, countryIds, draft),
      loadCorporateCeos(ctx.db, countryIds, draft),
    ]);
    return finish(draft);
  },
};

/** Registers the built-in holder provider if missing. Safe to call every turn. */
export function ensureBuiltinCrisisHolderProviders(): void {
  if (!listCrisisHolderProviders().some((p) => p.id === officeHolderProvider.id)) {
    registerCrisisHolderProvider(officeHolderProvider);
  }
}
