import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getCorporateSectorsCollection } from "@/lib/db/collections/corporateSectors";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getPoliticalPartiesCollection } from "@/lib/db/collections/politicalParties";
import { ObjectId, type Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { OfficeHolders } from "@/lib/crises/v2/accountability";
import type { HolderFootprint } from "@/lib/crises/v2/exposure";
import type { CrisisRole } from "@/lib/crises/v2/types";
import type { CongressLeader } from "@/lib/db/types/leadership";
import {
  listCrisisHolderProviders,
  registerCrisisHolderProvider,
  type CrisisHolderContext,
  type CrisisHolderProvider,
} from "./registry";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { governmentFormationsCollection } from "@/lib/db/repositories/governmentFormations";

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
  const characters = await (
    await getCharactersCollection(db)
  )
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
  const formations = await governmentFormationsCollection<{ _id: string; pmCharacterId?: unknown }>(db)
    .find(
      { _id: { $in: countryIds }, status: "formed", pmCharacterId: { $ne: null } },
      { projection: { pmCharacterId: 1 } }
    )
    .toArray();
  for (const formation of formations)
    add(draft, formation._id, "headOfState", formation.pmCharacterId);
}

async function loadCentralBankChairs(db: Db, countryIds: string[], draft: Draft): Promise<void> {
  const banks = await centralBanksCollection(db)
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
  const characters = await (
    await getCharactersCollection(db)
  )
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
  const parties = await (
    await getPoliticalPartiesCollection(db)
  )
    .find(
      { countryId: { $in: countryIds as CountryId[] }, chairId: { $ne: null } },
      { projection: { countryId: 1, chairId: 1 } }
    )
    .toArray();
  for (const party of parties) add(draft, party.countryId, "partyLeader", party.chairId);
}

async function loadCorporateCeos(db: Db, countryIds: string[], draft: Draft): Promise<void> {
  const corporations = await (
    await getCorporationsCollection(db)
  )
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

function toObjectIds(ids: readonly string[]): ObjectId[] {
  return ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
}

/** The state each governor runs and the states and sectors each CEO operates in. */
export async function loadHolderFootprints(
  db: Db,
  holderIds: readonly string[]
): Promise<Map<string, HolderFootprint>> {
  const footprints = new Map<string, HolderFootprint>();
  const ids = toObjectIds(holderIds);
  if (ids.length === 0) return footprints;

  const [governors, corporations] = await Promise.all([
    (await getCharactersCollection(db))
      .find(
        { _id: { $in: ids }, "currentOffice.type": { $in: [...GOVERNOR_OFFICES] } },
        { projection: { currentOffice: 1 } }
      )
      .toArray(),
    (await getCorporationsCollection(db))
      .find(
        { ceoId: { $in: ids }, ceoType: { $nin: ["npp", "imperial"] } },
        { projection: { ceoId: 1 } }
      )
      .toArray(),
  ]);
  for (const governor of governors) {
    const office = governor.currentOffice as { state?: string } | null;
    if (office?.state) footprints.set(governor._id.toString(), { stateId: office.state });
  }

  const ceoByCorporation = new Map<string, string>();
  for (const corporation of corporations) {
    if (corporation.ceoId)
      ceoByCorporation.set(corporation._id.toString(), corporation.ceoId.toString());
  }
  if (ceoByCorporation.size === 0) return footprints;
  const sectors = await (
    await getCorporateSectorsCollection(db)
  )
    .find(
      { corporationId: { $in: corporations.map((corporation) => corporation._id) } },
      { projection: { corporationId: 1, stateId: 1, sectorType: 1 } }
    )
    .toArray();
  for (const sector of sectors) {
    const ceo = ceoByCorporation.get(sector.corporationId.toString());
    if (!ceo) continue;
    const footprint = footprints.get(ceo) ?? {};
    footprints.set(ceo, {
      ...footprint,
      holdings: [
        ...(footprint.holdings ?? []),
        { stateId: sector.stateId, sectorType: sector.sectorType },
      ],
    });
  }
  return footprints;
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
  loadFootprints: ({ db, holderIds }) => loadHolderFootprints(db, holderIds),
};

/** Registers the built-in holder provider if missing. Safe to call every turn. */
export function ensureBuiltinCrisisHolderProviders(): void {
  if (!listCrisisHolderProviders().some((p) => p.id === officeHolderProvider.id)) {
    registerCrisisHolderProvider(officeHolderProvider);
  }
}
